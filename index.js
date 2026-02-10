/**
 * OpenClaw Discord Custom Channel Plugin
 * 自定义Discord Channel，支持代理配置
 */

import { initializeChannelPlugin } from './src/channel.js';
import { DiscordAPI } from './src/api.js';
import { DiscordGateway } from './src/gateway.js';

const plugin = {
  id: 'discord-custom',
  name: 'Discord (Custom)',
  version: '1.0.0',
  description: 'Discord channel with full proxy support - custom implementation',

  // OpenClaw Plugin API
  async register(api) {
    console.log('[discord-custom] Registering plugin...');

    const channel = await initializeChannelPlugin();
    await channel.register(api);

    // 暴露API
    api.discordCustom = channel;

    console.log('[discord-custom] Plugin registered');
  },

  // Channel capabilities
  capabilities: {
    chatTypes: ['direct', 'channel', 'thread'],
    polls: true,
    reactions: true,
    threads: true,
    media: true,
    nativeCommands: true
  },

  // 配置Schema
  configSchema: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', default: true },
      token: { type: 'string', description: 'Discord bot token' },
      proxy: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean', default: true },
          url: { type: 'string', default: 'socks5://127.0.0.1:7891' }
        }
      },
      intents: { type: 'number', default: 513 },
      dm: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean', default: true },
          policy: { type: 'string', enum: ['open', 'pairing', 'allowlist', 'disabled'], default: 'pairing' },
          allowFrom: { type: 'array', items: { type: 'string' }, default: ['*'] }
        }
      }
    },
    required: ['token']
  }
};

export default plugin;

// 导出类和函数供外部使用
export { DiscordGateway, DiscordAPI };
