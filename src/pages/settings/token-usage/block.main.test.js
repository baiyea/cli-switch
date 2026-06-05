const test = require('node:test');
const assert = require('node:assert/strict');
const z = require('zod');

const { createIpcSchemas } = require('../../../app/ipc-schemas');
const { TOKEN_USAGE_CHANNELS } = require('./shared/token-usage.channels');

function loadRegisterTokenUsageMain() {
  delete require.cache[require.resolve('./block.main')];
  return require('./block.main').registerTokenUsageMain;
}

function registerHandlers(context = {}) {
  const handlers = {};
  const registerTokenUsageMain = loadRegisterTokenUsageMain();
  registerTokenUsageMain({
    z,
    tokenUsageFiltersSchema: z.object({
      range: z.enum(['7d', '30d', 'all']).optional().default('30d'),
      projectId: z.string().optional().default(''),
      provider: z.string().optional().default(''),
      profileId: z.string().optional().default(''),
      modelName: z.string().optional().default(''),
    }),
    tokenUsageRefreshSchema: z.object({
      force: z.boolean().optional().default(false),
    }),
    registerIpc: (channel, handler) => {
      handlers[channel] = handler;
      return true;
    },
    logWarn() {},
    ...context,
  });
  return handlers;
}

test('summary handler normalizes missing optional summary fields to safe defaults', async () => {
  const handlers = registerHandlers({
    tokenUsageStore: {
      getSummary() {
        return { totals: { totalTokens: 123 }, models: undefined };
      },
    },
  });

  const result = await handlers[TOKEN_USAGE_CHANNELS.TOKEN_USAGE_SUMMARY](null, {});

  assert.equal(result.ok, true);
  assert.deepEqual(result.summary.filters, {
    range: '30d',
    projectId: '',
    provider: '',
    profileId: '',
    modelName: '',
  });
  assert.equal(result.summary.totals.totalTokens, 123);
  assert.equal(result.summary.totals.sessionCount, 0);
  assert.equal(result.summary.totals.runCount, 0);
  assert.equal(result.summary.totals.inputTokens, 0);
  assert.equal(result.summary.totals.outputTokens, 0);
  assert.equal(result.summary.totals.cachedTokens, 0);
  assert.equal(result.summary.totals.reasoningTokens, 0);
  assert.equal(result.summary.totals.toolTokens, 0);
  assert.equal(result.summary.totals.rounds, 0);
  assert.deepEqual(result.summary.models, []);
  assert.deepEqual(result.summary.projects, []);
  assert.deepEqual(result.summary.daily, []);
  assert.deepEqual(result.summary.sessions, []);
  assert.equal(result.summary.status.running, false);
});

test('app ipc schema accepts token usage profileId filter with safe defaults', () => {
  const { tokenUsageFiltersSchema } = createIpcSchemas(z);

  assert.deepEqual(tokenUsageFiltersSchema.parse({}), {
    range: '30d',
    projectId: '',
    provider: '',
    profileId: '',
    modelName: '',
  });
  assert.deepEqual(tokenUsageFiltersSchema.parse({ profileId: 'deepseek-api' }), {
    range: '30d',
    projectId: '',
    provider: '',
    profileId: 'deepseek-api',
    modelName: '',
  });
});

test('refresh handler writes top-level counters without returning result payload', async () => {
  const handlers = registerHandlers({
    tokenUsageRuntime: {
      refresh() {
        return { scanned: 3, updated: 2, skipped: 1, failed: 0 };
      },
    },
  });

  const result = await handlers[TOKEN_USAGE_CHANNELS.TOKEN_USAGE_REFRESH](null, { force: true });

  assert.equal(result.ok, true);
  assert.equal(result.status.running, false);
  assert.equal(result.status.scanned, 3);
  assert.equal(result.status.updated, 2);
  assert.equal(result.status.skipped, 1);
  assert.equal(result.status.failed, 0);
  assert.equal(Object.hasOwn(result, 'result'), false);
  assert.equal(Object.hasOwn(result.status, 'lastResult'), false);
});

test('refresh handler returns current status for concurrent refresh without error', async () => {
  let resolveRefresh;
  const refreshPromise = new Promise((resolve) => {
    resolveRefresh = resolve;
  });
  const handlers = registerHandlers({
    tokenUsageRuntime: {
      refresh() {
        return refreshPromise;
      },
    },
  });

  const first = handlers[TOKEN_USAGE_CHANNELS.TOKEN_USAGE_REFRESH](null, {});
  const second = await handlers[TOKEN_USAGE_CHANNELS.TOKEN_USAGE_REFRESH](null, {});

  assert.equal(second.ok, true);
  assert.equal(second.status.running, true);
  assert.equal(Object.hasOwn(second, 'reason'), false);

  resolveRefresh({ scanned: 1, updated: 1, skipped: 0, failed: 0 });
  await first;
});
