const Database = require("better-sqlite3");
const path = require("node:path");
const { getAppHomeDir, ensureDir } = require("../test-mode");
const { DB_FILENAME } = require("../config");

let db = null;

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

module.exports = { initDatabase, getDatabase, closeDatabase };
