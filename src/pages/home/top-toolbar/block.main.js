function registerTopToolbarMain(context = {}) {
  const {
    registerIpc,
    IPC,
    skillgenRunSchema,
    skillgenRunner,
    logWarn = () => {}
  } = context;

  if (!registerIpc || !IPC) return;

  const skillgenHandler = async (_event, payload = {}) => {
    const parsed = skillgenRunSchema.parse(payload || {});
    return skillgenRunner.runForProject(parsed);
  };

  registerIpc(IPC.SKILLGEN_RUN, skillgenHandler);
  if (IPC.SKILLGEN_RUN !== "skillgen:run") {
    try {
      registerIpc("skillgen:run", skillgenHandler);
    } catch (error) {
      logWarn("ipc", "Skip duplicate fallback IPC registration", {
        channel: "skillgen:run",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

module.exports = { registerTopToolbarMain };
