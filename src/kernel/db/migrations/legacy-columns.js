const { DB_MODELS } = require('../models');

function ensureColumn(conn, tableName, columnName, columnDef) {
  const cols = conn.prepare(`PRAGMA table_info(${tableName})`).all();
  if (cols.some((c) => c.name === columnName)) return;
  conn.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
}

function ensureLegacyColumns(conn) {
  const legacyColumns = [
    {
      table: DB_MODELS.sessions.tableName,
      column: 'is_archived',
      def: 'INTEGER NOT NULL DEFAULT 0',
    },
    { table: DB_MODELS.sessions.tableName, column: 'archived_at', def: 'TEXT' },
    { table: DB_MODELS.sessions.tableName, column: 'provider_session_id', def: 'TEXT' },
    { table: DB_MODELS.sessions.tableName, column: 'cwd', def: "TEXT NOT NULL DEFAULT ''" },
    { table: DB_MODELS.sessions.tableName, column: 'session_file_path', def: 'TEXT' },
    {
      table: DB_MODELS.sessions.tableName,
      column: 'sort_order',
      def: 'INTEGER NOT NULL DEFAULT 0',
    },
    {
      table: DB_MODELS.sessions.tableName,
      column: 'title_source',
      def: "TEXT NOT NULL DEFAULT 'auto'",
    },
  ];

  for (const item of legacyColumns) {
    ensureColumn(conn, item.table, item.column, item.def);
  }

  conn.exec(`
    UPDATE ${DB_MODELS.sessions.tableName}
    SET title_source = 'manual'
    WHERE title_source = 'auto'
      AND title NOT GLOB 'session-????????'
      AND title NOT GLOB 'session-????????-????'
      AND title NOT GLOB 'claude-[0-9]*'
      AND title NOT GLOB 'codex-[0-9]*'
      AND title NOT GLOB 'gemini-[0-9]*'
      AND title NOT GLOB 'shell-[0-9]*';
  `);

  conn.exec(`
    UPDATE ${DB_MODELS.sessions.tableName}
    SET title = 'session-' || substr(provider_session_id, 1, 13)
    WHERE title_source = 'auto'
      AND title = 'session-' || substr(provider_session_id, 1, 8)
      AND length(provider_session_id) >= 13;
  `);
}

module.exports = {
  ensureColumn,
  ensureLegacyColumns,
};
