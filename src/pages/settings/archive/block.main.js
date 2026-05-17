function registerArchiveMain(context = {}) {
  const {
    registerIpc,
    IPC,
    z,
    ptyService,
    sessionStore,
    normalizeProviderId,
    normalizeArchivePayload,
    parseArchiveId,
    toArchivedView,
    logInfo = () => {}
  } = context;

  if (!registerIpc || !IPC) return;

  registerIpc(IPC.SESSION_ARCHIVE, async (_event, payload) => {
    const parsed = z.object({
      sessionId: z.string().min(1),
      provider: z.string().optional().default("claude"),
      providerSessionId: z.string().optional()
    }).parse(normalizeArchivePayload(payload));
    const provider = normalizeProviderId(parsed.provider);
    const providerSessionId = parsed.providerSessionId || parsed.sessionId;
    ptyService.destroy(providerSessionId);
    logInfo("session", "Archiving session", { sessionId: providerSessionId, provider });
    sessionStore.archiveByProviderSessionId({ provider, providerSessionId });
    return { ok: true };
  });

  registerIpc(IPC.SESSION_ARCHIVE_LIST, async (_event, payload = {}) => {
    const projectIds = Array.isArray(payload.projectIds) ? payload.projectIds : [];
    return sessionStore.listAllArchived(projectIds).map(toArchivedView);
  });

  registerIpc(IPC.SESSION_RESTORE, async (_event, payload) => {
    const parsed = z.object({
      archiveId: z.string().optional(),
      sessionId: z.string().optional(),
      provider: z.string().optional().default("claude")
    }).parse(payload || {});
    const source = parsed.archiveId || parsed.sessionId || "";
    const archive = parseArchiveId(source, parsed.provider);
    if (!archive.providerSessionId) throw new Error("Invalid archive identifier");
    sessionStore.restoreByProviderSessionId({
      provider: archive.provider,
      providerSessionId: archive.providerSessionId
    });
    return { ok: true };
  });
}

module.exports = { registerArchiveMain };
