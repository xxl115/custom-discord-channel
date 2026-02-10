// src/channel.ts
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { DiscordGateway } from './gateway.js';
import { DiscordConfig, DiscordAccount } from './types.js';

let gateway: DiscordGateway | null = null;
let runtime: any = null;

export function setCustomDiscordRuntime(rt: any) {
  runtime = rt;
}

export const customDiscordPlugin = {
  id: 'discord-custom',
  name: 'Discord (Custom)',
  description: 'Discord channel with proxy support',

  async register(api: OpenClawPluginApi) {
    console.log('[CustomDiscord] Registering channel...');

    // 获取配置
    const config = api.getConfig();
    const discordConfig = config.channels?.['discord-custom'] || {};

    if (!discordConfig.enabled) {
      console.log('[CustomDiscord] Channel disabled');
      return;
    }

    // 获取token
    const token = discordConfig.token || process.env.DISCORD_BOT_TOKEN;
    if (!token) {
      console.error('[CustomDiscord] No token configured');
      return;
    }

    // 获取代理配置
    const proxyUrl = discordConfig.proxy?.enabled
      ? discordConfig.proxy.url
      : null;

    console.log('[CustomDiscord] Token configured:', token.substring(0, 20) + '...');
    console.log('[CustomDiscord] Proxy:', proxyUrl || 'disabled');

    // 创建Gateway
    gateway = new DiscordGateway(token, proxyUrl);

    // 注册事件处理器
    gateway.on('READY', handleReady);
    gateway.on('MESSAGE_CREATE', handleMessage);

    // 连接Gateway
    try {
      await gateway.connect();
      console.log('[CustomDiscord] Connected successfully');

      // 注册channel到OpenClaw
      api.registerChannel({
        plugin: customDiscordPlugin,
        account: {
          accountId: 'default',
          token,
          name: discordConfig.name || 'Discord',
          enabled: true,
          configured: true,
          proxy: discordConfig.proxy
        }
      });

    } catch (e) {
      console.error('[CustomDiscord] Connection failed:', e);
    }
  }
};

async function handleReady(event: any) {
  console.log('[CustomDiscord] Bot ready:', event.d?.user?.username);
}

async function handleMessage(event: any) {
  const message = event.d;

  // 忽略机器人自己的消息
  if (message.author?.bot && !message.webhook_id) {
    return;
  }

  console.log('[CustomDiscord] Message from', message.author?.username, ':', message.content?.substring(0, 50));

  // 转发到OpenClaw处理
  // 这里需要调用OpenClaw的消息处理接口
}

export function sendMessage(channelId: string, content: string) {
  if (!gateway) {
    console.error('[CustomDiscord] Gateway not connected');
    return;
  }

  // 发送REST API请求
  // 这里实现消息发送逻辑
}
