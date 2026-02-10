# Custom Discord Channel for OpenClaw

自定义Discord Channel实现，支持完整代理配置。

## 测试结果

```
🎯 Discord Channel 完整功能测试
============================================================
Gateway连接:    ✅
发送消息:       ✅
获取消息:       ✅
添加Reaction:   ✅
稳定性测试:     ✅ 2分钟0次断开
============================================================
```

## 功能特性

| 功能 | 状态 | 说明 |
|------|------|------|
| WebSocket Gateway | ✅ | 支持SOCKS5/HTTP代理 |
| 消息发送 | ✅ | REST API |
| 消息接收 | ✅ | WebSocket事件 |
| Reaction | ✅ | 添加/删除 |
| 代理配置 | ✅ | 环境变量/配置文件 |
| 自动重连 | ✅ | 指数退避 |

---

## 目录

- [背景与动机](#背景与动机)
- [问题描述](#问题描述)
- [根本原因](#根本原因)
- [解决方案](#解决方案)
- [架构设计](#架构设计)
- [安装](#安装)
- [配置](#配置)
- [API参考](#api参考)
- [测试](#测试)
- [文件结构](#文件结构)
- [故障排除](#故障排除)
- [性能优化](#性能优化)
- [未来改进](#未来改进)
- [参考](#参考)

---

## 背景与动机

### 问题描述

OpenClaw内置的Discord Channel使用`@buape/carbon`包，该包在创建WebSocket连接时不支持代理配置。

**症状**：
- ✅ 定时任务发送消息正常（REST API）
- ❌ WebSocket连接持续断开（1006错误）
- ❌ 无法实时接收Discord消息
- ❌ 机器人状态显示离线

**日志表现**：
```
discord gateway error: AggregateError
discord gateway: WebSocket connection closed with code 1006
discord gateway: Reconnecting with backoff: 30000ms
```

### 根本原因

1. **@buape/carbon包不支持代理配置**
   ```javascript
   // @buape/carbon源码
   createWebSocket(url) {
       return new WebSocket(url);  // ❌ 没有配置代理agent
   }
   ```

2. **国内网络环境限制**
   - 无法直连Discord（超时）
   - 必须通过代理访问
   - Cloudflare Workers代理WebSocket不稳定

3. **OpenClaw更新覆盖问题**
   - 每次更新OpenClaw都需要重新修改源码
   - 外部npm包不接受外部传入的代理配置

### 解决方案

实现一个自定义的Discord Channel Plugin，完全控制WebSocket连接和代理配置。

**优势**：
- ✅ 支持SOCKS5/HTTP代理
- ✅ WebSocket稳定性大幅提升（0次断开）
- ✅ 独立维护，不受OpenClaw更新影响
- ✅ 完全控制连接行为

---

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenClaw Core                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────────────────┐  │
│  │ Channel Plugin  │───>│  Custom Discord Channel    │  │
│  │   Registry      │    │  (本项目)                   │  │
│  └─────────────────┘    └─────────────────────────────┘  │
│                            │                               │
│             ┌──────────────┼──────────────┐              │
│             ▼              ▼              ▼              │
│        ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│        │ Gateway   │  │ REST API │  │  Message     │   │
│        │(WebSocket)│  │          │  │  Handler     │   │
│        └──────────┘  └──────────┘  └──────────────┘   │
│                            │                               │
│             ┌──────────────┼──────────────┐              │
│             ▼              ▼              ▼              │
│        ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│        │  SOCKS5  │  │  HTTP    │  │   Discord   │   │
│        │  Proxy   │  │  Proxy   │  │    API      │   │
│        └──────────┘  └──────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 核心组件

| 组件 | 文件 | 职责 |
|------|------|------|
| Gateway | `src/gateway.js` | WebSocket连接管理、心跳、重连 |
| API | `src/api.js` | Discord REST API调用封装 |
| Channel | `src/channel.js` | OpenClaw Plugin集成 |

### 数据流

```
用户消息 ──> Discord ──> WebSocket Gateway ──> Message Handler
                │
                ├──> Heartbeat (每41秒)
                │
                └──> REST API Response
```

---

## 安装

### 环境要求

- Node.js 18+
- npm 或 yarn
- 已配置的mihomo代理（SOCKS5端口）
- Discord Bot Token

### 步骤

```bash
# 1. 进入项目目录
cd /home/young/code/custom-discord-channel

# 2. 安装依赖
npm install

# 3. 创建OpenClaw扩展目录
mkdir -p ~/.openclaw/extensions

# 4. 创建符号链接
ln -sf $(pwd)/index.js ~/.openclaw/extensions/discord-custom.js

# 5. 配置mihomo添加SOCKS5端口
# 编辑 /home/young/clash-meta.yaml
port: 7890
socks-port: 7891  # 添加这行

# 6. 重启mihomo
pkill -HUP mihomo

# 7. 重启OpenClaw
~/bin/ocw
```

### 验证安装

```bash
# 运行测试
node test-gateway.js
```

**预期输出**：
```
============================================================
Discord Gateway 测试
============================================================
Token: MTQ2ODQ4NTExNTM1NjM4...
Proxy: socks5://127.0.0.1:7891
============================================================
[Gateway] Using SOCKS5 proxy
[Gateway] WebSocket connected
[Gateway] HELLO - heartbeat: 41250
[Gateway] IDENTIFY sent
🎉 READY! Bot connected successfully!
User: 小白龙#3430
```

---

## 配置

### 方式1：环境变量

```bash
# 必填
export DISCORD_BOT_TOKEN=your_bot_token_here

# 可选
export DISCORD_PROXY_ENABLED=true
export DISCORD_PROXY_URL=socks5://127.0.0.1:7891
export DISCORD_INTENTS=513
```

### 方式2：OpenClaw配置文件

编辑 `~/.openclaw/openclaw.json`：

```json5
{
  "channels": {
    "discord-custom": {
      "enabled": true,
      "token": "YOUR_BOT_TOKEN_HERE",
      "proxy": {
        "enabled": true,
        "url": "socks5://127.0.0.1:7891"
      },
      "intents": 513,
      "dm": {
        "enabled": true,
        "policy": "pairing"
      },
      "guilds": {
        "YOUR_GUILD_ID": {
          "enabled": true,
          "channels": {
            "YOUR_CHANNEL_ID": {
              "enabled": true,
              "requireMention": true
            }
          }
        }
      }
    }
  }
}
```

### 配置项说明

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enabled` | boolean | true | 是否启用 |
| `token` | string | - | Discord Bot Token（必填） |
| `proxy.enabled` | boolean | true | 是否启用代理 |
| `proxy.url` | string | socks5://127.0.0.1:7891 | 代理地址 |
| `intents` | number | 513 | Gateway Intents |
| `dm.enabled` | boolean | true | 是否启用DM |
| `dm.policy` | string | "pairing" | DM策略 |

### Gateway Intents

```javascript
// Intents位掩码
const INTENTS = {
  GUILDS: 1 << 0,              // 1
  GUILD_MEMBERS: 1 << 1,       // 2
  GUILD_MODERATION: 1 << 2,   // 4
  GUILD_MESSAGES: 1 << 9,     // 512
  DIRECT_MESSAGES: 1 << 12,   // 4096
  MESSAGE_CONTENT: 1 << 15,   // 32768
};

// 默认值 513 = 1 | 512 (GUILDS + GUILD_MESSAGES)
```

---

## API参考

### DiscordGateway类

```javascript
import { DiscordGateway } from './src/gateway.js';

const gateway = new DiscordGateway(token, proxyUrl);
```

#### 构造函数

```javascript
new DiscordGateway(token, proxyUrl)
```

| 参数 | 类型 | 说明 |
|------|------|------|
| token | string | Discord Bot Token |
| proxyUrl | string | 代理URL，可选 |

#### 方法

##### connect()

连接到Discord Gateway。

```javascript
await gateway.connect();
```

**返回**: Promise<void>

**抛出**: Error - 连接失败

##### disconnect()

断开连接。

```javascript
gateway.disconnect();
```

##### send(op, d)

发送WebSocket帧。

```javascript
gateway.send(1, null);  // Heartbeat
gateway.send(2, payload);  // IDENTIFY
```

| 参数 | 类型 | 说明 |
|------|------|------|
| op | number | Opcode |
| d | any | Payload数据 |

#### 事件

##### 'READY'

Bot连接就绪。

```javascript
gateway.on('READY', (event) => {
  console.log('User:', event.d.user.username);
  console.log('Session ID:', event.d.session_id);
  console.log('Guilds:', event.d.guilds?.length);
});
```

**event.d**:
- `user`: 用户信息
- `session_id`: 会话ID
- `guilds`: 服务器列表

##### 'MESSAGE_CREATE'

收到新消息。

```javascript
gateway.on('MESSAGE_CREATE', (event) => {
  console.log('From:', event.d.author.username);
  console.log('Content:', event.d.content);
  console.log('Channel:', event.d.channel_id);
});
```

**event.d**:
- `id`: 消息ID
- `channel_id`: 频道ID
- `guild_id`: 服务器ID（DM为undefined）
- `content`: 消息内容
- `author`: 作者信息
- `timestamp`: 时间戳

##### 'GUILD_CREATE'

加入/创建服务器。

```javascript
gateway.on('GUILD_CREATE', (event) => {
  console.log('Guild:', event.d.name);
  console.log('Members:', event.d.member_count);
});
```

---

### DiscordAPI类

```javascript
import { DiscordAPI } from './src/api.js';

const api = new DiscordAPI(token, proxyUrl);
```

#### 消息操作

##### sendMessage(channelId, content, options)

发送消息。

```javascript
const message = await api.sendMessage('123456789', 'Hello!', {
  tts: false,
  embeds: [{
    title: '标题',
    description: '描述',
    color: 0x00ff00
  }]
});
```

##### editMessage(channelId, messageId, content)

编辑消息。

```javascript
await api.editMessage('123456789', '987654321', 'Updated content');
```

##### deleteMessage(channelId, messageId)

删除消息。

```javascript
await api.deleteMessage('123456789', '987654321');
```

##### getMessage(channelId, messageId)

获取单条消息。

```javascript
const message = await api.getMessage('123456789', '987654321');
```

##### getMessages(channelId, limit)

获取消息列表。

```javascript
const messages = await api.getMessages('123456789', 50);
```

#### Reaction操作

##### addReaction(channelId, messageId, emoji)

添加Reaction。

```javascript
await api.addReaction('123456789', '987654321', '✅');
await api.addReaction('123456789', '987654321', '🔥');
```

##### removeReaction(channelId, messageId, emoji, userId)

移除Reaction。

```javascript
await api.removeReaction('123456789', '987654321', '✅');
await api.removeReaction('123456789', '987654321', '✅', '123456788');
```

#### 用户操作

##### getUser(userId)

获取用户信息。

```javascript
const user = await api.getUser('123456789');
```

##### getChannel(channelId)

获取频道信息。

```javascript
const channel = await api.getChannel('123456789');
```

##### getGuild(guildId)

获取服务器信息。

```javascript
const guild = await api.getGuild('123456789');
```

---

## 测试

### 运行测试

```bash
# Gateway连接测试
node test-gateway.js

# SOCKS5 vs HTTP对比
node test-socks5.js

# 完整功能测试
node test-full.js

# 稳定性测试
node test-stability.js
```

### 测试结果

| 测试 | 结果 | 说明 |
|------|------|------|
| Gateway连接 | ✅ | CONNECTED + READY |
| SOCKS5对比 | ✅ | 两种代理都正常 |
| 完整功能 | ✅ | 4/4测试通过 |
| 稳定性 | ✅ | 120秒0次断开 |

### 手动测试

```bash
# 1. 发送测试消息
curl -X POST \
  -H "Authorization: Bot $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "测试消息"}' \
  "https://discord.com/api/v10/channels/$CHANNEL_ID/messages"

# 2. 查看日志
tail -f /tmp/openclaw/openclaw-*.log | grep "discord-custom"

# 3. 测试代理
curl -v --socks5 127.0.0.1:7891 https://discord.com/api/gateway
```

---

## 文件结构

```
custom-discord-channel/
├── index.js                    # OpenClaw插件入口
├── package.json               # 项目配置
├── tsconfig.json              # TypeScript配置
│
├── src/
│   ├── gateway.js            # WebSocket Gateway
│   ├── api.js               # Discord REST API
│   └── channel.js           # Channel Plugin
│
├── test/
│   ├── test-gateway.js       # Gateway测试
│   ├── test-socks5.js       # SOCKS5对比测试
│   ├── test-full.js         # 完整功能测试
│   └── test-stability.js     # 稳定性测试
│
├── docs/
│   └── API.md               # API文档
│
└── README.md                 # 本文档
```

---

## 与内置Discord对比

| 特性 | 内置@buape/carbon | 自定义实现 |
|------|-------------------|-----------|
| 代理支持 | ❌ | ✅ |
| SOCKS5 | ❌ | ✅ |
| HTTP | ✅ | ✅ |
| 更新影响 | 每次覆盖 | 独立维护 |
| WebSocket稳定性 | ❌ 频繁1006 | ✅ 0次断开 |
| REST API | ✅ | ✅ |
| 维护成本 | 官方维护 | 自行维护 |

---

## 故障排除

### 问题1：连接超时

```
Error: Connection timeout
```

**解决方案**：

```bash
# 检查代理
netstat -an | grep 7891

# 测试代理
curl -v --socks5 127.0.0.1:7891 https://discord.com/api/gateway
```

### 问题2：认证失败

```
Error: 401: Unauthorized
```

**解决方案**：

```bash
# 验证Token
curl -H "Authorization: Bot $TOKEN" https://discord.com/api/v10/users/@me
```

### 问题3：权限不足

```
Error: Missing Permissions
```

**所需权限**：
- View Channels
- Send Messages
- Read Message History
- Add Reactions

### 问题4：Intent错误

```
Error: Used disallowed intents
```

**解决方案**：
1. 在Discord开发者门户启用Intents
2. Message Content Intent（大多数服务器需要）

### 问题5：频繁断开

```
Gateway closed: 1006
```

**解决方案**：
1. 切换到SOCKS5代理
2. 检查网络稳定性

### 日志调试

```bash
# 查看详细日志
tail -f /tmp/openclaw/openclaw-*.log | grep -E "discord-custom|Gateway"

# 统计断开次数
grep -c "Gateway closed" /tmp/openclaw/openclaw-*.log
```

---

## 性能优化

### 推荐配置

```yaml
# mihomo配置
port: 7890
socks-port: 7891
dns:
  enable: true
  nameserver:
    - 8.8.8.8
    - 1.1.1.1
```

### 连接参数

```javascript
const wsOptions = {
  headers: {
    'User-Agent': 'OpenClaw-Discord/1.0',
    'Origin': 'https://discord.com'
  },
  timeout: 30000,
  agent: new SocksProxyAgent('socks5://127.0.0.1:7891')
};
```

### 心跳优化

```javascript
gateway.on('HELLO', (event) => {
  const interval = event.d.heartbeat_interval;
  // 留出20%余量
  const adjustedInterval = Math.floor(interval * 0.8);
  startHeartbeat(adjustedInterval);
});
```

---

## 未来改进

### 短期
- [ ] 完善错误处理
- [ ] 添加速率限制
- [ ] 实现消息缓存

### 中期
- [ ] 支持Voice Gateway
- [ ] 添加Webhook支持
- [ ] 命令自动注册

### 长期
- [ ] TypeScript重写
- [ ] 单元测试覆盖
- [ ] 发布为独立npm包

---

## 参考

### 官方文档
- [Discord Gateway](https://discord.com/developers/docs/topics/gateway)
- [Discord API](https://discord.com/developers/docs/reference)
- [OpenClaw](https://github.com/openclaw/openclaw)

### 相关库
- [ws](https://github.com/websockets/ws)
- [socks-proxy-agent](https://github.com/TooTallNate/proxy-agent)
- [https-proxy-agent](https://github.com/TooTallNave/proxy-agent)

---

## 更新日志

### v1.0.0 (2026-02-10)

- ✅ 初始版本
- ✅ WebSocket Gateway支持代理
- ✅ REST API完整实现
- ✅ 稳定性测试通过
- ✅ 与OpenClaw集成

---

## 许可证

MIT License
