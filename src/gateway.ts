// src/gateway.ts
import WebSocket from 'ws';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { DiscordGatewayEvent } from './types.js';

export class DiscordGateway {
  private ws: WebSocket | null = null;
  private proxyUrl: string | null = null;
  private token: string;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private sequence: number | null = null;
  private sessionId: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 50;
  private eventHandlers: Map<string, ((event: DiscordGatewayEvent) => void)[]> = new Map();

  constructor(token: string, proxyUrl?: string) {
    this.token = token;
    this.proxyUrl = proxyUrl || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || null;
  }

  async connect(): Promise<void> {
    // 获取 Gateway URL
    const gatewayUrl = await this.getGatewayUrl();

    return new Promise((resolve, reject) => {
      const wsOptions: any = {
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
          } else {
            wsOptions.agent = new HttpsProxyAgent(this.proxyUrl);
          }
          console.log('[DiscordGateway] Using proxy:', this.proxyUrl);
        } catch (e) {
          console.error('[DiscordGateway] Proxy error:', e);
        }
      }

      this.ws = new WebSocket(gatewayUrl, wsOptions);

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 30000);

      this.ws.on('open', () => {
        clearTimeout(timeout);
        console.log('[DiscordGateway] Connected to', gatewayUrl);
        this.reconnectAttempts = 0;
      });

      this.ws.on('message', (data) => {
        try {
          const event: DiscordGatewayEvent = JSON.parse(data.toString());
          this.handleEvent(event);
        } catch (e) {
          console.error('[DiscordGateway] Parse error:', e);
        }
      });

      this.ws.on('error', (err) => {
        clearTimeout(timeout);
        console.error('[DiscordGateway] Error:', err.message);
        reject(err);
      });

      this.ws.on('close', (code, reason) => {
        clearTimeout(timeout);
        console.log('[DiscordGateway] Closed:', code, reason.toString());
        this.handleClose(code);
      });
    });
  }

  private async getGatewayUrl(): Promise<string> {
    const url = 'https://discord.com/api/v10/gateway/bot';
    const options: any = {
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
      const req = require('node:https').request(url, options, (res: any) => {
        let data = '';
        res.on('data', (chunk: string) => data += chunk);
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

  private handleEvent(event: DiscordGatewayEvent) {
    if (event.s !== null && event.s !== undefined) {
      this.sequence = event.s;
    }

    switch (event.op) {
      case 10: // HELLO
        console.log('[DiscordGateway] HELLO - heartbeat:', event.d?.heartbeat_interval);
        this.startHeartbeat(event.d?.heartbeat_interval || 41250);
        this.identify();
        break;

      case 11: // Heartbeat ACK
        console.log('[DiscordGateway] Heartbeat ACK');
        break;

      case 0: // Dispatch
        if (event.t === 'READY') {
          console.log('[DiscordGateway] READY - user:', event.d?.user?.username);
          this.sessionId = event.d?.session_id;
          this.emit('READY', event);
        } else if (event.t === 'MESSAGE_CREATE') {
          this.emit('MESSAGE_CREATE', event);
        } else if (event.t === 'GUILD_CREATE') {
          this.emit('GUILD_CREATE', event);
        }
        break;

      case 7: // Reconnect
        console.log('[DiscordGateway] Reconnect requested');
        this.reconnect(true);
        break;

      case 9: // Invalid Session
        console.log('[DiscordGateway] Invalid session');
        setTimeout(() => this.reconnect(false), Math.random() * 5000 + 1000);
        break;
    }
  }

  private startHeartbeat(interval: number) {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          op: 1,
          d: this.sequence
        }));
      }
    }, interval);
  }

  private identify() {
    const payload = {
      op: 2,
      d: {
        token: this.token,
        intents: 513, // Guilds + GuildMessages + DirectMessages + MessageContent
        properties: {
          os: process.platform,
          browser: 'chrome',
          device: 'desktop'
        }
      }
    };
    this.ws?.send(JSON.stringify(payload));
  }

  private handleClose(code: number) {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (code === 1000 || code === 1006) {
      this.reconnect(this.sessionId !== null);
    }
  }

  private reconnect(resume: boolean) {
    this.reconnectAttempts++;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[DiscordGateway] Max reconnect attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    console.log(`[DiscordGateway] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch(console.error);
    }, delay);
  }

  // Event emitter
  on(event: string, handler: (event: DiscordGatewayEvent) => void) {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
  }

  private emit(event: string, data: DiscordGatewayEvent) {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach(handler => handler(data));
  }

  send(op: number, d: any) {
    this.ws?.send(JSON.stringify({ op, d }));
  }

  disconnect() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.ws?.close(1000, 'Client disconnect');
  }
}
