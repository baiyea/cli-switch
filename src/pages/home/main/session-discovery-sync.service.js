function createSessionDiscoverySyncService({
  mapSessionsToProjects,
  listProviderSessions,
  dedupeSessionViews,
  sessionStore,
  normalizeProviderId,
  onReconciledSession = () => {},
  logWarn = () => {},
}) {
  function notifyReconciledSession(mapping) {
    try {
      const result = onReconciledSession(mapping);
      if (result && typeof result.then === 'function') {
        result.catch((error) => {
          logWarn('session', 'Reconciled session callback failed', {
            provider: mapping.provider,
            fromProviderSessionId: mapping.fromProviderSessionId,
            toProviderSessionId: mapping.toProviderSessionId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
    } catch (error) {
      logWarn('session', 'Reconciled session callback failed', {
        provider: mapping.provider,
        fromProviderSessionId: mapping.fromProviderSessionId,
        toProviderSessionId: mapping.toProviderSessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

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
        titleSource: session.titleSource || 'auto',
      });
      if (result?.reconciled && result.fromProviderSessionId && result.toProviderSessionId) {
        const mapping = {
          provider: normalizeProviderId(session.provider),
          fromProviderSessionId: result.fromProviderSessionId,
          toProviderSessionId: result.toProviderSessionId,
          cwd: session.cwd || '',
          projectId: session.projectId,
        };
        mappings.push(mapping);
        notifyReconciledSession(mapping);
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
