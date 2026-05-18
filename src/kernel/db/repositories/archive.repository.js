function createArchiveRepo({ getDatabase, now }) {
  if (typeof getDatabase !== "function") throw new TypeError("createArchiveRepo: getDatabase must be a function");
  if (typeof now !== "function") throw new TypeError("createArchiveRepo: now must be a function");

  const conn = getDatabase();

  function buildInClause(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return { sql: "", params: [] };
    const placeholders = ids.map(() => "?").join(", ");
    return { sql: ` AND s.project_id IN (${placeholders})`, params: ids };
  }

  return {
    listAll(projectIds = []) {
      const { sql, params } = buildInClause(projectIds);
      return conn.prepare(
        `SELECT s.*, p.path AS project_path
         FROM sessions s LEFT JOIN projects p ON p.id = s.project_id
         WHERE s.is_archived = 1${sql}
         ORDER BY COALESCE(s.sort_order, 0) DESC, s.created_at DESC`
      ).all(...params);
    },
    archiveByProviderSessionId({ provider, providerSessionId }) {
      const timestamp = now();
      conn.prepare("UPDATE sessions SET is_archived = 1, archived_at = ?, updated_at = ? WHERE provider = ? AND provider_session_id = ?")
        .run(timestamp, timestamp, provider, providerSessionId);
    },
    restoreByProviderSessionId({ provider, providerSessionId }) {
      conn.prepare("UPDATE sessions SET is_archived = 0, archived_at = NULL, updated_at = ? WHERE provider = ? AND provider_session_id = ?")
        .run(now(), provider, providerSessionId);
    }
  };
}

module.exports = { createArchiveRepo };
