const Database = require("better-sqlite3");
const crypto = require("node:crypto");
const path = require("node:path");
const { getAppHomeDir, ensureDir } = require("../test-mode");
const { DB_FILENAME } = require("../config");
const { DB_MODELS, buildSchemaSql } = require("./models");

let db = null;

function now() {
  return new Date().toISOString();
}

function genId() {
  return crypto.randomUUID();
}

function getDbPath() {
  const home = getAppHomeDir();
  ensureDir(home);
  return path.join(home, DB_FILENAME);
}

function initDatabase() {
  if (db) return db;
  const dbPath = getDbPath();
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(buildSchemaSql());
  ensureLegacyColumns(db);
  ensureSessionUniqueIndex(db);
  ensureSessionSortOrder(db);
  return db;
}

function getDatabase() {
  if (!db) throw new Error("Database not initialized. Call initDatabase() first.");
  return db;
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

function ensureColumn(conn, tableName, columnName, columnDef) {
  const cols = conn.prepare(`PRAGMA table_info(${tableName})`).all();
  if (cols.some((c) => c.name === columnName)) return;
  conn.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
}

function ensureLegacyColumns(conn) {
  const legacyColumns = [
    { table: DB_MODELS.sessions.tableName, column: "is_archived", def: "INTEGER NOT NULL DEFAULT 0" },
    { table: DB_MODELS.sessions.tableName, column: "archived_at", def: "TEXT" },
    { table: DB_MODELS.sessions.tableName, column: "provider_session_id", def: "TEXT" },
    { table: DB_MODELS.sessions.tableName, column: "cwd", def: "TEXT NOT NULL DEFAULT ''" },
    { table: DB_MODELS.sessions.tableName, column: "session_file_path", def: "TEXT" },
    { table: DB_MODELS.sessions.tableName, column: "sort_order", def: "INTEGER NOT NULL DEFAULT 0" }
  ];
  for (const item of legacyColumns) {
    ensureColumn(conn, item.table, item.column, item.def);
  }
}

function ensureSessionUniqueIndex(conn) {
  conn.exec(`
    UPDATE sessions
    SET provider_session_id = COALESCE(provider_session_id, id)
    WHERE provider_session_id IS NULL OR provider_session_id = '';
  `);
  conn.exec(`
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
  conn.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_provider_sid_unique ON sessions(provider, provider_session_id);");
}

function ensureSessionSortOrder(conn) {
  ensureColumn(conn, DB_MODELS.sessions.tableName, "sort_order", "INTEGER NOT NULL DEFAULT 0");
  conn.exec(`
    WITH ranked AS (
      SELECT
        id,
        -ROW_NUMBER() OVER (
          PARTITION BY project_id
          ORDER BY COALESCE(created_at, '') ASC, id ASC
        ) AS next_sort_order
      FROM sessions
      WHERE COALESCE(sort_order, 0) = 0
    )
    UPDATE sessions
    SET sort_order = (
      SELECT next_sort_order
      FROM ranked
      WHERE ranked.id = sessions.id
    )
    WHERE id IN (SELECT id FROM ranked);
  `);
}

// ---- Repositories ----

function projectsRepo() {
  const conn = getDatabase();
  return {
    list() {
      return conn.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all();
    },
    getById(projectId) {
      return conn.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
    },
    create({ name, path: projectPath }) {
      const timestamp = now();
      const project = {
        id: genId(),
        name,
        path: projectPath,
        default_provider: "claude",
        created_at: timestamp,
        updated_at: timestamp
      };
      conn.prepare(
        `INSERT OR REPLACE INTO projects (id, name, path, default_provider, created_at, updated_at)
         VALUES (@id, @name, @path, @default_provider, @created_at, @updated_at)`
      ).run(project);
      return project;
    },
    remove(projectId) {
      conn.prepare("DELETE FROM sessions WHERE project_id = ?").run(projectId);
      return conn.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
    }
  };
}

function sessionsRepo() {
  const conn = getDatabase();

  function isLocalGeneratedProviderSessionId(provider, providerSessionId) {
    const value = String(providerSessionId || "");
    return new RegExp(`^${String(provider || "").toLowerCase()}-\\d+-[a-f0-9]+$`, "i").test(value);
  }

  function buildInClause(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return { sql: "", params: [] };
    const placeholders = ids.map(() => "?").join(", ");
    return { sql: ` AND s.project_id IN (${placeholders})`, params: ids };
  }

  function getNextSortOrder(projectId) {
    const row = conn.prepare(
      `SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order
       FROM sessions WHERE project_id = ? AND is_archived = 0`
    ).get(projectId);
    return Number(row?.max_sort_order || 0) + 1;
  }

  function getNextBottomSortOrder(projectId) {
    const row = conn.prepare(
      `SELECT COALESCE(MIN(sort_order), 0) AS min_sort_order
       FROM sessions WHERE project_id = ? AND is_archived = 0`
    ).get(projectId);
    return Number(row?.min_sort_order || 0) - 1;
  }

  function listByArchiveFlag(isArchived, projectIds = []) {
    const { sql, params } = buildInClause(projectIds);
    return conn.prepare(
      `SELECT s.*, p.path AS project_path
       FROM sessions s LEFT JOIN projects p ON p.id = s.project_id
       WHERE s.is_archived = ?${sql}
       ORDER BY COALESCE(s.sort_order, 0) DESC, s.created_at DESC`
    ).all(isArchived ? 1 : 0, ...params);
  }

  return {
    listAllActive(projectIds = []) { return listByArchiveFlag(false, projectIds); },
    listByProject(projectId) { return listByArchiveFlag(false, [projectId]); },
    listArchivedByProject(projectId) { return listByArchiveFlag(true, [projectId]); },
    listAllArchived(projectIds = []) { return listByArchiveFlag(true, projectIds); },
    listActiveWithSessionFileByProject(projectId) {
      return conn.prepare(
        `SELECT s.*, p.path AS project_path FROM sessions s LEFT JOIN projects p ON p.id = s.project_id
         WHERE s.project_id = ? AND s.is_archived = 0 AND s.session_file_path IS NOT NULL AND s.session_file_path <> ''
         ORDER BY s.updated_at DESC`
      ).all(projectId);
    },
    getById(sessionId) {
      return conn.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
    },
    getByProviderSessionId({ provider, providerSessionId }) {
      return conn.prepare("SELECT * FROM sessions WHERE provider = ? AND provider_session_id = ?").get(provider, providerSessionId);
    },
    create({ projectId, title, provider, providerSessionId, cwd = "", sessionFilePath = null, status = "idle" }) {
      const timestamp = now();
      const sortOrder = getNextSortOrder(projectId);
      const session = {
        id: genId(), project_id: projectId, title, provider, provider_session_id: providerSessionId,
        cwd, session_file_path: sessionFilePath, status, sort_order: sortOrder,
        last_active_at: timestamp, created_at: timestamp, updated_at: timestamp,
        is_archived: 0, archived_at: null
      };
      conn.prepare(
        `INSERT INTO sessions (id, project_id, title, provider, provider_session_id, cwd, session_file_path,
         status, sort_order, last_active_at, created_at, updated_at, is_archived, archived_at)
         VALUES (@id, @project_id, @title, @provider, @provider_session_id, @cwd, @session_file_path,
         @status, @sort_order, @last_active_at, @created_at, @updated_at, @is_archived, @archived_at)`
      ).run(session);
      return session;
    },
    upsertDiscovered({ projectId, title, provider, providerSessionId, cwd = "", sessionFilePath = null, createdAt }) {
      const timestamp = now();
      const createdAtIso = Number.isFinite(createdAt) ? new Date(createdAt).toISOString() : timestamp;
      const sortOrder = getNextBottomSortOrder(projectId);
      conn.prepare(
        `INSERT INTO sessions (id, project_id, title, provider, provider_session_id, cwd, session_file_path,
         status, sort_order, last_active_at, created_at, updated_at, is_archived, archived_at)
         VALUES (@id, @project_id, @title, @provider, @provider_session_id, @cwd, @session_file_path,
         @status, @sort_order, @last_active_at, @created_at, @updated_at, @is_archived, @archived_at)
         ON CONFLICT(provider, provider_session_id) DO UPDATE SET
           project_id = excluded.project_id, title = excluded.title, cwd = excluded.cwd,
           session_file_path = COALESCE(excluded.session_file_path, sessions.session_file_path),
           updated_at = excluded.updated_at`
      ).run({
        id: genId(), project_id: projectId, title, provider, provider_session_id: providerSessionId,
        cwd, session_file_path: sessionFilePath, status: "exited", sort_order: sortOrder,
        last_active_at: createdAtIso, created_at: createdAtIso, updated_at: timestamp,
        is_archived: 0, archived_at: null
      });
    },
    reconcileDiscovered({ projectId, title, provider, providerSessionId, cwd = "", sessionFilePath = null, createdAt }) {
      const existing = conn.prepare("SELECT * FROM sessions WHERE provider = ? AND provider_session_id = ?").get(provider, providerSessionId);
      if (existing) {
        this.upsertDiscovered({ projectId, title, provider, providerSessionId, cwd, sessionFilePath, createdAt });
        return { ok: true, fromProviderSessionId: providerSessionId, toProviderSessionId: providerSessionId, reconciled: false };
      }
      const candidate = conn.prepare(
        `SELECT * FROM sessions WHERE provider = ? AND project_id = ? AND cwd = ? AND is_archived = 0 AND session_file_path IS NULL ORDER BY updated_at DESC`
      ).all(provider, projectId, cwd).find((row) => isLocalGeneratedProviderSessionId(provider, row.provider_session_id));
      if (!candidate) {
        this.upsertDiscovered({ projectId, title, provider, providerSessionId, cwd, sessionFilePath, createdAt });
        return { ok: true, fromProviderSessionId: providerSessionId, toProviderSessionId: providerSessionId, reconciled: false };
      }
      const timestamp = now();
      const createdAtIso = Number.isFinite(createdAt) ? new Date(createdAt).toISOString() : timestamp;
      const shouldReplaceTitle = new RegExp(`^${String(provider)}-\\d+`, "i").test(String(candidate.title || ""));
      conn.prepare(
        `UPDATE sessions SET provider_session_id = ?, title = ?, cwd = ?, session_file_path = ?, last_active_at = ?, updated_at = ? WHERE id = ?`
      ).run(providerSessionId, shouldReplaceTitle ? title : candidate.title, cwd, sessionFilePath, createdAtIso, timestamp, candidate.id);
      return { ok: true, fromProviderSessionId: candidate.provider_session_id, toProviderSessionId: providerSessionId, reconciled: true };
    },
    updateStateByProviderSessionId({ provider, providerSessionId, status }) {
      const timestamp = now();
      conn.prepare("UPDATE sessions SET status = ?, last_active_at = ?, updated_at = ? WHERE provider = ? AND provider_session_id = ?")
        .run(status, timestamp, timestamp, provider, providerSessionId);
    },
    renameByProviderSessionId({ provider, providerSessionId, title }) {
      conn.prepare("UPDATE sessions SET title = ?, updated_at = ? WHERE provider = ? AND provider_session_id = ?")
        .run(title, now(), provider, providerSessionId);
    },
    archiveByProviderSessionId({ provider, providerSessionId }) {
      const timestamp = now();
      conn.prepare("UPDATE sessions SET is_archived = 1, archived_at = ?, updated_at = ? WHERE provider = ? AND provider_session_id = ?")
        .run(timestamp, timestamp, provider, providerSessionId);
    },
    restoreByProviderSessionId({ provider, providerSessionId }) {
      conn.prepare("UPDATE sessions SET is_archived = 0, archived_at = NULL, updated_at = ? WHERE provider = ? AND provider_session_id = ?")
        .run(now(), provider, providerSessionId);
    },
    reorderActiveByProject({ projectId, orderedSessions = [] }) {
      const activeRows = conn.prepare(
        `SELECT id, provider, provider_session_id FROM sessions WHERE project_id = ? AND is_archived = 0 ORDER BY COALESCE(sort_order, 0) DESC, created_at DESC`
      ).all(projectId);
      if (activeRows.length === 0) return;
      const keyOf = (p, s) => `${String(p || "").toLowerCase()}::${String(s || "")}`;
      const activeMap = new Map(activeRows.map((row) => [keyOf(row.provider, row.provider_session_id), row]));
      const nextOrdered = [];
      const seen = new Set();
      for (const item of orderedSessions) {
        const key = keyOf(item?.provider, item?.providerSessionId);
        const row = activeMap.get(key);
        if (!row || seen.has(key)) continue;
        nextOrdered.push(row);
        seen.add(key);
      }
      for (const row of activeRows) {
        const key = keyOf(row.provider, row.provider_session_id);
        if (seen.has(key)) continue;
        nextOrdered.push(row);
        seen.add(key);
      }
      const update = conn.prepare("UPDATE sessions SET sort_order = ?, updated_at = ? WHERE id = ?");
      const timestamp = now();
      const tx = conn.transaction((rows) => {
        const total = rows.length;
        for (let idx = 0; idx < total; idx += 1) update.run(total - idx, timestamp, rows[idx].id);
      });
      tx(nextOrdered);
    },
    markAllStopped() {
      conn.prepare("UPDATE sessions SET status = 'exited', updated_at = ? WHERE status = 'running'").run(now());
    }
  };
}

function settingsRepo() {
  const conn = getDatabase();
  const SETTINGS_KEY = "provider_startup_settings";
  const defaultValue = {
    providers: {
      claude: { defaultProfileId: "", enabledProfileId: "", profiles: [] },
      codex: { defaultProfileId: "", enabledProfileId: "", profiles: [] },
      gemini: { defaultProfileId: "", enabledProfileId: "", profiles: [] }
    }
  };

  function ensureProviderShape(input) {
    const normalized = { ...defaultValue, ...(input || {}) };
    const providers = { ...(normalized.providers || {}) };
    for (const p of ["claude", "codex", "gemini"]) {
      const current = providers[p] || {};
      const profiles = Array.isArray(current.profiles) && current.profiles.length > 0
        ? current.profiles.map((profile, idx) => ({
          id: String(profile?.id || `provider-${idx + 1}`),
          name: String(profile?.name || `Provider ${idx + 1}`),
          envVars: Array.isArray(profile?.envVars) ? profile.envVars : []
        }))
        : [];
      const dpId = profiles.length > 0 && profiles.some((x) => x.id === current.defaultProfileId)
        ? current.defaultProfileId : (profiles.length > 0 ? profiles[0].id : "");
      let epId = current.enabledProfileId === "" ? "" : dpId;
      if (epId !== "" && profiles.some((x) => x.id === current.enabledProfileId)) epId = current.enabledProfileId;
      if (epId !== "" && !profiles.some((x) => x.id === epId)) epId = "";
      providers[p] = { defaultProfileId: dpId, enabledProfileId: epId, profiles };
    }
    return { providers };
  }

  return {
    getProviderStartupSettings() {
      const row = conn.prepare("SELECT value FROM app_settings WHERE key = ?").get(SETTINGS_KEY);
      if (!row) return defaultValue;
      try {
        const parsed = JSON.parse(row.value || "{}");
        if (parsed?.providers && typeof parsed.providers === "object") return ensureProviderShape(parsed);
        if (Array.isArray(parsed?.envVars)) {
          return ensureProviderShape({
            providers: { claude: { defaultProfileId: "default", profiles: [{ id: "default", name: "Default Provider", envVars: parsed.envVars }] } }
          });
        }
        const migrated = [];
        if (parsed?.apiUrl) migrated.push({ key: "ANTHROPIC_BASE_URL", value: parsed.apiUrl });
        if (parsed?.apiKey) migrated.push({ key: parsed?.apiKeyEnvVarName || "ANTHROPIC_API_KEY", value: parsed.apiKey });
        if (parsed?.model) migrated.push({ key: "ANTHROPIC_MODEL", value: parsed.model });
        for (const pair of parsed?.additionalEnvVars || []) { if (!pair?.key) continue; migrated.push({ key: pair.key, value: pair.value || "" }); }
        return ensureProviderShape({
          providers: { claude: { defaultProfileId: "default", profiles: [{ id: "default", name: "Default Provider", envVars: migrated }] } }
        });
      } catch { return defaultValue; }
    },
    setProviderStartupSettings(value) {
      const normalized = ensureProviderShape(value);
      const timestamp = now();
      conn.prepare(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).run(SETTINGS_KEY, JSON.stringify(normalized), timestamp);
      return normalized;
    }
  };
}

module.exports = { initDatabase, getDatabase, closeDatabase, projectsRepo, sessionsRepo, settingsRepo };
