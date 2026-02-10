/**
 * Discord Gateway - 支持代理的自定义实现
 */

import WebSocket from 'ws';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import https from 'node:https';

export class DiscordGateway {
  constructor(token, proxyUrl = null) {
    this.token = token;
    this.proxyUrl = proxyUrl || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || null;
    this.ws = null;
    this.heartbeatInterval = null;
    this.sequence = null;
    this.sessionId = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 50;
    this.eventHandlers = new Map();
  }

  async connect() {
    const gatewayUrl = await this.getGatewayUrl();
    console.log('[Gateway] Connecting to:', gatewayUrl);
    console.log('[Gateway] Proxy:', this.proxyUrl || 'disabled');

    return new Promise((resolve, reject) => {
      const wsOptions = {
        headers: {
          'User-Agent': 'OpenClaw-Discord/1.0',
          'Origin': 'https://discord.com'
        },
        timeout: 30000
      };

      // ✅ 关键：支持代理配置
      if (this.proxyUrl) {
        try {
          const urlObj = new URL(this.proxyUrl);
          if (urlObj.protocol === 'socks5:' || urlObj.protocol === 'socks4:') {
            wsOptions.agent = new SocksProxyAgent(this.proxyUrl);
            console.log('[Gateway] Using SOCKS5 proxy');
          } else {
            wsOptions.agent = new HttpsProxyAgent(this.proxyUrl);
            console.log('[Gateway] Using HTTP proxy');
          }
        } catch (e) {
          console.error('[Gateway] Proxy error:', e.message);
        }
      }

      this.ws = new WebSocket(gatewayUrl, wsOptions);

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 30000);

      this.ws.on('open', () => {
        clearTimeout(timeout);
        console.log('[Gateway] WebSocket connected');
        this.reconnectAttempts = 0;
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const event = JSON.parse(data.toString());
          this.handleEvent(event);
        } catch (e) {
          console.error('[Gateway] Parse error:', e.message);
        }
      });

      this.ws.on('error', (err) => {
        clearTimeout(timeout);
        console.error('[Gateway] Error:', err.message);
        reject(err);
      });

      this.ws.on('close', (code, reason) => {
        clearTimeout(timeout);
        console.log('[Gateway] Closed:', code, reason.toString());
        this.handleClose(code);
      });
    });
  }

  async getGatewayUrl() {
    const url = 'https://discord.com/api/v10/gateway/bot';
    const options = {
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
      const req = https.request(url, options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json.url);
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  handleEvent(event) {
    if (event.s !== null && event.s !== undefined) {
      this.sequence = event.s;
    }

    switch (event.op) {
      case 10: // HELLO
        console.log('[Gateway] HELLO - heartbeat:', event.d?.heartbeat_interval);
        this.startHeartbeat(event.d?.heartbeat_interval || 41250);
        this.identify();
        break;

      case 11: // Heartbeat ACK
        console.log('[Gateway] Heartbeat ACK');
        break;

      case 0: // Dispatch
        if (event.t === 'READY') {
          console.log('[Gateway] READY - user:', event.d?.user?.username);
          this.sessionId = event.d?.session_id;
          this.emit('READY', event);
        } else if (event.t === 'MESSAGE_CREATE') {
          this.emit('MESSAGE_CREATE', event);
        } else if (event.t === 'GUILD_CREATE') {
          this.emit('GUILD_CREATE', event);
        }
        break;

      case 7: // Reconnect
        console.log('[Gateway] Reconnect requested');
        this.reconnect(true);
        break;

      case 9: // Invalid Session
        console.log('[Gateway] Invalid session');
        setTimeout(() => this.reconnect(false), Math.random() * 5000 + 1000);
        break;
    }
  }

  startHeartbeat(interval) {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          op: 1,
          d: this.sequence
        }));
        console.log('[Gateway] Heartbeat sent');
      }
    }, interval);
  }

  identify() {
    const payload = {
      op: 2,
      d: {
        token: this.token,
        intents: 513,
        properties: {
          os: process.platform,
          browser: 'chrome',
          device: 'desktop'
        }
      }
    };
    this.ws.send(JSON.stringify(payload));
    console.log('[Gateway] IDENTIFY sent');
  }

  handleClose(code) {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (code === 1000 || code === 1006) {
      this.reconnect(this.sessionId !== null);
    }
  }

  reconnect(resume) {
    this.reconnectAttempts++;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Gateway] Max reconnect attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    console.log(`[Gateway] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch(console.error);
    }, delay);
  }

  // Event emitter
  on(event, handler) {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
  }

  emit(event, data) {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach(handler => handler(data));
  }

  send(op, d) {
    this.ws?.send(JSON.stringify({ op, d }));
  }

  disconnect() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.ws?.close(1000, 'Client disconnect');
  }
}
