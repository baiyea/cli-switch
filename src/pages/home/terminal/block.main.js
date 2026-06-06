const { ipcMain } = require('electron');
const { registerPtyHandlers } = require('./main/terminal.ipc');
const { TERMINAL_CHANNELS } = require('./shared/terminal.channels');

function registerTerminalMain(context = {}) {
  const ptyService = context.ptyService || context;
  const {
    registerIpc,
    z,
    fs,
    projectStore,
    sessionStore,
    sessionStatsSchema,
    readSessionStats,
    sessionCreateSchema,
    getStartupCommandForProvider,
    getStartupEnvForProvider,
    maskEnvForLog,
    waitForShellBootstrap,
    sessionStartSchema,
    runWithSessionStartLock,
    isLocalGeneratedSessionId,
    syncDiscoveredSessionsForProjects,
    getResumeCommandForProvider,
    sessionSuggestTitleSchema,
    normalizeSuggestedTitle,
    suggestSessionTitleWithModel,
    normalizeProviderId,
    toSessionView,
    tokenUsageRuntime,
    logInfo = () => {},
    logWarn = () => {},
  } = context;

  registerPtyHandlers(ipcMain, ptyService);

  if (!registerIpc) return;

  function isAutoSessionTitle(row) {
    return String(row?.title_source || 'auto').toLowerCase() === 'auto';
  }

  function shouldSyncDiscoveredSessionBeforeStats(provider, providerSessionId, row) {
    if (!row) return false;
    if (isAutoSessionTitle(row)) return true;
    if (typeof isLocalGeneratedSessionId !== 'function') return false;
    if (!isLocalGeneratedSessionId(provider, providerSessionId)) return false;
    const sessionFilePath = String(row.session_file_path || '').trim();
    if (!sessionFilePath) return true;
    return typeof fs?.existsSync === 'function' ? !fs.existsSync(sessionFilePath) : false;
  }

  function reconcileSessionBeforeStats(provider, providerSessionId, row) {
    if (!shouldSyncDiscoveredSessionBeforeStats(provider, providerSessionId, row)) {
      return { providerSessionId, row };
    }
    if (typeof syncDiscoveredSessionsForProjects !== 'function') return { providerSessionId, row };
    const project = row?.project_id ? projectStore.getById(row.project_id) : null;
    if (!project) return { providerSessionId, row };

    const { mappings = [] } = syncDiscoveredSessionsForProjects([project]) || {};
    const reconciled = mappings.find(
      (item) => item.provider === provider && item.fromProviderSessionId === providerSessionId,
    );
    const nextProviderSessionId = reconciled?.toProviderSessionId || providerSessionId;
    const nextRow =
      sessionStore.getByProviderSessionId({ provider, providerSessionId: nextProviderSessionId }) ||
      row;
    if (nextProviderSessionId !== providerSessionId) {
      logInfo('session', 'Reconciled local session id before reading session stats', {
        provider,
        fromProviderSessionId: providerSessionId,
        toProviderSessionId: nextProviderSessionId,
      });
    }
    return { providerSessionId: nextProviderSessionId, row: nextRow };
  }

  function safeStartTokenUsageRun({ row, startedAt, source }) {
    if (!tokenUsageRuntime || !row) return;
    try {
      const result = tokenUsageRuntime.startRunForSession({ row, startedAt });
      if (result && typeof result.then === 'function') {
        result.catch((error) => {
          logWarn('token-usage', 'Failed to start token usage run', {
            source,
            provider: row.provider || '',
            providerSessionId: row.provider_session_id || row.providerSessionId || row.id || '',
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
    } catch (error) {
      logWarn('token-usage', 'Failed to start token usage run', {
        source,
        provider: row.provider || '',
        providerSessionId: row.provider_session_id || row.providerSessionId || row.id || '',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  registerIpc(TERMINAL_CHANNELS.SESSION_STATS, async (_event, payload) => {
    const parsed = sessionStatsSchema.parse(payload || {});
    const provider = normalizeProviderId(parsed.provider || 'claude');
    const providerSessionId = String(parsed.providerSessionId || parsed.sessionId || '').trim();
    if (!providerSessionId) return { ok: false, reason: 'missing session identifier' };

    const row = sessionStore.getByProviderSessionId({ provider, providerSessionId });
    try {
      const reconciled = reconcileSessionBeforeStats(provider, providerSessionId, row);
      const stats = readSessionStats({
        provider,
        providerSessionId: reconciled.providerSessionId,
        row: reconciled.row,
      });
      return { ok: true, stats };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  });

  registerIpc(TERMINAL_CHANNELS.SESSION_CREATE, async (_event, payload) => {
    const parsed = sessionCreateSchema.parse(payload);
    const provider = normalizeProviderId(parsed.provider);
    const localSessionId = `${provider}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const name = parsed.title || 'New Chat';
    const launchCommand = getStartupCommandForProvider(provider);
    const startupEnv = getStartupEnvForProvider(provider);
    const project = projectStore.getById(parsed.projectId);
    const cwd = project?.path || parsed.cwd || '';
    if (!cwd) throw new Error('Project path not found');
    logInfo('session', 'Creating session', {
      sessionId: localSessionId,
      projectId: parsed.projectId,
      provider,
      cwd,
      startupEnv: maskEnvForLog(startupEnv),
    });

    ptyService.create({ cwd, name, provider, sessionId: localSessionId });
    await waitForShellBootstrap(localSessionId);
    if (launchCommand) {
      logInfo('session', 'Writing launch command', {
        sessionId: localSessionId,
        provider,
        command: launchCommand.trim(),
      });
      const wrote = ptyService.write(localSessionId, launchCommand);
      if (!wrote)
        logWarn('session', 'Launch command write skipped: PTY not found', {
          sessionId: localSessionId,
          provider,
        });
    } else {
      const message = `No launch command available for provider=${provider}. CLI runtime may be missing for platform ${process.platform}-${process.arch}.`;
      logWarn('session', message, { sessionId: localSessionId, provider });
      const wroteError = ptyService.write(localSessionId, `${message}\n`);
      if (!wroteError)
        logWarn('session', 'Launch error write skipped: PTY not found', {
          sessionId: localSessionId,
          provider,
        });
    }

    sessionStore.create({
      projectId: parsed.projectId,
      title: name,
      provider,
      providerSessionId: localSessionId,
      cwd,
      sessionFilePath: null,
      status: 'running',
    });
    const createdRecord = sessionStore.getByProviderSessionId({
      provider,
      providerSessionId: localSessionId,
    });
    safeStartTokenUsageRun({
      row: createdRecord,
      startedAt: new Date().toISOString(),
      source: 'session-create',
    });
    sessionStore.updateStateByProviderSessionId({
      provider,
      providerSessionId: localSessionId,
      status: 'running',
    });

    return toSessionView({
      ...(createdRecord || {}),
      project_path: cwd,
      project_id: parsed.projectId,
      provider,
      provider_session_id: localSessionId,
      title: name,
      status: 'running',
    });
  });

  registerIpc(TERMINAL_CHANNELS.SESSION_START, async (_event, payload) => {
    const parsed = sessionStartSchema.parse(payload);
    const lockKey = parsed.providerSessionId || parsed.sessionId;
    return runWithSessionStartLock(lockKey, async () => {
      const provider = normalizeProviderId(parsed.provider);
      let providerSessionId = parsed.providerSessionId || parsed.sessionId;
      let record = sessionStore.getByProviderSessionId({ provider, providerSessionId });
      const project = record?.project_id ? projectStore.getById(record.project_id) : null;
      const sessionCwd = record?.cwd || parsed.cwd || project?.path || '';
      if (!sessionCwd) throw new Error('Session project path not found');
      if (project && isLocalGeneratedSessionId(provider, providerSessionId)) {
        const { mappings } = syncDiscoveredSessionsForProjects([project]);
        const reconciled = mappings.find(
          (item) => item.provider === provider && item.fromProviderSessionId === providerSessionId,
        );
        if (reconciled?.toProviderSessionId) {
          providerSessionId = reconciled.toProviderSessionId;
          record = sessionStore.getByProviderSessionId({ provider, providerSessionId });
          logInfo('session', 'Reconciled local session id to provider session id', {
            provider,
            fromProviderSessionId: reconciled.fromProviderSessionId,
            toProviderSessionId: reconciled.toProviderSessionId,
          });
        }
      }
      logInfo('session', 'Starting session', {
        sessionId: parsed.sessionId,
        provider,
        providerSessionId,
        cwd: sessionCwd,
      });
      const startupEnv = getStartupEnvForProvider(provider);
      logInfo('session', 'Resolved startup env', {
        sessionId: parsed.sessionId,
        provider,
        providerSessionId,
        startupEnv: maskEnvForLog(startupEnv),
      });
      const runtimeSessionId = providerSessionId || parsed.sessionId;

      if (!ptyService.hasSession(runtimeSessionId)) {
        ptyService.create({
          cwd: sessionCwd,
          name: parsed.name || `session-${parsed.sessionId.slice(0, 8)}`,
          provider,
          sessionId: runtimeSessionId,
          initialCols: parsed.initialCols,
          initialRows: parsed.initialRows,
        });
        await waitForShellBootstrap(runtimeSessionId);
        safeStartTokenUsageRun({
          row:
            record ||
            {
              id: parsed.sessionId,
              project_id: project?.id || '',
              provider,
              provider_session_id: providerSessionId,
              session_file_path: '',
            },
          startedAt: new Date().toISOString(),
          source: 'session-start',
        });
        const resumeCommand = getResumeCommandForProvider(provider, providerSessionId);
        const startupCommand = resumeCommand || getStartupCommandForProvider(provider);
        if (startupCommand) {
          logInfo('session', 'Writing resume command', {
            sessionId: runtimeSessionId,
            provider,
            providerSessionId,
            mode: resumeCommand ? 'resume' : 'launch',
            command: startupCommand.trim(),
          });
          const wroteResume = ptyService.write(runtimeSessionId, startupCommand);
          if (!wroteResume)
            logWarn('session', 'Resume command write skipped: PTY not found', {
              sessionId: runtimeSessionId,
              provider,
            });
        } else {
          const message = `No startup command available for provider=${provider}. CLI runtime may be missing for platform ${process.platform}-${process.arch}.`;
          logWarn('session', message, { sessionId: runtimeSessionId, provider, providerSessionId });
          const wroteError = ptyService.write(runtimeSessionId, `${message}\n`);
          if (!wroteError)
            logWarn('session', 'Startup error write skipped: PTY not found', {
              sessionId: runtimeSessionId,
              provider,
            });
        }
      } else {
        logInfo('session', 'Skip session bootstrapping because PTY already exists', {
          sessionId: runtimeSessionId,
          provider,
          providerSessionId,
        });
      }
      sessionStore.updateStateByProviderSessionId({
        provider,
        providerSessionId,
        status: 'running',
      });

      return toSessionView({
        ...(record || {}),
        provider,
        provider_session_id: providerSessionId,
        title: parsed.name || record?.title || `session-${parsed.sessionId.slice(0, 8)}`,
        project_path: sessionCwd,
        status: 'running',
      });
    });
  });

  registerIpc(TERMINAL_CHANNELS.SESSION_RENAME, async (_event, payload) => {
    const parsed = z
      .object({
        sessionId: z.string().min(1),
        title: z.string().min(1),
        provider: z.string().optional().default('claude'),
        providerSessionId: z.string().optional(),
      })
      .parse(payload || {});

    const provider = normalizeProviderId(parsed.provider);
    const providerSessionId = parsed.providerSessionId || parsed.sessionId;
    const nextTitle = parsed.title.trim();
    if (!nextTitle) throw new Error('Session title is required');

    sessionStore.renameByProviderSessionId({ provider, providerSessionId, title: nextTitle });
    return { ok: true };
  });

  registerIpc(TERMINAL_CHANNELS.SESSION_SUGGEST_TITLE, async (_event, payload) => {
    const parsed = sessionSuggestTitleSchema.parse(payload || {});
    const provider = normalizeProviderId(parsed.provider);
    const providerSessionId = parsed.providerSessionId || parsed.sessionId;

    let record = sessionStore.getByProviderSessionId({ provider, providerSessionId });
    if (!record) {
      const rows = sessionStore.listAllActive();
      record = rows.find(
        (item) => String(item?.provider_session_id || '') === String(parsed.sessionId || ''),
      );
    }
    if (!record) throw new Error('Session not found');

    const sessionFilePath = String(record.session_file_path || '').trim();
    if (!sessionFilePath || !fs.existsSync(sessionFilePath)) {
      return {
        ok: true,
        title: normalizeSuggestedTitle(record.title || '会话', '会话'),
        source: 'fallback',
        reason: 'session_file_path missing',
      };
    }
    return suggestSessionTitleWithModel({
      provider: record.provider || provider,
      sessionFilePath,
      fallbackTitle: record.title || '会话',
    });
  });
}

module.exports = { registerTerminalMain };
