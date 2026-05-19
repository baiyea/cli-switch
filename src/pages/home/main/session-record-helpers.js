function createSessionRecordHelpers({ normalizeProviderId }) {
  function toSessionView(row) {
    return {
      sessionId: row.provider_session_id || row.providerSessionId || row.sessionId || row.id,
      name: row.title || row.name || 'New Chat',
      cwd: row.cwd || row.project_path || '',
      projectId: row.project_id || row.projectId || '',
      provider: normalizeProviderId(row.provider || 'claude'),
      providerSessionId: row.provider_session_id || row.providerSessionId || '',
      status: row.status || 'exited',
      sortOrder: Number(row.sort_order ?? row.sortOrder ?? 0),
      createdAt: row.created_at ? new Date(row.created_at).getTime() : row.createdAt || Date.now(),
      updatedAt: row.updated_at
        ? new Date(row.updated_at).getTime()
        : row.updatedAt || row.createdAt || Date.now(),
    };
  }

  function toArchivedView(row) {
    const provider = normalizeProviderId(row.provider || 'claude');
    const sessionId = row.provider_session_id || row.providerSessionId || row.sessionId || row.id;
    return {
      archiveId: `${provider}:${sessionId}`,
      sessionId,
      provider,
      projectId: row.project_id || row.projectId || null,
      name: row.title || row.name || `session-${String(sessionId).slice(0, 8)}`,
      cwd: row.cwd || row.project_path || '',
      archivedAt: row.archived_at ? new Date(row.archived_at).getTime() : Date.now(),
    };
  }

  function dedupeSessionViews(items) {
    const byKey = new Map();
    for (const item of items || []) {
      const sid = item.provider_session_id || item.providerSessionId || item.sessionId;
      const key = `${normalizeProviderId(item.provider)}:${sid}`;
      const prev = byKey.get(key);
      if (!prev || (item.createdAt || 0) >= (prev.createdAt || 0)) {
        byKey.set(key, item);
      }
    }
    return Array.from(byKey.values());
  }

  function sessionBelongsToProjectRoot(row, pathResolver = null) {
    const cwd = row?.cwd || row?.project_path || '';
    const projectPath = row?.project_path || '';
    if (!cwd || !projectPath) return true;
    const resolvePath = typeof pathResolver === 'function' ? pathResolver : (value) => value;
    return resolvePath(cwd) === resolvePath(projectPath);
  }

  function normalizeArchivePayload(payload) {
    if (typeof payload === 'string') {
      return { sessionId: payload };
    }
    if (!payload || typeof payload !== 'object') {
      return { sessionId: '' };
    }
    if (typeof payload.sessionId === 'string') {
      return payload;
    }
    if (payload.sessionId && typeof payload.sessionId === 'object') {
      return { ...payload, ...payload.sessionId };
    }
    return payload;
  }

  function parseArchiveId(identifier, fallbackProvider = 'claude') {
    const raw = String(identifier || '');
    if (raw.includes(':')) {
      const [provider, ...rest] = raw.split(':');
      return {
        provider: normalizeProviderId(provider),
        providerSessionId: rest.join(':'),
      };
    }
    return {
      provider: normalizeProviderId(fallbackProvider),
      providerSessionId: raw,
    };
  }

  return {
    toSessionView,
    toArchivedView,
    dedupeSessionViews,
    sessionBelongsToProjectRoot,
    normalizeArchivePayload,
    parseArchiveId,
  };
}

module.exports = {
  createSessionRecordHelpers,
};
