'use strict';

const LARK_MESSAGE_RECEIVE_EVENT = 'im.message.receive_v1';

async function defaultLoadLarkSdk() {
  return import('@larksuiteoapi/node-sdk');
}

function text(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function parseJson(value) {
  try {
    return JSON.parse(text(value));
  } catch {
    return {};
  }
}

function resolveDomain(config, Lark) {
  if (config.domain === 'lark') return Lark.Domain?.Lark ?? 1;
  return Lark.Domain?.Feishu ?? 0;
}

function createSdkLogger(logInfo, logWarn) {
  return {
    debug: (...args) => logInfo('im-channel', 'Lark SDK debug', { args: args.map(text) }),
    info: (...args) => logInfo('im-channel', 'Lark SDK info', { args: args.map(text) }),
    warn: (...args) => logWarn('im-channel', 'Lark SDK warn', { args: args.map(text) }),
    error: (...args) => logWarn('im-channel', 'Lark SDK error', { args: args.map(text) }),
  };
}

function normalizeReceiveEvent(raw) {
  return raw?.event && typeof raw.event === 'object' ? raw.event : raw;
}

function extractTextMessage(event) {
  const message = event?.message || {};
  const senderId = event?.sender?.sender_id || {};
  const content = parseJson(message.content);
  return {
    chatId: text(message.chat_id),
    chatType: text(message.chat_type),
    imUserId: text(senderId.open_id || senderId.user_id || senderId.union_id).trim(),
    messageId: text(message.message_id),
    messageType: text(message.message_type),
    text: text(content.text).trim(),
  };
}

class LarkAdapter {
  constructor({
    config,
    onPrivateMessage,
    logInfo = () => {},
    logWarn = () => {},
    loadLarkSdk = defaultLoadLarkSdk,
  }) {
    this.config = config;
    this.onPrivateMessage = onPrivateMessage;
    this.logInfo = logInfo;
    this.logWarn = logWarn;
    this.loadLarkSdk = loadLarkSdk;
    this.running = false;
    this.client = null;
    this.wsClient = null;
  }

  async start() {
    const Lark = await this.loadLarkSdk();
    const domain = resolveDomain(this.config, Lark);
    const logger = createSdkLogger(this.logInfo, this.logWarn);

    this.client = new Lark.Client({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      appType: Lark.AppType?.SelfBuild,
      domain,
      logger,
      loggerLevel: Lark.LoggerLevel?.info,
    });

    const eventDispatcher = new Lark.EventDispatcher({
      logger,
      loggerLevel: Lark.LoggerLevel?.info,
    }).register({
      [LARK_MESSAGE_RECEIVE_EVENT]: (event) => this.handleReceiveEvent(event),
    });

    this.wsClient = new Lark.WSClient({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      domain,
      logger,
      loggerLevel: Lark.LoggerLevel?.info,
      autoReconnect: true,
      onReady: () => {
        this.logInfo('im-channel', 'Lark adapter websocket ready', {
          domain: this.config.domain,
          appId: this.config.appId,
        });
      },
      onError: (error) => {
        const message = error instanceof Error ? error.message : text(error);
        this.logWarn('im-channel', 'Lark adapter websocket error', {
          domain: this.config.domain,
          appId: this.config.appId,
          error: message,
        });
      },
      onReconnecting: () => {
        this.logWarn('im-channel', 'Lark adapter websocket reconnecting', {
          domain: this.config.domain,
          appId: this.config.appId,
        });
      },
      onReconnected: () => {
        this.logInfo('im-channel', 'Lark adapter websocket reconnected', {
          domain: this.config.domain,
          appId: this.config.appId,
        });
      },
    });

    this.running = true;
    await this.wsClient.start({ eventDispatcher });
    this.logInfo('im-channel', 'Lark adapter websocket started', {
      domain: this.config.domain,
      appId: this.config.appId,
      event: LARK_MESSAGE_RECEIVE_EVENT,
    });
  }

  async stop() {
    this.running = false;
    const wsClient = this.wsClient;
    this.wsClient = null;
    this.client = null;
    if (!wsClient) return;
    if (typeof wsClient.close === 'function') {
      try {
        wsClient.close({ force: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : text(error);
        this.logWarn('im-channel', 'Lark adapter websocket close failed', {
          domain: this.config.domain,
          appId: this.config.appId,
          error: message,
        });
      }
    } else if (typeof wsClient.stop === 'function') {
      await wsClient.stop();
    }
    this.logInfo('im-channel', 'Lark adapter websocket stopped', {
      domain: this.config.domain,
      appId: this.config.appId,
    });
  }

  async handleReceiveEvent(rawEvent) {
    const event = normalizeReceiveEvent(rawEvent);
    const message = extractTextMessage(event);

    this.logInfo('im-channel', 'Lark adapter message event received', {
      chatType: message.chatType,
      messageType: message.messageType,
      messageId: message.messageId,
      chatId: message.chatId,
      imUserId: message.imUserId,
      textLength: message.text.length,
    });

    if (message.chatType !== 'p2p') {
      this.logInfo('im-channel', 'Lark adapter message ignored', {
        reason: 'non-p2p',
        chatType: message.chatType,
        messageId: message.messageId,
      });
      return;
    }
    if (message.messageType !== 'text') {
      this.logInfo('im-channel', 'Lark adapter message ignored', {
        reason: 'non-text',
        messageType: message.messageType,
        messageId: message.messageId,
      });
      return;
    }
    if (!message.imUserId || !message.text) {
      this.logWarn('im-channel', 'Lark adapter message ignored', {
        reason: 'missing-user-or-text',
        messageId: message.messageId,
        hasUser: Boolean(message.imUserId),
        hasText: Boolean(message.text),
      });
      return;
    }

    this.logInfo('im-channel', 'Lark adapter private message received', {
      imUserId: message.imUserId,
      messageId: message.messageId,
      textLength: message.text.length,
    });

    try {
      const result = await this.onPrivateMessage({ imUserId: message.imUserId, text: message.text });
      const replyText = text(result?.text).trim();
      this.logInfo('im-channel', 'Lark adapter private message routed', {
        imUserId: message.imUserId,
        messageId: message.messageId,
        ok: result?.ok === true,
        replyLength: replyText.length,
      });
      if (replyText) {
        await this.sendPrivateText(message.imUserId, replyText);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : text(error);
      this.logWarn('im-channel', 'Lark adapter private message failed', {
        imUserId: message.imUserId,
        messageId: message.messageId,
        error: errorMessage,
      });
      try {
        await this.sendPrivateText(message.imUserId, `IM Channel 处理失败：${errorMessage}`);
      } catch (replyError) {
        const replyErrorMessage = replyError instanceof Error ? replyError.message : text(replyError);
        this.logWarn('im-channel', 'Lark adapter error reply failed', {
          imUserId: message.imUserId,
          messageId: message.messageId,
          error: replyErrorMessage,
        });
      }
    }
  }

  async sendPrivateText(imUserId, messageText) {
    if (!this.client) throw new Error('adapter-not-ready');
    const receiveId = text(imUserId).trim();
    const bodyText = text(messageText);
    if (!receiveId || !bodyText) return false;

    this.logInfo('im-channel', 'Lark adapter sending private reply', {
      imUserId: receiveId,
      textLength: bodyText.length,
    });

    const response = await this.client.request({
      method: 'POST',
      url: '/open-apis/im/v1/messages',
      params: { receive_id_type: 'open_id' },
      data: {
        receive_id: receiveId,
        msg_type: 'text',
        content: JSON.stringify({ text: bodyText }),
      },
    });

    if (response?.code !== undefined && response.code !== 0) {
      throw new Error(response.msg || `send-failed:${response.code}`);
    }

    this.logInfo('im-channel', 'Lark adapter private reply sent', {
      imUserId: receiveId,
      messageId: response?.data?.message_id || '',
    });
    return true;
  }

  async simulatePrivateMessage({ imUserId, text: messageText } = {}) {
    if (!this.running || typeof this.onPrivateMessage !== 'function') {
      return { ok: false, text: 'adapter-not-ready' };
    }
    return this.onPrivateMessage({ imUserId, text: messageText });
  }
}

module.exports = { LarkAdapter };
