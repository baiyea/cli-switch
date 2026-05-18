const Database = require("better-sqlite3");
const crypto = require("node:crypto");
const path = require("node:path");
const { getAppHomeDir, ensureDir } = require("../test-mode");
const { DB_FILENAME } = require("../config");
const { DB_MODELS, buildSchemaSql } = require("./models");
const { ensureLegacyColumns } = require("./migrations/legacy-columns");
const { ensureSessionUniqueIndex, ensureSessionSortOrder } = require("./migrations/session-indexes");
const { createProjectsRepo } = require("./repositories/project.repository");
const { createSessionsRepo } = require("./repositories/session.repository");
const { createSettingsRepo } = require("./repositories/settings.repository");
const { createArchiveRepo } = require("./repositories/archive.repository");

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

function initDatabase(dbPathInput) {
  if (db) return db;
  const dbPath = dbPathInput || getDbPath();
  ensureDir(path.dirname(dbPath));

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
  if (!db) return;
  db.close();
  db = null;
}

function resolveConn(conn) {
  return conn || getDatabase();
}

function projectsRepo(conn) {
  return createProjectsRepo({
    getDatabase: () => resolveConn(conn),
    now,
    genId
  });
}

function sessionsRepo(conn) {
  return createSessionsRepo({
    getDatabase: () => resolveConn(conn),
    now,
    genId,
    sessionModel: DB_MODELS.sessions
  });
}

function settingsRepo(conn) {
  return createSettingsRepo({
    getDatabase: () => resolveConn(conn),
    now
  });
}

function archiveRepo(conn) {
  return createArchiveRepo({
    getDatabase: () => resolveConn(conn),
    now
  });
}

module.exports = {
  initDatabase,
  getDatabase,
  closeDatabase,
  projectsRepo,
  sessionsRepo,
  settingsRepo,
  archiveRepo
};
