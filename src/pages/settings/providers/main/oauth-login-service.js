function createOAuthLoginService({
  normalizeProviderId,
  getOAuthLoginCommandForProvider,
  projectStore,
  sessionStore,
  ptyService,
  oauthLoginTracker,
  logInfo,
  logWarn,
}) {
  function resolveProviderTestSessionId(provider) {
    const id = normalizeProviderId(provider);
    return `${id}-tests`;
  }

  function resolveProviderTestSessionTitle(provider) {
    return resolveProviderTestSessionId(provider);
  }

  function resolveOAuthLoginContext({ projectId, cwd }) {
    const project = projectId ? projectStore.getById(projectId) : null;
    if (project?.path) {
      return { projectId: project.id, cwd: project.path };
    }
    if (cwd) {
      const all = projectStore.list();
      const matched = all.find((item) => item.path === cwd);
      if (matched) return { projectId: matched.id, cwd: matched.path };
    }
    const first = projectStore.list()[0];
    if (first?.id && first?.path) {
      return { projectId: first.id, cwd: first.path };
    }
    return null;
  }

  async function startProviderOAuthLogin({ provider, profileId, projectId, cwd }) {
    const id = normalizeProviderId(provider);
    const context = resolveOAuthLoginContext({ projectId, cwd });
    if (!context) {
      return { ok: false, message: '请先添加并选择一个项目，再启动 OAuth 登录。' };
    }

    const command = getOAuthLoginCommandForProvider(id);
    if (!command) {
      return {
        ok: false,
        message: `OAuth 登录命令不可用：provider=${id}，请检查 CLI runtime 是否已准备。`,
      };
    }

    const providerSessionId = resolveProviderTestSessionId(id);
    const name = resolveProviderTestSessionTitle(id);
    const existing = sessionStore.getByProviderSessionId({
      provider: id,
      providerSessionId,
    });

    oauthLoginTracker.unregisterSession(providerSessionId);
    ptyService.destroy(providerSessionId, { quiet: true });
    ptyService.create({
      cwd: context.cwd,
      name,
      provider: id,
      sessionId: providerSessionId,
    });
    const wrote = ptyService.write(providerSessionId, command);
    if (!wrote) {
      logWarn('oauth-login', 'OAuth login command write skipped: PTY not found', {
        provider: id,
        sessionId: providerSessionId,
        profileId,
      });
    }
    if (id === 'gemini') {
      const autoSelectDelays = [900, 2200];
      for (const delayMs of autoSelectDelays) {
        setTimeout(() => {
          const ok = ptyService.write(providerSessionId, '\r');
          logInfo('oauth-login', 'Gemini OAuth auto-select prompt step', {
            sessionId: providerSessionId,
            delayMs,
            wrote: ok,
          });
        }, delayMs);
      }
    }

    if (!existing) {
      sessionStore.create({
        projectId: context.projectId,
        title: name,
        provider: id,
        providerSessionId,
        cwd: context.cwd,
        sessionFilePath: null,
        status: 'running',
      });
    } else {
      sessionStore.restoreByProviderSessionId({
        provider: id,
        providerSessionId,
      });
      sessionStore.renameByProviderSessionId({
        provider: id,
        providerSessionId,
        title: name,
      });
    }
    sessionStore.updateStateByProviderSessionId({
      provider: id,
      providerSessionId,
      status: 'running',
    });

    logInfo('oauth-login', 'OAuth login session started', {
      provider: id,
      sessionId: providerSessionId,
      profileId,
      projectId: existing?.project_id || context.projectId,
      cwd: context.cwd,
      command: command.trim(),
      recreatedPty: true,
      reusedSessionRecord: Boolean(existing),
    });
    oauthLoginTracker.registerSession({
      sessionId: providerSessionId,
      provider: id,
      profileId: String(profileId || ''),
    });

    return {
      ok: true,
      message:
        id === 'gemini'
          ? '已经获得Gemini授权，如过要重新登陆，请进入Gemini 内执行：/auth signout'
          : `${id} OAuth 登录会话已启动，请在终端中完成登录流程。`,
      session: {
        sessionId: providerSessionId,
        projectId: existing?.project_id || context.projectId,
      },
    };
  }

  return {
    startProviderOAuthLogin,
  };
}

module.exports = {
  createOAuthLoginService,
};
