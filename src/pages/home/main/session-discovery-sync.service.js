function createSessionDiscoverySyncService({
  mapSessionsToProjects,
  listProviderSessions,
  dedupeSessionViews,
  sessionStore,
  normalizeProviderId,
}) {
  function syncDiscoveredSessionsForProjects(projects) {
    if (!Array.isArray(projects) || projects.length === 0) return { count: 0, mappings: [] };
    const discovered = mapSessionsToProjects(listProviderSessions(), projects);
    const deduped = dedupeSessionViews(discovered);
    const mappings = [];
    for (const session of deduped) {
      const result = sessionStore.reconcileDiscovered({
        projectId: session.projectId,
        title: session.name,
        provider: normalizeProviderId(session.provider),
        providerSessionId: session.providerSessionId || session.sessionId,
        cwd: session.cwd || '',
        sessionFilePath: session.sessionFilePath || null,
        createdAt: session.createdAt,
      });
      if (result?.reconciled && result.fromProviderSessionId && result.toProviderSessionId) {
        mappings.push({
          provider: normalizeProviderId(session.provider),
          fromProviderSessionId: result.fromProviderSessionId,
          toProviderSessionId: result.toProviderSessionId,
          cwd: session.cwd || '',
          projectId: session.projectId,
        });
      }
    }
    return { count: deduped.length, mappings };
  }

  return {
    syncDiscoveredSessionsForProjects,
  };
}

module.exports = {
  createSessionDiscoverySyncService,
};
