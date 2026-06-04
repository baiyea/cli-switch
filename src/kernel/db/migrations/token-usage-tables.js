function ensureTokenUsageTables(conn) {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS token_usage_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_session_id TEXT NOT NULL,
      profile_id TEXT NOT NULL DEFAULT '',
      profile_name TEXT NOT NULL DEFAULT '',
      model_name TEXT NOT NULL DEFAULT '',
      api_base_host TEXT NOT NULL DEFAULT '',
      env_fingerprint TEXT NOT NULL DEFAULT '',
      session_file_path TEXT NOT NULL DEFAULT '',
      run_started_at TEXT NOT NULL,
      run_ended_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS token_usage_snapshots (
      run_id TEXT PRIMARY KEY,
      file_mtime_ms INTEGER NOT NULL DEFAULT 0,
      file_size INTEGER NOT NULL DEFAULT 0,
      stats_ended_at TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cached_tokens INTEGER NOT NULL DEFAULT 0,
      reasoning_tokens INTEGER NOT NULL DEFAULT 0,
      tool_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      rounds INTEGER NOT NULL DEFAULT 0,
      source_missing INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES token_usage_runs(id)
    );

    CREATE INDEX IF NOT EXISTS idx_token_usage_runs_session
      ON token_usage_runs(provider, provider_session_id, run_started_at);
    CREATE INDEX IF NOT EXISTS idx_token_usage_runs_project
      ON token_usage_runs(project_id, run_started_at);
    CREATE INDEX IF NOT EXISTS idx_token_usage_runs_model
      ON token_usage_runs(provider, model_name, api_base_host);
  `);
}

module.exports = { ensureTokenUsageTables };
