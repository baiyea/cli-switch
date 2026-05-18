function createSessionsRepo({ getDatabase, now, genId, sessionModel }) {
  if (typeof getDatabase !== "function") throw new TypeError("createSessionsRepo: getDatabase must be a function");
  if (typeof now !== "function") throw new TypeError("createSessionsRepo: now must be a function");
  if (typeof genId !== "function") throw new TypeError("createSessionsRepo: genId must be a function");

  const conn = getDatabase();
  const sessionsTable = String(sessionModel?.tableName || "sessions");

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
       FROM ${sessionsTable} WHERE project_id = ? AND is_archived = 0`
    ).get(projectId);
    return Number(row?.max_sort_order || 0) + 1;
  }

  function getNextBottomSortOrder(projectId) {
    const row = conn.prepare(
      `SELECT COALESCE(MIN(sort_order), 0) AS min_sort_order
       FROM ${sessionsTable} WHERE project_id = ? AND is_archived = 0`
    ).get(projectId);
    return Number(row?.min_sort_order || 0) - 1;
  }

  function listByArchiveFlag(isArchived, projectIds = []) {
    const { sql, params } = buildInClause(projectIds);
    return conn.prepare(
      `SELECT s.*, p.path AS project_path
       FROM ${sessionsTable} s LEFT JOIN projects p ON p.id = s.project_id
       WHERE s.is_archived = ?${sql}
       ORDER BY COALESCE(s.sort_order, 0) DESC, s.created_at DESC`
    ).all(isArchived ? 1 : 0, ...params);
  }

  const repo = {
    listAllActive(projectIds = []) { return listByArchiveFlag(false, projectIds); },
    listByProject(projectId) { return listByArchiveFlag(false, [projectId]); },
    listArchivedByProject(projectId) { return listByArchiveFlag(true, [projectId]); },
    listAllArchived(projectIds = []) { return listByArchiveFlag(true, projectIds); },
    listActiveWithSessionFileByProject(projectId) {
      return conn.prepare(
        `SELECT s.*, p.path AS project_path FROM ${sessionsTable} s LEFT JOIN projects p ON p.id = s.project_id
         WHERE s.project_id = ? AND s.is_archived = 0 AND s.session_file_path IS NOT NULL AND s.session_file_path <> ''
         ORDER BY s.updated_at DESC`
      ).all(projectId);
    },
    getById(sessionId) {
      return conn.prepare(`SELECT * FROM ${sessionsTable} WHERE id = ?`).get(sessionId);
    },
    getByProviderSessionId({ provider, providerSessionId }) {
      return conn.prepare(`SELECT * FROM ${sessionsTable} WHERE provider = ? AND provider_session_id = ?`).get(provider, providerSessionId);
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
        `INSERT INTO ${sessionsTable} (id, project_id, title, provider, provider_session_id, cwd, session_file_path,
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
        `INSERT INTO ${sessionsTable} (id, project_id, title, provider, provider_session_id, cwd, session_file_path,
         status, sort_order, last_active_at, created_at, updated_at, is_archived, archived_at)
         VALUES (@id, @project_id, @title, @provider, @provider_session_id, @cwd, @session_file_path,
         @status, @sort_order, @last_active_at, @created_at, @updated_at, @is_archived, @archived_at)
         ON CONFLICT(provider, provider_session_id) DO UPDATE SET
           project_id = excluded.project_id, title = excluded.title, cwd = excluded.cwd,
           session_file_path = COALESCE(excluded.session_file_path, ${sessionsTable}.session_file_path),
           updated_at = excluded.updated_at`
      ).run({
        id: genId(), project_id: projectId, title, provider, provider_session_id: providerSessionId,
        cwd, session_file_path: sessionFilePath, status: "exited", sort_order: sortOrder,
        last_active_at: createdAtIso, created_at: createdAtIso, updated_at: timestamp,
        is_archived: 0, archived_at: null
      });
    },
    reconcileDiscovered({ projectId, title, provider, providerSessionId, cwd = "", sessionFilePath = null, createdAt }) {
      const existing = conn.prepare(`SELECT * FROM ${sessionsTable} WHERE provider = ? AND provider_session_id = ?`).get(provider, providerSessionId);
      if (existing) {
        repo.upsertDiscovered({ projectId, title, provider, providerSessionId, cwd, sessionFilePath, createdAt });
        return { ok: true, fromProviderSessionId: providerSessionId, toProviderSessionId: providerSessionId, reconciled: false };
      }
      const candidate = conn.prepare(
        `SELECT * FROM ${sessionsTable} WHERE provider = ? AND project_id = ? AND cwd = ? AND is_archived = 0 AND session_file_path IS NULL ORDER BY updated_at DESC`
      ).all(provider, projectId, cwd).find((row) => isLocalGeneratedProviderSessionId(provider, row.provider_session_id));
      if (!candidate) {
        repo.upsertDiscovered({ projectId, title, provider, providerSessionId, cwd, sessionFilePath, createdAt });
        return { ok: true, fromProviderSessionId: providerSessionId, toProviderSessionId: providerSessionId, reconciled: false };
      }
      const timestamp = now();
      const createdAtIso = Number.isFinite(createdAt) ? new Date(createdAt).toISOString() : timestamp;
      const shouldReplaceTitle = new RegExp(`^${String(provider)}-\\d+`, "i").test(String(candidate.title || ""));
      conn.prepare(
        `UPDATE ${sessionsTable} SET provider_session_id = ?, title = ?, cwd = ?, session_file_path = ?, last_active_at = ?, updated_at = ? WHERE id = ?`
      ).run(providerSessionId, shouldReplaceTitle ? title : candidate.title, cwd, sessionFilePath, createdAtIso, timestamp, candidate.id);
      return { ok: true, fromProviderSessionId: candidate.provider_session_id, toProviderSessionId: providerSessionId, reconciled: true };
    },
    updateStateByProviderSessionId({ provider, providerSessionId, status }) {
      const timestamp = now();
      conn.prepare(`UPDATE ${sessionsTable} SET status = ?, last_active_at = ?, updated_at = ? WHERE provider = ? AND provider_session_id = ?`)
        .run(status, timestamp, timestamp, provider, providerSessionId);
    },
    renameByProviderSessionId({ provider, providerSessionId, title }) {
      conn.prepare(`UPDATE ${sessionsTable} SET title = ?, updated_at = ? WHERE provider = ? AND provider_session_id = ?`)
        .run(title, now(), provider, providerSessionId);
    },
    archiveByProviderSessionId({ provider, providerSessionId }) {
      const timestamp = now();
      conn.prepare(`UPDATE ${sessionsTable} SET is_archived = 1, archived_at = ?, updated_at = ? WHERE provider = ? AND provider_session_id = ?`)
        .run(timestamp, timestamp, provider, providerSessionId);
    },
    restoreByProviderSessionId({ provider, providerSessionId }) {
      conn.prepare(`UPDATE ${sessionsTable} SET is_archived = 0, archived_at = NULL, updated_at = ? WHERE provider = ? AND provider_session_id = ?`)
        .run(now(), provider, providerSessionId);
    },
    reorderActiveByProject({ projectId, orderedSessions = [] }) {
      const activeRows = conn.prepare(
        `SELECT id, provider, provider_session_id FROM ${sessionsTable} WHERE project_id = ? AND is_archived = 0 ORDER BY COALESCE(sort_order, 0) DESC, created_at DESC`
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
      const update = conn.prepare(`UPDATE ${sessionsTable} SET sort_order = ?, updated_at = ? WHERE id = ?`);
      const timestamp = now();
      const tx = conn.transaction((rows) => {
        const total = rows.length;
        for (let idx = 0; idx < total; idx += 1) update.run(total - idx, timestamp, rows[idx].id);
      });
      tx(nextOrdered);
    },
    markAllStopped() {
      conn.prepare(`UPDATE ${sessionsTable} SET status = 'exited', updated_at = ? WHERE status = 'running'`).run(now());
    }
  };

  return repo;
}

module.exports = { createSessionsRepo };
