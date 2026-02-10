// src/types.ts
export interface DiscordConfig {
  token: string;
  proxy?: {
    enabled: boolean;
    url: string;
  };
  intents?: number;
  enabled?: boolean;
}

export interface DiscordAccount {
  accountId: string;
  token: string;
  name?: string;
  enabled: boolean;
  configured: boolean;
  proxy?: {
    enabled: boolean;
    url: string;
  };
}

export interface DiscordMessage {
  id: string;
  channelId: string;
  guildId?: string;
  content: string;
  author: {
    id: string;
    username: string;
    discriminator: string;
  };
  timestamp: string;
}

export interface DiscordGatewayEvent {
  op: number;
  t?: string;
  d?: any;
  s?: number;
}
