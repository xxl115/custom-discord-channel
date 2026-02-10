/**
 * Discord Channel Plugin for OpenClaw
 * 自定义实现，支持代理配置
 */

import { DiscordGateway } from './gateway.js';
import { DiscordAPI } from './api.js';

// 全局状态
let api = null;
let gateway = null;
let config = null;
let openclawApi = null;
let isReady = false;
let messageQueue = [];
let reconnectTimer = null;

export function initializeChannelPlugin() {
  return {
    id: 'discord-custom',
    name: 'Discord (Custom)',
    description: 'Discord channel with full proxy support',

    async register(api) {
      console.log('[Discord-Plugin] Initializing...');
      openclawApi = api;

      // 获取配置
      const cfg = api.getConfig();
      config = {
        enabled: cfg.channels?.['discord-custom']?.enabled ?? true,
        token: cfg.channels?.['discord-custom']?.token || process.env.DISCORD_BOT_TOKEN,
        proxy: cfg.channels?.['discord-custom']?.proxy || {
          enabled: process.env.DISCORD_PROXY_ENABLED === 'true',
          url: process.env.DISCORD_PROXY_URL || 'socks5://127.0.0.1:7891'
        }
      };

      if (!config.enabled) {
        console.log('[Discord-Plugin] Disabled in config');
        return;
      }

      if (!config.token) {
        console.error('[Discord-Plugin] No token configured');
        return;
      }

      console.log('[Discord-Plugin] Token:', config.token.substring(0, 20) + '...');
      console.log('[Discord-Plugin] Proxy:', config.proxy.enabled ? config.proxy.url : 'disabled');

      // 创建API和Gateway
      api = new DiscordAPI(config.token, config.proxy.enabled ? config.proxy.url : null);
      gateway = new DiscordGateway(config.token, config.proxy.enabled ? config.proxy.url : null);

      // 注册事件处理器
      gateway.on('READY', handleReady);
      gateway.on('MESSAGE_CREATE', handleMessage);
      gateway.on('GUILD_CREATE', handleGuild);

      // 开始连接
      await connect();
    },

    async sendMessage(target, content, options = {}) {
      if (!api) {
        throw new Error('Discord API not initialized');
      }

      const channelId = extractChannelId(target);
      if (!channelId) {
        throw new Error('Invalid target format');
      }

      return await api.sendMessage(channelId, content, options);
    },

    async getMessage(channelId, messageId) {
      return await api.getMessage(channelId, messageId);
    },

    async deleteMessage(channelId, messageId) {
      return await api.deleteMessage(channelId, messageId);
    },

    async addReaction(channelId, messageId, emoji) {
      return await api.addReaction(channelId, messageId, emoji);
    },

    async removeReaction(channelId, messageId, emoji) {
      return await api.removeReaction(channelId, messageId, emoji);
    },

    getStatus() {
      return {
        connected: isReady,
        proxy: config?.proxy?.enabled ? config.proxy.url : 'disabled',
        messageQueue: messageQueue.length
      };
    }
  };
}

// 连接Gateway
async function connect() {
  if (!gateway) {
    console.error('[Discord-Plugin] Gateway not initialized');
    return;
  }

  try {
    await gateway.connect();
    console.log('[Discord-Plugin] Connected successfully');
  } catch (e) {
    console.error('[Discord-Plugin] Connection failed:', e.message);

    // 指数退避重连
    const delay = Math.min(1000 * Math.pow(2, reconnectTimer?.attempts || 0), 30000);
    reconnectTimer = reconnectTimer || { attempts: 0 };
    reconnectTimer.attempts++;

    console.log(`[Discord-Plugin] Reconnecting in ${delay}ms (attempt ${reconnectTimer.attempts})`);

    reconnectTimer.timer = setTimeout(async () => {
      await connect();
    }, delay);
  }
}

// 处理READY事件
function handleReady(event) {
  console.log('[Discord-Plugin] Bot ready:', event.d?.user?.username);
  isReady = true;
  reconnectTimer = { attempts: 0 };

  // 通知OpenClaw
  if (openclawApi) {
    openclawApi.log?.('[Discord-Plugin] Connected and ready');
  }

  // 处理积压消息
  processMessageQueue();
}

// 处理消息
function handleMessage(event) {
  const message = event.d;

  // 忽略机器人消息
  if (message.author?.bot && !message.webhook_id) {
    return;
  }

  console.log('[Discord-Plugin] Message from', message.author?.username, ':', message.content?.substring(0, 50));

  // 转发到OpenClaw处理
  if (openclawApi) {
    openclawApi.handleMessage?.({
      channel: 'discord-custom',
      id: message.id,
      channelId: message.channel_id,
      guildId: message.guild_id,
      content: message.content,
      author: {
        id: message.author.id,
        username: message.author.username,
        discriminator: message.author.discriminator
      },
      timestamp: message.timestamp,
      mentions: message.mentions
    });
  }
}

// 处理Guild创建
function handleGuild(event) {
  console.log('[Discord-Plugin] Guild:', event.d?.name);
}

// 提取channel ID
function extractChannelId(target) {
  // 格式: "channel:<id>" 或直接是数字ID
  if (typeof target === 'string') {
    if (target.startsWith('channel:')) {
      return target.replace('channel:', '');
    }
    // 检查是否是纯数字
    if (/^\d+$/.test(target)) {
      return target;
    }
  }
  return null;
}

// 消息队列
function queueMessage(target, content, options) {
  messageQueue.push({ target, content, options, timestamp: Date.now() });
}

function processMessageQueue() {
  while (messageQueue.length > 0) {
    const msg = messageQueue.shift();
    try {
      api.sendMessage(msg.target, msg.content, msg.options);
      console.log('[Discord-Plugin] Queued message sent');
    } catch (e) {
      console.error('[Discord-Plugin] Failed to send queued message:', e.message);
    }
  }
}

// 辅助函数：发送消息到OpenClaw
export function createMessageHandler(openclawHandler) {
  return async (event) => {
    const message = event.d;
    await openclawHandler({
      provider: 'discord-custom',
      id: message.id,
      channelId: message.channel_id,
      guildId: message.guild_id,
      content: message.content,
      author: {
        id: message.author.id,
        username: message.author.username,
        discriminator: message.author.discriminator
      },
      timestamp: message.timestamp,
      mentions: message.mentions,
      attachments: message.attachments,
      embeds: message.embeds
    });
  };
}
