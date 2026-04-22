const Database = require("better-sqlite3");
const crypto = require("node:crypto");
const { DB_MODELS, buildSchemaSql } = require("./models");

function now() {
  return new Date().toISOString();
}

function id() {
  return crypto.randomUUID();
}

function initDatabase(filePath) {
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");

  db.exec(buildSchemaSql());

  // Migration for older local databases.
  ensureLegacyColumns(db);
  ensureSessionUniqueIndex(db);

  return db;
}

function ensureColumn(db, tableName, columnName, columnDef) {
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (cols.some((c) => c.name === columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
}

function ensureLegacyColumns(db) {
  const legacyColumns = [
    { table: DB_MODELS.sessions.tableName, column: "is_archived", def: "INTEGER NOT NULL DEFAULT 0" },
    { table: DB_MODELS.sessions.tableName, column: "archived_at", def: "TEXT" },
    { table: DB_MODELS.sessions.tableName, column: "provider_session_id", def: "TEXT" },
    { table: DB_MODELS.sessions.tableName, column: "cwd", def: "TEXT NOT NULL DEFAULT ''" },
    { table: DB_MODELS.sessions.tableName, column: "session_file_path", def: "TEXT" }
  ];

  for (const item of legacyColumns) {
    ensureColumn(db, item.table, item.column, item.def);
  }
}

function ensureSessionUniqueIndex(db) {
  // Backfill provider_session_id for old rows before adding unique index.
  db.exec(`
    UPDATE sessions
    SET provider_session_id = COALESCE(provider_session_id, id)
    WHERE provider_session_id IS NULL OR provider_session_id = '';
  `);

  // Keep newest row for duplicated provider/provider_session_id.
  db.exec(`
    DELETE FROM sessions
    WHERE id IN (
      SELECT s1.id
      FROM sessions s1
      JOIN sessions s2
        ON s1.provider = s2.provider
       AND s1.provider_session_id = s2.provider_session_id
       AND (
         COALESCE(s1.updated_at, s1.created_at, '') < COALESCE(s2.updated_at, s2.created_at, '')
         OR (
           COALESCE(s1.updated_at, s1.created_at, '') = COALESCE(s2.updated_at, s2.created_at, '')
           AND s1.id < s2.id
         )
       )
    );
  `);

  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_provider_sid_unique ON sessions(provider, provider_session_id);");
}

function projectsRepo(db) {
  return {
    list() {
      return db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all();
    },
    getById(projectId) {
      return db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
    },
    create({ name, path }) {
      const timestamp = now();
      const project = {
        id: id(),
        name,
        path,
        default_provider: "claude",
        created_at: timestamp,
        updated_at: timestamp
      };

      db.prepare(
        `INSERT OR REPLACE INTO projects (id, name, path, default_provider, created_at, updated_at)
         VALUES (@id, @name, @path, @default_provider, @created_at, @updated_at)`
      ).run(project);

      return project;
    },
    remove(projectId) {
      db.prepare("DELETE FROM sessions WHERE project_id = ?").run(projectId);
      return db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
    }
  };
}

function sessionsRepo(db) {
  function buildInClause(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return { sql: "", params: [] };
    const placeholders = ids.map(() => "?").join(", ");
    return { sql: ` AND s.project_id IN (${placeholders})`, params: ids };
  }

  function listByArchiveFlag(isArchived, projectIds = []) {
    const { sql, params } = buildInClause(projectIds);
    return db.prepare(
      `SELECT s.*, p.path AS project_path
       FROM sessions s
       LEFT JOIN projects p ON p.id = s.project_id
       WHERE s.is_archived = ?${sql}
       ORDER BY s.updated_at DESC`
    ).all(isArchived ? 1 : 0, ...params);
  }

  return {
    listAllActive(projectIds = []) {
      return listByArchiveFlag(false, projectIds);
    },
    listByProject(projectId) {
      return listByArchiveFlag(false, [projectId]);
    },
    listArchivedByProject(projectId) {
      return listByArchiveFlag(true, [projectId]);
    },
    listAllArchived(projectIds = []) {
      return listByArchiveFlag(true, projectIds);
    },
    getById(sessionId) {
      return db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
    },
    getByProviderSessionId({ provider, providerSessionId }) {
      return db
        .prepare("SELECT * FROM sessions WHERE provider = ? AND provider_session_id = ?")
        .get(provider, providerSessionId);
    },
    create({ projectId, title, provider, providerSessionId, cwd = "", sessionFilePath = null, status = "idle" }) {
      const timestamp = now();
      const session = {
        id: id(),
        project_id: projectId,
        title,
        provider,
        provider_session_id: providerSessionId,
        cwd,
        session_file_path: sessionFilePath,
        status,
        last_active_at: timestamp,
        created_at: timestamp,
        updated_at: timestamp,
        is_archived: 0,
        archived_at: null
      };

      db.prepare(
        `INSERT INTO sessions (
          id, project_id, title, provider, provider_session_id, cwd, session_file_path,
          status, last_active_at, created_at, updated_at, is_archived, archived_at
        ) VALUES (
          @id, @project_id, @title, @provider, @provider_session_id, @cwd, @session_file_path,
          @status, @last_active_at, @created_at, @updated_at, @is_archived, @archived_at
        )`
      ).run(session);

      return session;
    },
    upsertDiscovered({ projectId, title, provider, providerSessionId, cwd = "", sessionFilePath = null, createdAt }) {
      const timestamp = now();
      const createdAtIso = Number.isFinite(createdAt) ? new Date(createdAt).toISOString() : timestamp;
      db.prepare(
        `INSERT INTO sessions (
          id, project_id, title, provider, provider_session_id, cwd, session_file_path,
          status, last_active_at, created_at, updated_at, is_archived, archived_at
        ) VALUES (
          @id, @project_id, @title, @provider, @provider_session_id, @cwd, @session_file_path,
          @status, @last_active_at, @created_at, @updated_at, @is_archived, @archived_at
        )
        ON CONFLICT(provider, provider_session_id) DO UPDATE SET
          project_id = excluded.project_id,
          title = excluded.title,
          cwd = excluded.cwd,
          session_file_path = COALESCE(excluded.session_file_path, sessions.session_file_path),
          updated_at = excluded.updated_at`
      ).run({
        id: id(),
        project_id: projectId,
        title,
        provider,
        provider_session_id: providerSessionId,
        cwd,
        session_file_path: sessionFilePath,
        status: "exited",
        last_active_at: createdAtIso,
        created_at: createdAtIso,
        updated_at: timestamp,
        is_archived: 0,
        archived_at: null
      });
    },
    updateStateByProviderSessionId({ provider, providerSessionId, status }) {
      const timestamp = now();
      db.prepare(
        "UPDATE sessions SET status = ?, last_active_at = ?, updated_at = ? WHERE provider = ? AND provider_session_id = ?"
      ).run(status, timestamp, timestamp, provider, providerSessionId);
    },
    renameByProviderSessionId({ provider, providerSessionId, title }) {
      const timestamp = now();
      db.prepare(
        "UPDATE sessions SET title = ?, updated_at = ? WHERE provider = ? AND provider_session_id = ?"
      ).run(title, timestamp, provider, providerSessionId);
    },
    archiveByProviderSessionId({ provider, providerSessionId }) {
      const timestamp = now();
      db.prepare(
        "UPDATE sessions SET is_archived = 1, archived_at = ?, updated_at = ? WHERE provider = ? AND provider_session_id = ?"
      ).run(timestamp, timestamp, provider, providerSessionId);
    },
    restoreByProviderSessionId({ provider, providerSessionId }) {
      const timestamp = now();
      db.prepare(
        "UPDATE sessions SET is_archived = 0, archived_at = NULL, updated_at = ? WHERE provider = ? AND provider_session_id = ?"
      ).run(timestamp, provider, providerSessionId);
    },
    markAllStopped() {
      const timestamp = now();
      db.prepare(
        "UPDATE sessions SET status = 'exited', updated_at = ? WHERE status = 'running'"
      ).run(timestamp);
    }
  };
}

module.exports = {
  initDatabase,
  projectsRepo,
  sessionsRepo,
  settingsRepo
};

function settingsRepo(db) {
  const SETTINGS_KEY = "provider_startup_settings";
  const defaultValue = {
    providers: {
      claude: {
        defaultProfileId: "default",
        profiles: [{ id: "default", name: "Default Provider", envVars: [] }]
      },
      codex: {
        defaultProfileId: "default",
        profiles: [{ id: "default", name: "Default Provider", envVars: [] }]
      },
      gemini: {
        defaultProfileId: "default",
        profiles: [{ id: "default", name: "Default Provider", envVars: [] }]
      }
    }
  };

  function ensureProviderShape(input) {
    const normalized = { ...defaultValue, ...(input || {}) };
    const providers = { ...(normalized.providers || {}) };
    for (const provider of ["claude", "codex", "gemini"]) {
      const current = providers[provider] || {};
      const profiles = Array.isArray(current.profiles) && current.profiles.length > 0
        ? current.profiles.map((profile, idx) => ({
          id: String(profile?.id || `default-${idx + 1}`),
          name: String(profile?.name || `Provider ${idx + 1}`),
          envVars: Array.isArray(profile?.envVars) ? profile.envVars : []
        }))
        : [{ id: "default", name: "Default Provider", envVars: [] }];
      const defaultProfileId = profiles.some((p) => p.id === current.defaultProfileId)
        ? current.defaultProfileId
        : profiles[0].id;
      providers[provider] = { defaultProfileId, profiles };
    }
    return { providers };
  }

  return {
    getProviderStartupSettings() {
      const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(SETTINGS_KEY);
      if (!row) return defaultValue;

      try {
        const parsed = JSON.parse(row.value || "{}");

        if (parsed?.providers && typeof parsed.providers === "object") {
          return ensureProviderShape(parsed);
        }

        // Compatibility: migrate old simple envVars format.
        if (Array.isArray(parsed?.envVars)) {
          return ensureProviderShape({
            providers: {
              claude: {
                defaultProfileId: "default",
                profiles: [{ id: "default", name: "Default Provider", envVars: parsed.envVars }]
              }
            }
          });
        }

        const migrated = [];
        if (parsed?.apiUrl) migrated.push({ key: "ANTHROPIC_BASE_URL", value: parsed.apiUrl });
        if (parsed?.apiKey) {
          const keyName = parsed?.apiKeyEnvVarName || "ANTHROPIC_API_KEY";
          migrated.push({ key: keyName, value: parsed.apiKey });
        }
        if (parsed?.model) migrated.push({ key: "ANTHROPIC_MODEL", value: parsed.model });
        for (const pair of parsed?.additionalEnvVars || []) {
          if (!pair?.key) continue;
          migrated.push({ key: pair.key, value: pair.value || "" });
        }
        return ensureProviderShape({
          providers: {
            claude: {
              defaultProfileId: "default",
              profiles: [{ id: "default", name: "Default Provider", envVars: migrated }]
            }
          }
        });
      } catch {
        return defaultValue;
      }
    },
    setProviderStartupSettings(value) {
      const normalized = ensureProviderShape(value);
      const timestamp = now();
      db.prepare(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).run(SETTINGS_KEY, JSON.stringify(normalized), timestamp);
      return normalized;
    }
  };
}
