function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripAnsi(text) {
  return String(text || '')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '');
}

function hasShellPrompt(snapshotText) {
  const normalized = stripAnsi(snapshotText).replace(/\r/g, '');
  if (!normalized) return false;
  const lines = normalized
    .split('\n')
    .slice(-10)
    .map((line) => String(line || '').trimEnd());
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (
      /ELECTRON_RUN_AS_NODE=1|No startup command available|No launch command available/i.test(line)
    ) {
      return false;
    }
    if (/(^|[^\w])[#$%>] ?$/.test(line)) {
      return true;
    }
    if (/^[^@\s]+@[^:\s]+:.*[$#] ?$/.test(line)) {
      return true;
    }
    return false;
  }
  return false;
}

function createShellBootstrapService({
  ptyService,
  shellBootstrapTimeoutMs = 3000,
  shellBootstrapPollMs = 60,
} = {}) {
  const sessionStartInFlight = new Map();

  async function waitForShellBootstrap(sessionId, timeoutMs = shellBootstrapTimeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const snapshot = ptyService.getSnapshot(sessionId);
      if (hasShellPrompt(snapshot?.data || '')) return true;
      await sleep(shellBootstrapPollMs);
    }
    return false;
  }

  function runWithSessionStartLock(sessionId, task) {
    if (sessionStartInFlight.has(sessionId)) {
      return sessionStartInFlight.get(sessionId);
    }
    const wrapped = Promise.resolve()
      .then(task)
      .finally(() => {
        if (sessionStartInFlight.get(sessionId) === wrapped) {
          sessionStartInFlight.delete(sessionId);
        }
      });
    sessionStartInFlight.set(sessionId, wrapped);
    return wrapped;
  }

  return {
    waitForShellBootstrap,
    runWithSessionStartLock,
  };
}

module.exports = {
  createShellBootstrapService,
};
