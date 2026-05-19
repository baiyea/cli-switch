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
  ];

  for (const item of legacyColumns) {
    ensureColumn(conn, item.table, item.column, item.def);
  }
}

module.exports = {
  ensureColumn,
  ensureLegacyColumns,
};
