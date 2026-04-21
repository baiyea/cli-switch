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
    { table: DB_MODELS.sessionArchives.tableName, column: "project_id", def: "TEXT" },
    { table: DB_MODELS.sessionArchives.tableName, column: "provider", def: "TEXT NOT NULL DEFAULT 'claude'" },
    { table: DB_MODELS.sessionArchives.tableName, column: "title", def: "TEXT" },
    { table: DB_MODELS.sessionArchives.tableName, column: "cwd", def: "TEXT NOT NULL DEFAULT ''" },
    { table: DB_MODELS.sessionArchives.tableName, column: "archived_at", def: "TEXT" },
    { table: DB_MODELS.sessionArchives.tableName, column: "updated_at", def: "TEXT" }
  ];

  for (const item of legacyColumns) {
    ensureColumn(db, item.table, item.column, item.def);
  }
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
  return {
    listAllActive() {
      return db
        .prepare("SELECT * FROM sessions WHERE is_archived = 0 ORDER BY updated_at DESC")
        .all();
    },
    listByProject(projectId) {
      return db
        .prepare("SELECT * FROM sessions WHERE project_id = ? AND is_archived = 0 ORDER BY created_at DESC")
        .all(projectId);
    },
    listArchivedByProject(projectId) {
      return db
        .prepare("SELECT * FROM sessions WHERE project_id = ? AND is_archived = 1 ORDER BY archived_at DESC")
        .all(projectId);
    },
    getById(sessionId) {
      return db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
    },
    create({ projectId, title, provider, cwd }) {
      const timestamp = now();
      const session = {
        id: id(),
        project_id: projectId,
        title,
        provider,
        provider_session_id: null,
        cwd,
        status: "idle",
        last_active_at: timestamp,
        created_at: timestamp,
        updated_at: timestamp,
        is_archived: 0,
        archived_at: null
      };

      db.prepare(
        `INSERT INTO sessions (
          id, project_id, title, provider, provider_session_id, cwd,
          status, last_active_at, created_at, updated_at, is_archived, archived_at
        ) VALUES (
          @id, @project_id, @title, @provider, @provider_session_id, @cwd,
          @status, @last_active_at, @created_at, @updated_at, @is_archived, @archived_at
        )`
      ).run(session);

      return session;
    },
    updateState({ sessionId, status }) {
      const timestamp = now();
      db.prepare(
        "UPDATE sessions SET status = ?, last_active_at = ?, updated_at = ? WHERE id = ?"
      ).run(status, timestamp, timestamp, sessionId);
    },
    updateProviderSessionId({ sessionId, providerSessionId }) {
      const timestamp = now();
      db.prepare(
        "UPDATE sessions SET provider_session_id = ?, updated_at = ? WHERE id = ?"
      ).run(providerSessionId, timestamp, sessionId);
    },
    rename({ sessionId, title }) {
      const timestamp = now();
      db.prepare("UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?").run(title, timestamp, sessionId);
    },
    archive(sessionId) {
      const timestamp = now();
      db.prepare(
        "UPDATE sessions SET is_archived = 1, archived_at = ?, updated_at = ? WHERE id = ?"
      ).run(timestamp, timestamp, sessionId);
    },
    restore(sessionId) {
      const timestamp = now();
      db.prepare(
        "UPDATE sessions SET is_archived = 0, archived_at = NULL, updated_at = ? WHERE id = ?"
      ).run(timestamp, sessionId);
    },
    markAllStopped() {
      const timestamp = now();
      db.prepare(
        "UPDATE sessions SET status = 'stopped', updated_at = ? WHERE status = 'running'"
      ).run(timestamp);
    }
  };
}

module.exports = {
  initDatabase,
  projectsRepo,
  sessionsRepo,
  sessionArchiveRepo,
  settingsRepo
};

function sessionArchiveRepo(db) {
  return {
    list() {
      return db
        .prepare(
          "SELECT session_id, provider, project_id, title, cwd, archived_at, updated_at FROM session_archives ORDER BY archived_at DESC"
        )
        .all();
    },
    listIds() {
      const rows = db.prepare("SELECT session_id FROM session_archives").all();
      return rows.map((row) => row.session_id);
    },
    archive({ sessionId, provider = "claude", projectId = null, title = null, cwd }) {
      const archiveId = `${String(provider || "claude").toLowerCase()}:${sessionId}`;
      const timestamp = now();
      db.prepare(
        `INSERT INTO session_archives (session_id, provider, project_id, title, cwd, archived_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           provider = excluded.provider,
           project_id = excluded.project_id,
           title = excluded.title,
           cwd = excluded.cwd,
           archived_at = excluded.archived_at,
           updated_at = excluded.updated_at`
      ).run(archiveId, provider, projectId, title, cwd, timestamp, timestamp);
    },
    restore(archiveId) {
      db.prepare("DELETE FROM session_archives WHERE session_id = ?").run(archiveId);
    }
  };
}

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
