const PROVIDERS_BY_FINISH_ORDER = ['claude', 'codex', 'gemini'];

const ZERO_TOTALS = {
  inputTokens: 0,
  outputTokens: 0,
  cachedTokens: 0,
  reasoningTokens: 0,
  toolTokens: 0,
  totalTokens: 0,
  rounds: 0,
};

function createTokenUsageSyncService({
  fs,
  sessionStore,
  tokenUsageStore,
  readSessionStats,
  resolveRunMetadata,
  now,
  logWarn = () => {},
}) {
  if (!fs) throw new TypeError('createTokenUsageSyncService: fs is required');
  if (!sessionStore) throw new TypeError('createTokenUsageSyncService: sessionStore is required');
  if (!tokenUsageStore)
    throw new TypeError('createTokenUsageSyncService: tokenUsageStore is required');
  if (typeof readSessionStats !== 'function')
    throw new TypeError('createTokenUsageSyncService: readSessionStats must be a function');
  if (typeof resolveRunMetadata !== 'function')
    throw new TypeError('createTokenUsageSyncService: resolveRunMetadata must be a function');
  if (typeof now !== 'function') throw new TypeError('createTokenUsageSyncService: now must be a function');

  const providerSessionAliases = new Map();

  function text(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    return String(value);
  }

  function integer(value) {
    const next = Number(value || 0);
    if (!Number.isFinite(next)) return 0;
    return Math.max(0, Math.floor(next));
  }

  function providerFromRow(row) {
    return text(row?.provider, 'claude').trim().toLowerCase() || 'claude';
  }

  function providerSessionIdFromRow(row) {
    return text(row?.provider_session_id || row?.providerSessionId || row?.id).trim();
  }

  function sessionFilePathFromRow(row) {
    return text(row?.session_file_path || row?.sessionFilePath).trim();
  }

  function runPayloadFromRow(row, metadata, startedAt) {
    const provider = providerFromRow(row);
    const providerSessionId = providerSessionIdFromRow(row);
    return {
      projectId: text(row?.project_id || row?.projectId),
      sessionId: text(row?.id || row?.session_id || row?.sessionId || providerSessionId),
      provider,
      providerSessionId,
      profileId: text(metadata?.profileId),
      profileName: text(metadata?.profileName),
      modelName: text(metadata?.modelName, 'unknown'),
      apiBaseHost: text(metadata?.apiBaseHost, 'unknown'),
      envFingerprint: text(metadata?.envFingerprint),
      sessionFilePath: sessionFilePathFromRow(row),
      runStartedAt: text(startedAt, now()),
    };
  }

  function metadataForProvider(provider) {
    const source = resolveRunMetadata(provider) || {};
    return {
      profileId: text(source.profileId) || 'unknown',
      profileName: text(source.profileName || source.profileId) || 'unknown',
      modelName: text(source.modelName) || 'unknown',
      apiBaseHost: text(source.apiBaseHost) || 'unknown',
      envFingerprint: text(source.envFingerprint),
    };
  }

  function isUnknownAttribution(run) {
    const profileId = text(run?.profile_id).trim().toLowerCase();
    const profileName = text(run?.profile_name).trim().toLowerCase();
    return !profileId || profileId === 'unknown' || !profileName || profileName === 'unknown';
  }

  function repairUnknownRunAttribution(row, run = null) {
    const targetRun = run || getActiveRun(row);
    if (!targetRun || !isUnknownAttribution(targetRun)) return targetRun;
    if (typeof tokenUsageStore.updateRunMetadataIfUnknown !== 'function') return targetRun;
    const metadata = metadataForProvider(providerFromRow(row));
    return tokenUsageStore.updateRunMetadataIfUnknown(targetRun.id, metadata) || targetRun;
  }

  function getActiveRun(row) {
    const provider = providerFromRow(row);
    const providerSessionId = providerSessionIdFromRow(row);
    if (!providerSessionId) return null;
    return tokenUsageStore.getActiveRunByProviderSession({ provider, providerSessionId }) || null;
  }

  function startRunForSession({ row, startedAt } = {}) {
    const provider = providerFromRow(row);
    const providerSessionId = providerSessionIdFromRow(row);
    if (!providerSessionId) throw new Error('provider_session_id is required');

    const activeRun = getActiveRun(row);
    if (activeRun) return repairUnknownRunAttribution(row, activeRun);

    const metadata = resolveRunMetadata(provider) || {};
    return tokenUsageStore.startRun(runPayloadFromRow(row, metadata, startedAt));
  }

  function startUnknownRunForSession(row) {
    const activeRun = getActiveRun(row);
    if (activeRun) return repairUnknownRunAttribution(row, activeRun);
    const metadata = metadataForProvider(providerFromRow(row));
    return tokenUsageStore.startRun(
      runPayloadFromRow(
        row,
        metadata,
        row?.updated_at || now(),
      ),
    );
  }

  function fileFingerprint(stat) {
    return `${integer(stat?.mtimeMs)}:${integer(stat?.size)}`;
  }

  function getLastFingerprint(row) {
    const provider = providerFromRow(row);
    const providerSessionId = providerSessionIdFromRow(row);
    if (typeof tokenUsageStore.getLastFingerprint !== 'function') return '';
    return text(tokenUsageStore.getLastFingerprint({ provider, providerSessionId }));
  }

  function statsEndedAt(stats, row) {
    const endedAt =
      stats?.endedAt === null || stats?.endedAt === undefined ? NaN : Number(stats.endedAt);
    if (Number.isFinite(endedAt)) return new Date(endedAt).toISOString();
    return text(row?.updated_at, now());
  }

  function totalsFromStats(stats) {
    const tokens = stats?.tokens || {};
    return {
      inputTokens: integer(tokens.input),
      outputTokens: integer(tokens.output),
      cachedTokens: integer(tokens.cached),
      reasoningTokens: integer(tokens.reasoning),
      toolTokens: integer(tokens.tool),
      totalTokens: integer(tokens.total),
      rounds: integer(stats?.rounds),
    };
  }

  function getAssignedTotals(row) {
    const provider = providerFromRow(row);
    const providerSessionId = providerSessionIdFromRow(row);
    if (typeof tokenUsageStore.getAssignedTotals !== 'function') return { ...ZERO_TOTALS };
    return { ...ZERO_TOTALS, ...tokenUsageStore.getAssignedTotals({ provider, providerSessionId }) };
  }

  function positiveDelta(current, assigned) {
    return {
      inputTokens: Math.max(0, integer(current.inputTokens) - integer(assigned.inputTokens)),
      outputTokens: Math.max(0, integer(current.outputTokens) - integer(assigned.outputTokens)),
      cachedTokens: Math.max(0, integer(current.cachedTokens) - integer(assigned.cachedTokens)),
      reasoningTokens: Math.max(
        0,
        integer(current.reasoningTokens) - integer(assigned.reasoningTokens),
      ),
      toolTokens: Math.max(0, integer(current.toolTokens) - integer(assigned.toolTokens)),
      totalTokens: Math.max(0, integer(current.totalTokens) - integer(assigned.totalTokens)),
      rounds: Math.max(0, integer(current.rounds) - integer(assigned.rounds)),
    };
  }

  function writeErrorSnapshot(row, error, sourceMissing, stat = null) {
    const run = startUnknownRunForSession(row);
    tokenUsageStore.addSnapshotDelta(run.id, {
      fileMtimeMs: stat ? integer(stat.mtimeMs) : 0,
      fileSize: stat ? integer(stat.size) : 0,
      statsEndedAt: text(row?.updated_at, now()),
      ...ZERO_TOTALS,
      sourceMissing,
      lastError: error instanceof Error ? error.message : text(error),
    });
  }

  function syncSession(row, options = {}) {
    const { force = false } = options || {};
    const sessionFilePath = sessionFilePathFromRow(row);
    if (!sessionFilePath) return { status: 'skipped', reason: 'session_file_path missing' };

    if (!fs.existsSync(sessionFilePath)) {
      writeErrorSnapshot(row, new Error(`session file missing: ${sessionFilePath}`), true);
      return { status: 'failed', reason: 'source_missing' };
    }

    let stat;
    try {
      stat = fs.statSync(sessionFilePath);
    } catch (error) {
      writeErrorSnapshot(row, error, true);
      return { status: 'failed', reason: 'source_missing' };
    }

    const fingerprint = fileFingerprint(stat);
    repairUnknownRunAttribution(row);
    if (!force && getLastFingerprint(row) === fingerprint) {
      return { status: 'skipped', reason: 'unchanged' };
    }

    let stats;
    try {
      stats = readSessionStats({
        provider: providerFromRow(row),
        providerSessionId: providerSessionIdFromRow(row),
        row,
      });
    } catch (error) {
      logWarn('token-usage', 'Failed to read session token stats', {
        provider: providerFromRow(row),
        providerSessionId: providerSessionIdFromRow(row),
        sessionFilePath,
        error: error instanceof Error ? error.message : text(error),
      });
      writeErrorSnapshot(row, error, false, stat);
      return { status: 'failed', reason: 'parse_error' };
    }

    const run = startUnknownRunForSession(row);
    const delta = positiveDelta(totalsFromStats(stats), getAssignedTotals(row));
    tokenUsageStore.addSnapshotDelta(run.id, {
      fileMtimeMs: integer(stat.mtimeMs),
      fileSize: integer(stat.size),
      statsEndedAt: statsEndedAt(stats, row),
      ...delta,
      sourceMissing: false,
      lastError: '',
    });

    return { status: 'updated', run };
  }

  function uniqueRowsWithSessionFile(rows) {
    const seen = new Set();
    const output = [];
    for (const row of rows || []) {
      const sessionFilePath = sessionFilePathFromRow(row);
      if (!sessionFilePath) continue;
      const key = `${providerFromRow(row)}:${providerSessionIdFromRow(row)}:${sessionFilePath}`;
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(row);
    }
    return output;
  }

  function refresh(options = {}) {
    const rows = uniqueRowsWithSessionFile([
      ...(sessionStore.listAllActive() || []),
      ...(sessionStore.listAllArchived() || []),
    ]);
    const result = { scanned: 0, updated: 0, skipped: 0, failed: 0 };

    for (const row of rows) {
      result.scanned += 1;
      const outcome = syncSession(row, options);
      if (outcome.status === 'updated') result.updated += 1;
      else if (outcome.status === 'failed') result.failed += 1;
      else result.skipped += 1;
    }

    return result;
  }

  function finishActiveRunByProviderSession({ provider, providerSessionId, endedAt } = {}) {
    const normalizedProvider = text(provider, 'claude').trim().toLowerCase() || 'claude';
    const normalizedProviderSessionId = text(providerSessionId).trim();
    if (!normalizedProviderSessionId) return null;

    const row =
      sessionStore.getByProviderSessionId?.({
        provider: normalizedProvider,
        providerSessionId: normalizedProviderSessionId,
      }) || null;
    if (row) syncSession(row, { force: true });

    const activeRun =
      tokenUsageStore.getActiveRunByProviderSession({
        provider: normalizedProvider,
        providerSessionId: normalizedProviderSessionId,
      }) || null;
    if (!activeRun) return null;
    return tokenUsageStore.finishRun(activeRun.id, endedAt || now());
  }

  function finishActiveRunByRuntimeSessionId(sessionId, endedAt) {
    const providerSessionId = text(sessionId).trim();
    if (!providerSessionId) return null;
    for (const provider of PROVIDERS_BY_FINISH_ORDER) {
      let targetProviderSessionId = providerSessionId;
      let activeRun =
        tokenUsageStore.getActiveRunByProviderSession({
          provider,
          providerSessionId: targetProviderSessionId,
        }) || null;
      if (!activeRun) {
        const alias = providerSessionAliases.get(`${provider}:${providerSessionId}`);
        if (alias) {
          targetProviderSessionId = alias;
          activeRun =
            tokenUsageStore.getActiveRunByProviderSession({
              provider,
              providerSessionId: targetProviderSessionId,
            }) || null;
        }
      }
      if (!activeRun) continue;
      return finishActiveRunByProviderSession({
        provider,
        providerSessionId: targetProviderSessionId,
        endedAt,
      });
    }
    return null;
  }

  function reconcileProviderSessionId({
    provider,
    fromProviderSessionId,
    toProviderSessionId,
  } = {}) {
    const normalizedProvider = text(provider, 'claude').trim().toLowerCase() || 'claude';
    const fromId = text(fromProviderSessionId).trim();
    const toId = text(toProviderSessionId).trim();
    if (!fromId || !toId || fromId === toId) return { changed: false, count: 0 };
    if (typeof tokenUsageStore.reconcileProviderSessionId !== 'function') {
      return { changed: false, count: 0 };
    }

    const row =
      sessionStore.getByProviderSessionId?.({
        provider: normalizedProvider,
        providerSessionId: toId,
      }) || null;

    const result = tokenUsageStore.reconcileProviderSessionId({
      provider: normalizedProvider,
      fromProviderSessionId: fromId,
      toProviderSessionId: toId,
      sessionFilePath: sessionFilePathFromRow(row),
    });
    if (result?.changed) providerSessionAliases.set(`${normalizedProvider}:${fromId}`, toId);
    return result;
  }

  return {
    startRunForSession,
    syncSession,
    refresh,
    finishActiveRunByProviderSession,
    finishActiveRunByRuntimeSessionId,
    reconcileProviderSessionId,
  };
}

module.exports = { createTokenUsageSyncService };
