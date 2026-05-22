const { TOP_TOOLBAR_CHANNELS } = require('./shared/top-toolbar.channels');
const { registerTopToolbarIpc } = require('./main/top-toolbar.ipc');

function registerTopToolbarMain(context = {}) {
  const {
    registerIpc,
    skillgenRunSchema,
    skillgenRunner,
    sessionsDumpRunSchema,
    sessionsDumpRunner,
    logWarn = () => {},
  } = context;

  if (!registerIpc) return;

  const skillgenHandler = async (_event, payload = {}) => {
    const parsed = skillgenRunSchema.parse(payload || {});
    return skillgenRunner.runForProject(parsed);
  };

  registerIpc(TOP_TOOLBAR_CHANNELS.SKILLGEN_RUN, skillgenHandler);
  if (TOP_TOOLBAR_CHANNELS.SKILLGEN_RUN !== 'skillgen:run') {
    try {
      registerIpc('skillgen:run', skillgenHandler);
    } catch (error) {
      logWarn('ipc', 'Skip duplicate fallback IPC registration', {
        channel: 'skillgen:run',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const sessionsDumpHandler = async (_event, payload = {}) => {
    const parsed = sessionsDumpRunSchema.parse(payload || {});
    return sessionsDumpRunner.runForProject(parsed);
  };

  registerIpc(TOP_TOOLBAR_CHANNELS.SESSIONS_DUMP_RUN, sessionsDumpHandler);
  if (TOP_TOOLBAR_CHANNELS.SESSIONS_DUMP_RUN !== 'sessions-dump:run') {
    try {
      registerIpc('sessions-dump:run', sessionsDumpHandler);
    } catch (error) {
      logWarn('ipc', 'Skip duplicate fallback IPC registration', {
        channel: 'sessions-dump:run',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // top-toolbar 相关 IPC（窗口控制、渲染端日志）统一在区块 main 层注册。
  registerTopToolbarIpc(context);
}

module.exports = { registerTopToolbarMain };
