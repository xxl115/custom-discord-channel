// index.ts - OpenClaw Plugin Entry Point
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { customDiscordPlugin } from './src/channel.js';

const plugin = {
  id: 'discord-custom',
  name: 'Discord (Custom)',
  description: 'Discord channel with proxy support - custom implementation',

  register(api: OpenClawPluginApi) {
    console.log('[discord-custom] Plugin registering...');
    return customDiscordPlugin.register(api);
  }
};

export default plugin;
