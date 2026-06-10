'use strict';

const { parseImCommand } = require('./im-command-parser');
const { createImSessionRouter } = require('./im-session-router');
const { LarkAdapter } = require('./lark.adapter');

const defaultImConfig = {
  enabled: false,
  domain: 'feishu',
  appId: '',
  appSecret: '',
  allowedUsers: [],
};

function normalizeImConfig(input) {
  const allowedUsers = [];
  const seenUsers = new Set();
  for (const user of Array.isArray(input?.allowedUsers) ? input.allowedUsers : []) {
    const normalized = String(user || '').trim();
    if (!normalized || seenUsers.has(normalized)) continue;
    seenUsers.add(normalized);
    allowedUsers.push(normalized);
  }
  return {
    enabled: input?.enabled === true,
    domain: input?.domain === 'lark' ? 'lark' : 'feishu',
    appId: String(input?.appId || '').trim(),
    appSecret: String(input?.appSecret || '').trim(),
    allowedUsers,
  };
}

class ImChannelManager {
  constructor({
    bindingRepository,
    sessionPort,
    logInfo = () => {},
    logWarn = () => {},
    createAdapter,
    persistConfig = () => {},
  } = {}) {
    this.bindingRepository = bindingRepository;
    this.sessionPort = sessionPort;
    this.logInfo = logInfo;
    this.logWarn = logWarn;
    this.persistConfig = persistConfig;
    this.createAdapter =
      typeof createAdapter === 'function'
        ? createAdapter
        : (adapterContext) => new LarkAdapter(adapterContext);
    this.config = { ...defaultImConfig };
    this.adapter = null;
    this.router = null;
    this.pendingCleanupAdapter = null;
    this.status = {
      running: false,
      lastError: '',
      lastInboundAt: null,
      lastOutboundAt: null,
    };
    this.configureQueue = Promise.resolve();
  }

  autoTrustFirstUser(imUserId) {
    if (!imUserId || this.config.allowedUsers.length > 0) return false;
    const nextConfig = normalizeImConfig({
      ...this.config,
      allowedUsers: [imUserId],
    });
    this.config = nextConfig;
    try {
      const persisted = this.persistConfig(nextConfig);
      if (persisted) this.config = normalizeImConfig(persisted);
      this.logInfo('im-channel', 'Auto trusted first IM user', {
        platform: this.config.domain,
        imUserId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logWarn('im-channel', 'Failed to persist auto trusted IM user', {
        platform: this.config.domain,
        imUserId,
        error: message,
      });
    }
    return true;
  }

  configure(config) {
    const job = this.configureQueue.then(() => this.configureNow(config));
    this.configureQueue = job.catch(() => {});
    return job;
  }

  async configureNow(config) {
    const normalized = normalizeImConfig(config);
    await this.stop();
    this.config = normalized;
    this.status = {
      ...this.status,
      running: false,
      lastError: '',
      lastInboundAt: null,
      lastOutboundAt: null,
    };

    if (!normalized.enabled) return normalized;
    if (!normalized.appId || !normalized.appSecret) {
      this.status = { ...this.status, running: false, lastError: 'missing-credentials' };
      return normalized;
    }

    let nextRouter = null;
    let nextAdapter = null;
    try {
      nextRouter = createImSessionRouter({
        platform: normalized.domain,
        bindingRepository: this.bindingRepository,
        sessionPort: this.sessionPort,
      });
      nextAdapter = this.createAdapter({
        config: normalized,
        onPrivateMessage: (message) => this.handlePrivateMessage(message),
        logInfo: this.logInfo,
        logWarn: this.logWarn,
      });
      await nextAdapter.start();
      this.router = nextRouter;
      this.adapter = nextAdapter;
      this.status = {
        running: true,
        lastError: '',
        lastInboundAt: null,
        lastOutboundAt: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const cleanupOk = await this.cleanupAdapter(nextAdapter);
      if (nextAdapter && !cleanupOk) this.pendingCleanupAdapter = nextAdapter;
      this.adapter = null;
      this.router = null;
      this.status = { ...this.status, running: false, lastError: message };
      throw error;
    }
    return normalized;
  }

  async handlePrivateMessage(messageOrUserId, maybeText) {
    const message =
      typeof messageOrUserId === 'object' && messageOrUserId !== null
        ? messageOrUserId
        : { imUserId: messageOrUserId, text: maybeText };
    const imUserId = String(message?.imUserId || '').trim();
    const text = String(message?.text || '');
    this.status.lastInboundAt = Date.now();
    this.logInfo('im-channel', 'Private message received', {
      platform: this.config.domain,
      imUserId,
      textLength: text.length,
      running: this.status.running,
    });

    if (!this.config.allowedUsers.includes(imUserId)) {
      this.autoTrustFirstUser(imUserId);
    }

    if (!this.config.allowedUsers.includes(imUserId)) {
      const result = { ok: false, text: '无权限访问 Cli-Switch。' };
      this.status.lastOutboundAt = Date.now();
      this.logInfo('im-channel', 'Private message rejected', {
        platform: this.config.domain,
        imUserId,
        reason: 'not-allowed',
      });
      return result;
    }

    if (!this.router) {
      const result = { ok: false, text: 'IM Channel 尚未启动。' };
      this.status.lastOutboundAt = Date.now();
      this.logWarn('im-channel', 'Private message rejected', {
        platform: this.config.domain,
        imUserId,
        reason: 'router-not-ready',
      });
      return result;
    }

    const command = parseImCommand(text);
    this.logInfo('im-channel', 'Private message command parsed', {
      platform: this.config.domain,
      imUserId,
      commandType: command.type,
      valid: command.valid !== false,
      reason: command.reason || '',
    });
    const result = await this.router.handleCommand({ imUserId, command });
    this.status.lastOutboundAt = Date.now();
    this.logInfo('im-channel', 'Private message routed', {
      platform: this.config.domain,
      imUserId,
      commandType: command.type,
      ok: result.ok === true,
      replyLength: String(result.text || '').length,
    });
    return result;
  }

  async simulatePrivateMessage(payload) {
    if (!this.adapter || typeof this.adapter.simulatePrivateMessage !== 'function') {
      return { ok: false, text: 'adapter-not-ready' };
    }
    return this.adapter.simulatePrivateMessage(payload);
  }

  getStatus() {
    return { ...this.status };
  }

  async cleanupAdapter(adapter) {
    if (!adapter || typeof adapter.stop !== 'function') return true;
    try {
      await adapter.stop();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logWarn('im-channel', 'Failed to cleanup IM adapter', { error: message });
      return false;
    }
  }

  async stop() {
    const adapter = this.adapter;
    this.adapter = null;
    this.router = null;
    this.status.running = false;
    if (this.pendingCleanupAdapter) {
      const pending = this.pendingCleanupAdapter;
      try {
        await pending.stop();
        if (this.pendingCleanupAdapter === pending) this.pendingCleanupAdapter = null;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logWarn('im-channel', 'Failed to cleanup pending IM adapter', { error: message });
        this.status = { ...this.status, running: false, lastError: message };
        throw error;
      }
    }
    if (!adapter) return;
    try {
      await adapter.stop();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.pendingCleanupAdapter = adapter;
      this.logWarn('im-channel', 'Failed to stop IM adapter', { error: message });
      this.status = { ...this.status, running: false, lastError: message };
      throw error;
    }
  }
}

module.exports = {
  ImChannelManager,
  normalizeImConfig,
};
