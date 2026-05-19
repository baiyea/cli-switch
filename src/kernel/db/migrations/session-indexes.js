const { DB_MODELS } = require('../models');
const { ensureColumn } = require('./legacy-columns');

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

  conn.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_provider_sid_unique ON sessions(provider, provider_session_id);',
  );
}

function ensureSessionSortOrder(conn) {
  ensureColumn(conn, DB_MODELS.sessions.tableName, 'sort_order', 'INTEGER NOT NULL DEFAULT 0');
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

module.exports = {
  ensureSessionUniqueIndex,
  ensureSessionSortOrder,
};
