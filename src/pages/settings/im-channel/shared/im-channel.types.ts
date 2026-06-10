export type ImChannelDomain = 'feishu' | 'lark';

export interface ImChannelConfig {
  enabled: boolean;
  domain: ImChannelDomain;
  appId: string;
  appSecret: string;
  allowedUsers: string[];
}

export interface ImChannelStatus {
  running: boolean;
  lastError: string;
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
}

export interface ImChannelInstallQrcodeResult {
  ok: boolean;
  url?: string;
  deviceCode?: string;
  interval?: number;
  expireIn?: number;
  message?: string;
}

export interface ImChannelInstallPollResult {
  ok: boolean;
  done: boolean;
  appId?: string;
  appSecret?: string;
  domain?: ImChannelDomain;
  message?: string;
}

export interface ImChannelVerifyCredentialsResult {
  ok: boolean;
  message?: string;
}
