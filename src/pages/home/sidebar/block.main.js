const { SIDEBAR_CHANNELS } = require('./shared/sidebar.channels');

function registerSidebarMain(context = {}) {
  const {
    registerIpc,
    z,
    fs,
    path,
    dialog,
    mainWindow,
    projectStore,
    sessionStore,
    sessionReorderSchema,
    normalizeProviderId,
    syncDiscoveredSessionsForProjects,
    archiveIgnoredProviderSessionsForProjects = () => ({ count: 0 }),
    sessionBelongsToProjectRoot,
    toSessionView,
    logInfo = () => {},
  } = context;

  if (!registerIpc) return;

  registerIpc(SIDEBAR_CHANNELS.PROJECT_LIST, async () => {
    const projects = projectStore.list();
    return projects.filter((p) => {
      try {
        return fs.existsSync(p.path);
      } catch {
        return false;
      }
    });
  });

  registerIpc(SIDEBAR_CHANNELS.PROJECT_ADD, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Project Folder',
      properties: ['openDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) return null;
    const folderPath = result.filePaths[0];
    const created = projectStore.create({
      name: path.basename(folderPath),
      path: folderPath,
    });
    const { count: syncedCount } = syncDiscoveredSessionsForProjects([created]);
    logInfo('project', 'Project created and sessions synced', {
      projectId: created.id,
      path: created.path,
      syncedCount,
    });
    return created;
  });

  registerIpc(SIDEBAR_CHANNELS.PROJECT_REMOVE, async (_event, { id }) => projectStore.remove(id));

  registerIpc(SIDEBAR_CHANNELS.SESSION_LIST, async (_event, payload = {}) => {
    const projectIds = Array.isArray(payload.projectIds) ? payload.projectIds : [];
    const providers = Array.isArray(payload.providers)
      ? payload.providers.map(normalizeProviderId)
      : [];
    const allProjects = projectStore.list();
    const selectedProjects =
      projectIds.length > 0 ? allProjects.filter((p) => projectIds.includes(p.id)) : allProjects;
    archiveIgnoredProviderSessionsForProjects(selectedProjects);
    const rows = sessionStore.listAllActive(selectedProjects.map((p) => p.id));
    return rows
      .filter(sessionBelongsToProjectRoot)
      .map(toSessionView)
      .filter(
        (session) =>
          providers.length === 0 || providers.includes(normalizeProviderId(session.provider)),
      );
  });

  registerIpc(SIDEBAR_CHANNELS.SESSION_SYNC_PROJECT, async (_event, payload) => {
    const parsed = z.object({ projectId: z.string().min(1) }).parse(payload);
    const project = projectStore.getById(parsed.projectId);
    if (!project) throw new Error('Project not found');
    const { count } = syncDiscoveredSessionsForProjects([project]);
    logInfo('session', 'Manual project session sync complete', {
      projectId: project.id,
      path: project.path,
      syncedCount: count,
    });
    return { ok: true, count };
  });

  registerIpc(SIDEBAR_CHANNELS.SESSION_REORDER, async (_event, payload) => {
    const parsed = sessionReorderSchema.parse(payload || {});
    const result = sessionStore.reorderActiveByProject({
      projectId: parsed.projectId,
      orderedSessions: parsed.orderedSessions.map((item) => ({
        provider: normalizeProviderId(item.provider),
        providerSessionId: item.providerSessionId,
      })),
    });
    logInfo('session', 'Session order persisted', {
      projectId: parsed.projectId,
      requestedCount: result?.requestedCount || 0,
      matchedCount: result?.matchedCount || 0,
      updatedCount: result?.updatedCount || 0,
    });
    return result || { ok: true };
  });
}

module.exports = { registerSidebarMain };
