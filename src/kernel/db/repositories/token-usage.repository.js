function createTokenUsageRepo({ getDatabase, now, genId }) {
  if (typeof getDatabase !== 'function')
    throw new TypeError('createTokenUsageRepo: getDatabase must be a function');
  if (typeof now !== 'function') throw new TypeError('createTokenUsageRepo: now must be a function');
  if (typeof genId !== 'function')
    throw new TypeError('createTokenUsageRepo: genId must be a function');

  const conn = getDatabase();
  const zeroTotals = {
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    reasoningTokens: 0,
    toolTokens: 0,
    totalTokens: 0,
    rounds: 0,
  };

  function text(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    return String(value);
  }

  function integer(value) {
    const next = Number(value || 0);
    if (!Number.isFinite(next)) return 0;
    return Math.max(0, Math.floor(next));
  }

  function totalsFromRow(row) {
    if (!row) return { ...zeroTotals };
    return {
      inputTokens: integer(row.input_tokens),
      outputTokens: integer(row.output_tokens),
      cachedTokens: integer(row.cached_tokens),
      reasoningTokens: integer(row.reasoning_tokens),
      toolTokens: integer(row.tool_tokens),
      totalTokens: integer(row.total_tokens),
      rounds: integer(row.rounds),
    };
  }

  function buildSummaryWhere(filters = {}) {
    const clauses = [];
    const params = [];
    const range = String(filters.range || '30d');

    if (range === '7d' || range === '30d') {
      const days = range === '7d' ? 7 : 30;
      const cutoff = new Date(now());
      cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
      cutoff.setUTCHours(0, 0, 0, 0);
      clauses.push("COALESCE(s.stats_ended_at, r.run_ended_at, r.updated_at) >= ?");
      params.push(cutoff.toISOString());
    }
    if (filters.projectId) {
      clauses.push('r.project_id = ?');
      params.push(String(filters.projectId));
    }
    if (filters.provider) {
      clauses.push('r.provider = ?');
      params.push(String(filters.provider));
    }
    if (filters.modelName) {
      clauses.push('r.model_name = ?');
      params.push(String(filters.modelName));
    }

    return {
      sql: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '',
      params,
    };
  }

  function getSnapshot(runId) {
    return conn.prepare('SELECT * FROM token_usage_snapshots WHERE run_id = ?').get(runId);
  }

  function getLatestRunByProviderSession({ provider, providerSessionId }) {
    return conn
      .prepare(
        `SELECT * FROM token_usage_runs
         WHERE provider = ? AND provider_session_id = ?
         ORDER BY run_started_at DESC, created_at DESC, id DESC
         LIMIT 1`,
      )
      .get(provider, providerSessionId);
  }

  return {
    startRun(payload = {}) {
      const timestamp = now();
      const run = {
        id: genId(),
        project_id: text(payload.projectId),
        session_id: text(payload.sessionId),
        provider: text(payload.provider),
        provider_session_id: text(payload.providerSessionId),
        profile_id: text(payload.profileId),
        profile_name: text(payload.profileName),
        model_name: text(payload.modelName),
        api_base_host: text(payload.apiBaseHost),
        env_fingerprint: text(payload.envFingerprint),
        session_file_path: text(payload.sessionFilePath),
        run_started_at: text(payload.runStartedAt, timestamp),
        run_ended_at: payload.runEndedAt ? text(payload.runEndedAt) : null,
        created_at: timestamp,
        updated_at: timestamp,
      };

      conn
        .prepare(
          `INSERT INTO token_usage_runs (
            id, project_id, session_id, provider, provider_session_id,
            profile_id, profile_name, model_name, api_base_host, env_fingerprint,
            session_file_path, run_started_at, run_ended_at, created_at, updated_at
          ) VALUES (
            @id, @project_id, @session_id, @provider, @provider_session_id,
            @profile_id, @profile_name, @model_name, @api_base_host, @env_fingerprint,
            @session_file_path, @run_started_at, @run_ended_at, @created_at, @updated_at
          )`,
        )
        .run(run);
      return run;
    },

    getActiveRunByProviderSession({ provider, providerSessionId }) {
      return conn
        .prepare(
          `SELECT * FROM token_usage_runs
           WHERE provider = ? AND provider_session_id = ? AND run_ended_at IS NULL
           ORDER BY run_started_at DESC, created_at DESC, id DESC
           LIMIT 1`,
        )
        .get(provider, providerSessionId);
    },

    getLatestRunByProviderSession({ provider, providerSessionId }) {
      return getLatestRunByProviderSession({ provider, providerSessionId });
    },

    finishRun(runId, endedAt = now()) {
      const timestamp = now();
      conn
        .prepare(
          'UPDATE token_usage_runs SET run_ended_at = ?, updated_at = ? WHERE id = ?',
        )
        .run(endedAt, timestamp, runId);
      return conn.prepare('SELECT * FROM token_usage_runs WHERE id = ?').get(runId);
    },

    addSnapshotDelta(runId, delta = {}) {
      const timestamp = now();
      const snapshot = {
        run_id: runId,
        file_mtime_ms: integer(delta.fileMtimeMs),
        file_size: integer(delta.fileSize),
        stats_ended_at: delta.statsEndedAt ? text(delta.statsEndedAt) : null,
        input_tokens: integer(delta.inputTokens),
        output_tokens: integer(delta.outputTokens),
        cached_tokens: integer(delta.cachedTokens),
        reasoning_tokens: integer(delta.reasoningTokens),
        tool_tokens: integer(delta.toolTokens),
        total_tokens: integer(delta.totalTokens),
        rounds: integer(delta.rounds),
        source_missing: delta.sourceMissing ? 1 : 0,
        last_error: text(delta.lastError),
        updated_at: timestamp,
      };

      conn
        .prepare(
          `INSERT INTO token_usage_snapshots (
            run_id, file_mtime_ms, file_size, stats_ended_at,
            input_tokens, output_tokens, cached_tokens, reasoning_tokens,
            tool_tokens, total_tokens, rounds, source_missing, last_error, updated_at
          ) VALUES (
            @run_id, @file_mtime_ms, @file_size, @stats_ended_at,
            @input_tokens, @output_tokens, @cached_tokens, @reasoning_tokens,
            @tool_tokens, @total_tokens, @rounds, @source_missing, @last_error, @updated_at
          )
          ON CONFLICT(run_id) DO UPDATE SET
            file_mtime_ms = excluded.file_mtime_ms,
            file_size = excluded.file_size,
            stats_ended_at = COALESCE(excluded.stats_ended_at, token_usage_snapshots.stats_ended_at),
            input_tokens = token_usage_snapshots.input_tokens + excluded.input_tokens,
            output_tokens = token_usage_snapshots.output_tokens + excluded.output_tokens,
            cached_tokens = token_usage_snapshots.cached_tokens + excluded.cached_tokens,
            reasoning_tokens = token_usage_snapshots.reasoning_tokens + excluded.reasoning_tokens,
            tool_tokens = token_usage_snapshots.tool_tokens + excluded.tool_tokens,
            total_tokens = token_usage_snapshots.total_tokens + excluded.total_tokens,
            rounds = token_usage_snapshots.rounds + excluded.rounds,
            source_missing = excluded.source_missing,
            last_error = excluded.last_error,
            updated_at = excluded.updated_at`,
        )
        .run(snapshot);

      conn
        .prepare('UPDATE token_usage_runs SET updated_at = ? WHERE id = ?')
        .run(timestamp, runId);

      return getSnapshot(runId);
    },

    getAssignedTotals({ provider, providerSessionId }) {
      const row = conn
        .prepare(
          `SELECT
             COALESCE(SUM(s.input_tokens), 0) AS input_tokens,
             COALESCE(SUM(s.output_tokens), 0) AS output_tokens,
             COALESCE(SUM(s.cached_tokens), 0) AS cached_tokens,
             COALESCE(SUM(s.reasoning_tokens), 0) AS reasoning_tokens,
             COALESCE(SUM(s.tool_tokens), 0) AS tool_tokens,
             COALESCE(SUM(s.total_tokens), 0) AS total_tokens,
             COALESCE(SUM(s.rounds), 0) AS rounds
           FROM token_usage_runs r
           LEFT JOIN token_usage_snapshots s ON s.run_id = r.id
           WHERE r.provider = ? AND r.provider_session_id = ?`,
        )
        .get(provider, providerSessionId);
      return totalsFromRow(row);
    },

    getLastFingerprint({ provider, providerSessionId }) {
      const run = getLatestRunByProviderSession({ provider, providerSessionId });
      if (!run?.id) return '';
      const snapshot = getSnapshot(run.id);
      if (!snapshot) return '';
      const fileMtimeMs = Number(snapshot.file_mtime_ms);
      const fileSize = Number(snapshot.file_size);
      if (!Number.isFinite(fileMtimeMs) || !Number.isFinite(fileSize)) return '';
      return `${Math.max(0, Math.floor(fileMtimeMs))}:${Math.max(0, Math.floor(fileSize))}`;
    },

    getSummary(filters = {}) {
      const { sql, params } = buildSummaryWhere(filters);
      const totalsRow = conn
        .prepare(
          `SELECT
             COUNT(DISTINCT r.id) AS run_count,
             COALESCE(SUM(s.input_tokens), 0) AS input_tokens,
             COALESCE(SUM(s.output_tokens), 0) AS output_tokens,
             COALESCE(SUM(s.cached_tokens), 0) AS cached_tokens,
             COALESCE(SUM(s.reasoning_tokens), 0) AS reasoning_tokens,
             COALESCE(SUM(s.tool_tokens), 0) AS tool_tokens,
             COALESCE(SUM(s.total_tokens), 0) AS total_tokens,
             COALESCE(SUM(s.rounds), 0) AS rounds
           FROM token_usage_runs r
           LEFT JOIN token_usage_snapshots s ON s.run_id = r.id${sql}`,
        )
        .get(...params);
      const modelRows = conn
        .prepare(
          `SELECT
             r.provider,
             r.model_name,
             r.profile_name,
             r.api_base_host,
             COUNT(DISTINCT r.id) AS run_count,
             COALESCE(SUM(s.total_tokens), 0) AS total_tokens
           FROM token_usage_runs r
           LEFT JOIN token_usage_snapshots s ON s.run_id = r.id${sql}
           GROUP BY r.provider, r.model_name, r.profile_name, r.api_base_host
           ORDER BY total_tokens DESC, r.provider ASC, r.model_name ASC`,
        )
        .all(...params);
      const dailyRows = conn
        .prepare(
          `SELECT
             substr(COALESCE(s.stats_ended_at, r.run_ended_at, r.updated_at), 1, 10) AS date,
             COALESCE(SUM(s.total_tokens), 0) AS total_tokens
           FROM token_usage_runs r
           LEFT JOIN token_usage_snapshots s ON s.run_id = r.id${sql}
           GROUP BY date
           ORDER BY date ASC`,
        )
        .all(...params);
      const statusRow = conn
        .prepare(
          `SELECT
             COALESCE(SUM(CASE WHEN r.run_ended_at IS NULL THEN 1 ELSE 0 END), 0) AS running,
             MAX(r.run_ended_at) AS last_finished_at
           FROM token_usage_runs r
           LEFT JOIN token_usage_snapshots s ON s.run_id = r.id${sql}`,
        )
        .get(...params);

      return {
        totals: {
          runCount: integer(totalsRow?.run_count),
          ...totalsFromRow(totalsRow),
        },
        models: modelRows.map((row) => ({
          provider: text(row.provider),
          modelName: text(row.model_name),
          profileName: text(row.profile_name),
          apiBaseHost: text(row.api_base_host),
          runCount: integer(row.run_count),
          totalTokens: integer(row.total_tokens),
        })),
        daily: dailyRows.map((row) => ({
          date: text(row.date),
          totalTokens: integer(row.total_tokens),
        })),
        status: {
          running: integer(statusRow?.running),
          lastFinishedAt: statusRow?.last_finished_at || null,
        },
      };
    },
  };
}

module.exports = { createTokenUsageRepo };
