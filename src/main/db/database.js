const Database = require("better-sqlite3");
const crypto = require("node:crypto");

function now() {
  return new Date().toISOString();
}

function id() {
  return crypto.randomUUID();
}

function initDatabase(filePath) {
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      default_provider TEXT NOT NULL DEFAULT 'claude',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_session_id TEXT,
      cwd TEXT NOT NULL,
      status TEXT NOT NULL,
      last_active_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      is_archived INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT,
      FOREIGN KEY(project_id) REFERENCES projects(id)
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_provider_sid ON sessions(provider, provider_session_id);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Migration for older local databases.
  ensureColumn(db, "sessions", "is_archived", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "sessions", "archived_at", "TEXT");

  return db;
}

function ensureColumn(db, tableName, columnName, columnDef) {
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (cols.some((c) => c.name === columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
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
  const SETTINGS_KEY = "claude_startup_settings";
  const defaultValue = {
    apiUrl: "",
    apiKey: "",
    apiKeyEnvVarName: "ANTHROPIC_API_KEY",
    model: "",
    additionalEnvVars: []
  };

  return {
    getClaudeStartupSettings() {
      const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(SETTINGS_KEY);
      if (!row) return defaultValue;

      try {
        return { ...defaultValue, ...JSON.parse(row.value || "{}") };
      } catch {
        return defaultValue;
      }
    },
    setClaudeStartupSettings(value) {
      const timestamp = now();
      db.prepare(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).run(SETTINGS_KEY, JSON.stringify(value), timestamp);
      return value;
    }
  };
}
