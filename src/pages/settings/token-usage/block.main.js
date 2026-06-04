const { TOKEN_USAGE_CHANNELS } = require('./shared/token-usage.channels');

const UNAVAILABLE_REASON = 'token usage runtime unavailable';

let refreshStatus = {
  running: false,
  lastStartedAt: null,
  lastFinishedAt: null,
  lastError: '',
  lastResult: null,
};

function asReason(error) {
  if (error instanceof Error) return error.message;
  if (error === null || error === undefined) return 'unknown error';
  return String(error);
}

function updateRefreshStatus(patch) {
  refreshStatus = { ...refreshStatus, ...patch };
  return refreshStatus;
}

function parseWithSchema(schema, payload) {
  if (!schema || typeof schema.parse !== 'function') return payload || {};
  return schema.parse(payload || {});
}

function createUnavailableResponse() {
  return { ok: false, reason: UNAVAILABLE_REASON };
}

function registerTokenUsageMain(context = {}) {
  const {
    registerIpc,
    tokenUsageStore,
    tokenUsageRuntime,
    tokenUsageFiltersSchema,
    tokenUsageRefreshSchema,
    logWarn = () => {},
  } = context;

  if (!registerIpc) return;

  const hasStore = tokenUsageStore && typeof tokenUsageStore.getSummary === 'function';
  const hasRuntime = tokenUsageRuntime && typeof tokenUsageRuntime.refresh === 'function';

  registerIpc(TOKEN_USAGE_CHANNELS.TOKEN_USAGE_SUMMARY, async (_event, payload) => {
    if (!hasStore) return createUnavailableResponse();
    const filters = parseWithSchema(tokenUsageFiltersSchema, payload);
    const summary = tokenUsageStore.getSummary(filters);
    return {
      ok: true,
      summary: {
        ...summary,
        filters,
        status: refreshStatus,
      },
    };
  });

  registerIpc(TOKEN_USAGE_CHANNELS.TOKEN_USAGE_REFRESH_STATUS, async () => ({
    ok: true,
    status: refreshStatus,
  }));

  registerIpc(TOKEN_USAGE_CHANNELS.TOKEN_USAGE_REFRESH, async (_event, payload) => {
    if (!hasRuntime) {
      return { ok: false, status: refreshStatus, reason: UNAVAILABLE_REASON };
    }
    if (refreshStatus.running) {
      return { ok: false, status: refreshStatus, reason: 'token usage refresh already running' };
    }

    const parsed = parseWithSchema(tokenUsageRefreshSchema, payload);
    updateRefreshStatus({
      running: true,
      lastStartedAt: new Date().toISOString(),
      lastError: '',
    });

    try {
      const result = await tokenUsageRuntime.refresh({ force: Boolean(parsed.force) });
      const status = updateRefreshStatus({
        running: false,
        lastFinishedAt: new Date().toISOString(),
        lastError: '',
        lastResult: result,
      });
      return { ok: true, status, result };
    } catch (error) {
      const reason = asReason(error);
      const status = updateRefreshStatus({
        running: false,
        lastFinishedAt: new Date().toISOString(),
        lastError: reason,
      });
      logWarn('token-usage', 'Refresh failed', { error: reason });
      return { ok: false, status, reason };
    }
  });
}

module.exports = { registerTokenUsageMain };
