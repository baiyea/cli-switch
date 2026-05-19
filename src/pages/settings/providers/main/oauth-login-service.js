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

    const localSessionId = `${id}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const name = `${String(id).toUpperCase()} OAuth Login`;
    ptyService.create({
      cwd: context.cwd,
      name,
      provider: id,
      sessionId: localSessionId,
    });
    const wrote = ptyService.write(localSessionId, command);
    if (!wrote) {
      logWarn('oauth-login', 'OAuth login command write skipped: PTY not found', {
        provider: id,
        sessionId: localSessionId,
        profileId,
      });
    }
    if (id === 'gemini') {
      const autoSelectDelays = [900, 2200];
      for (const delayMs of autoSelectDelays) {
        setTimeout(() => {
          const ok = ptyService.write(localSessionId, '\r');
          logInfo('oauth-login', 'Gemini OAuth auto-select prompt step', {
            sessionId: localSessionId,
            delayMs,
            wrote: ok,
          });
        }, delayMs);
      }
    }

    sessionStore.create({
      projectId: context.projectId,
      title: name,
      provider: id,
      providerSessionId: localSessionId,
      cwd: context.cwd,
      sessionFilePath: null,
      status: 'running',
    });
    sessionStore.updateStateByProviderSessionId({
      provider: id,
      providerSessionId: localSessionId,
      status: 'running',
    });

    logInfo('oauth-login', 'OAuth login session started', {
      provider: id,
      sessionId: localSessionId,
      profileId,
      projectId: context.projectId,
      cwd: context.cwd,
      command: command.trim(),
    });
    oauthLoginTracker.registerSession({
      sessionId: localSessionId,
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
        sessionId: localSessionId,
        projectId: context.projectId,
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
