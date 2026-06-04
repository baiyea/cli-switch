const { TOKEN_USAGE_CHANNELS } = require('./shared/token-usage.channels');

const UNAVAILABLE_REASON = 'token usage runtime unavailable';

let refreshStatus = {
  running: false,
  lastStartedAt: '',
  lastFinishedAt: '',
  scanned: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
  error: '',
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

function numberOrZero(value) {
  const next = Number(value || 0);
  if (!Number.isFinite(next)) return 0;
  return next;
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeTotals(totals = {}) {
  return {
    inputTokens: numberOrZero(totals.inputTokens),
    outputTokens: numberOrZero(totals.outputTokens),
    cachedTokens: numberOrZero(totals.cachedTokens),
    reasoningTokens: numberOrZero(totals.reasoningTokens),
    toolTokens: numberOrZero(totals.toolTokens),
    totalTokens: numberOrZero(totals.totalTokens),
    rounds: numberOrZero(totals.rounds),
    sessionCount: numberOrZero(totals.sessionCount),
    runCount: numberOrZero(totals.runCount),
  };
}

function normalizeSummaryShape(summary, filters) {
  const source = summary && typeof summary === 'object' ? summary : {};
  return {
    filters,
    totals: normalizeTotals(source.totals),
    models: arrayOrEmpty(source.models),
    projects: arrayOrEmpty(source.projects),
    daily: arrayOrEmpty(source.daily),
    sessions: arrayOrEmpty(source.sessions),
    status: refreshStatus,
  };
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
      summary: normalizeSummaryShape(summary, filters),
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
      return { ok: true, status: refreshStatus };
    }

    const parsed = parseWithSchema(tokenUsageRefreshSchema, payload);
    updateRefreshStatus({
      running: true,
      lastStartedAt: new Date().toISOString(),
      scanned: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      error: '',
    });

    try {
      const result = await tokenUsageRuntime.refresh({ force: Boolean(parsed.force) });
      const status = updateRefreshStatus({
        running: false,
        lastFinishedAt: new Date().toISOString(),
        scanned: Number(result?.scanned || 0),
        updated: Number(result?.updated || 0),
        skipped: Number(result?.skipped || 0),
        failed: Number(result?.failed || 0),
        error: '',
      });
      return { ok: true, status };
    } catch (error) {
      const reason = asReason(error);
      const status = updateRefreshStatus({
        running: false,
        lastFinishedAt: new Date().toISOString(),
        error: reason,
      });
      logWarn('token-usage', 'Refresh failed', { error: reason });
      return { ok: false, status, reason };
    }
  });
}

module.exports = { registerTokenUsageMain };
