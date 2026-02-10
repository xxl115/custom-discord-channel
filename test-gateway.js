/**
 * Discord Gateway 测试
 * 使用环境变量配置TOKEN和代理
 */

import { DiscordGateway } from './src/gateway.js';

// 从环境变量读取配置
const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
const PROXY_URL = process.env.DISCORD_PROXY_URL || 'socks5://127.0.0.1:7891';
const USE_PROXY = process.env.DISCORD_PROXY_ENABLED !== 'false';

if (!DISCORD_TOKEN) {
  console.error('❌ 请设置 DISCORD_BOT_TOKEN 环境变量');
  console.log('\n使用方法:');
  console.log('  export DISCORD_BOT_TOKEN=your_bot_token_here');
  console.log('  export DISCORD_PROXY_URL=socks5://127.0.0.1:7891');
  console.log('  node test-gateway.js\n');
  process.exit(1);
}

console.log('='.repeat(60));
console.log('Discord Gateway 测试');
console.log('='.repeat(60));
console.log(`Token: ${DISCORD_TOKEN.substring(0, 20)}...`);
console.log(`Proxy: ${USE_PROXY ? PROXY_URL : 'DIRECT'}`);
console.log('='.repeat(60));

const gateway = new DiscordGateway(DISCORD_TOKEN, USE_PROXY ? PROXY_URL : null);

gateway.on('READY', (event) => {
  console.log('\n' + '='.repeat(60));
  console.log('🎉 READY! Bot connected successfully!');
  console.log('='.repeat(60));
  console.log(`User: ${event.d?.user?.username}#${event.d?.user?.discriminator}`);
  console.log(`Session ID: ${event.d?.session_id}`);
  console.log(`Guilds: ${event.d?.guilds?.length || 0}`);
});

gateway.on('MESSAGE_CREATE', (event) => {
  console.log(`\n📩 Message from ${event.d?.author?.username}: ${event.d?.content?.substring(0, 50)}`);
});

gateway.on('GUILD_CREATE', (event) => {
  console.log(`\n🏠 Joined guild: ${event.d?.name}`);
});

gateway.connect()
  .then(() => {
    console.log('\n✅ Connected, waiting for events...\n');
  })
  .catch((err) => {
    console.error('\n❌ Connection failed:', err.message);
    process.exit(1);
  });

process.on('SIGINT', () => {
  console.log('\n👋 Disconnecting...');
  gateway.disconnect();
  process.exit(0);
});

setTimeout(() => {
  console.log('\n✅ Test completed successfully!');
  gateway.disconnect();
  process.exit(0);
}, 60000);
