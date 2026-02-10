/**
 * Discord REST API
 */

import https from 'node:https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

export class DiscordAPI {
  constructor(token, proxyUrl = null) {
    this.token = token;
    this.proxyUrl = proxyUrl || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || null;
  }

  request(method, endpoint, data = null) {
    const url = new URL(`https://discord.com/api/v10${endpoint}`);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Bot ${this.token}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    };

    if (this.proxyUrl) {
      try {
        const urlObj = new URL(this.proxyUrl);
        if (urlObj.protocol === 'socks5:' || urlObj.protocol === 'socks4:') {
          options.agent = new SocksProxyAgent(this.proxyUrl);
        } else {
          options.agent = new HttpsProxyAgent(this.proxyUrl);
        }
      } catch (e) {
        // 使用默认
      }
    }

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          // Discord的PUT请求通常返回空
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(body ? JSON.parse(body) : { success: true });
          } else {
            reject(new Error(`${res.statusCode}: ${body || 'Unknown error'}`));
          }
        } catch (e) {
          // 即使JSON解析失败，只要状态码是2xx就算成功
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true });
          } else {
            reject(new Error(`${res.statusCode}: ${body || 'Unknown error'}`));
          }
        }
      });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  // 发送消息
  async sendMessage(channelId, content, options = {}) {
    const data = { content, ...options };
    return this.request('POST', `/channels/${channelId}/messages`, data);
  }

  // 编辑消息
  async editMessage(channelId, messageId, content) {
    return this.request('PATCH', `/channels/${channelId}/messages/${messageId}`, { content });
  }

  // 删除消息
  async deleteMessage(channelId, messageId) {
    return this.request('DELETE', `/channels/${channelId}/messages/${messageId}`);
  }

  // 获取消息
  async getMessage(channelId, messageId) {
    return this.request('GET', `/channels/${channelId}/messages/${messageId}`);
  }

  // 获取频道消息列表
  async getMessages(channelId, limit = 50) {
    return this.request('GET', `/channels/${channelId}/messages?limit=${limit}`);
  }

  // 添加Reaction
  async addReaction(channelId, messageId, emoji) {
    // 编码emoji
    const encodedEmoji = encodeURIComponent(emoji);
    return this.request('PUT', `/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}/@me`);
  }

  // 移除Reaction
  async removeReaction(channelId, messageId, emoji, userId = '@me') {
    return this.request('DELETE', `/channels/${channelId}/messages/${messageId}/reactions/${emoji}/${userId}`);
  }

  // 获取用户信息
  async getUser(userId) {
    return this.request('GET', `/users/${userId}`);
  }

  // 获取频道信息
  async getChannel(channelId) {
    return this.request('GET', `/channels/${channelId}`);
  }

  // 获取Guild信息
  async getGuild(guildId) {
    return this.request('GET', `/guilds/${guildId}`);
  }
}
