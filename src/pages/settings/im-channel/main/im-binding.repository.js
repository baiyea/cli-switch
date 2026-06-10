'use strict';

const { DB_MODELS, buildCreateTableSql, buildCreateIndexSql } = require('../../../../kernel/db/schema');

function ensureImBindingTable(db) {
  const model = DB_MODELS.imSessionBindings;
  db.exec([buildCreateTableSql(model), ...buildCreateIndexSql(model)].join('\n'));
}

function createBindingId(platform, imUserId) {
  return `${platform}:${imUserId}`;
}

function mapBinding(row) {
  if (!row) return null;
  return {
    platform: row.platform,
    imUserId: row.im_user_id,
    sessionId: row.session_id,
    sessionDbId: row.session_db_id,
    updatedAt: row.updated_at,
  };
}

function createImBindingRepository({ db, now }) {
  if (!db) throw new TypeError('createImBindingRepository: db is required');
  if (typeof now !== 'function') throw new TypeError('createImBindingRepository: now is required');
  ensureImBindingTable(db);
  return {
    getBinding({ platform, imUserId }) {
      const row = db
        .prepare(
          `SELECT * FROM im_session_bindings WHERE platform = ? AND im_user_id = ?`,
        )
        .get(platform, imUserId);
      return mapBinding(row);
    },
    setBinding({ platform, imUserId, sessionId, sessionDbId }) {
      const timestamp = now();
      db.prepare(
        `INSERT INTO im_session_bindings (
          id, platform, im_user_id, session_id, session_db_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(platform, im_user_id) DO UPDATE SET
          session_id = excluded.session_id,
          session_db_id = excluded.session_db_id,
          updated_at = excluded.updated_at`,
      ).run(
        createBindingId(platform, imUserId),
        platform,
        imUserId,
        sessionId,
        sessionDbId,
        timestamp,
        timestamp,
      );
    },
  };
}

module.exports = {
  createImBindingRepository,
  ensureImBindingTable,
};
