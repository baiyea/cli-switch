const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function openStateDb(projectPath) {
  const skillgenDir = path.join(projectPath, ".claude", ".skillgen");
  ensureDir(skillgenDir);
  ensureDir(path.join(skillgenDir, "run_logs"));
  ensureDir(path.join(skillgenDir, "candidates"));

  const dbPath = path.join(skillgenDir, "state.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS processed_messages (
      content_hash TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      turn_id INTEGER NOT NULL,
      processed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS run_state (
      project_id TEXT PRIMARY KEY,
      last_run_at TEXT NOT NULL,
      last_trigger TEXT NOT NULL
    );
  `);

  return {
    db,
    isProcessed(contentHash) {
      const row = db.prepare("SELECT 1 AS ok FROM processed_messages WHERE content_hash = ?").get(contentHash);
      return !!row;
    },
    markProcessed(messages) {
      if (!Array.isArray(messages) || messages.length === 0) return;
      const stmt = db.prepare(
        "INSERT OR IGNORE INTO processed_messages (content_hash, session_id, turn_id, processed_at) VALUES (?, ?, ?, ?)"
      );
      const insertMany = db.transaction((list) => {
        const ts = nowIso();
        for (const msg of list) {
          stmt.run(msg.content_hash, msg.session_id, msg.turn_id, ts);
        }
      });
      insertMany(messages);
    },
    getLastRun(projectId) {
      return db.prepare("SELECT * FROM run_state WHERE project_id = ?").get(projectId) || null;
    },
    setLastRun(projectId, trigger) {
      db.prepare(
        `INSERT INTO run_state (project_id, last_run_at, last_trigger)
         VALUES (?, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET
           last_run_at = excluded.last_run_at,
           last_trigger = excluded.last_trigger`
      ).run(projectId, nowIso(), trigger || "unknown");
    },
    close() {
      db.close();
    }
  };
}

module.exports = {
  openStateDb,
  ensureDir
};
