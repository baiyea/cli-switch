const crypto = require("node:crypto");
const { IS_E2E } = require("../../../kernel/test-mode");

let ptyModule = null;

function getPtyModule() {
  if (ptyModule) return ptyModule;
  if (IS_E2E) {
    ptyModule = require("../../../../tests/mocks/mock-shell");
  } else {
    ptyModule = require("node-pty");
  }
  return ptyModule;
}

class PtyService {
  constructor({ onData, onExit, logWarn } = {}) {
    this.sessions = new Map();
    this.buffers = new Map();
    this.onData = onData || (() => {});
    this.onExit = onExit || (() => {});
    this.logWarn = logWarn || (() => {});
  }

  appendBuffer(sessionId, chunk) {
    const prev = this.buffers.get(sessionId) || "";
    const merged = prev + chunk;
    const limit = 300000;
    this.buffers.set(sessionId, merged.length > limit ? merged.slice(-limit) : merged);
  }

  create({ cwd, name, sessionId: preferredSessionId }) {
    const sessionId = preferredSessionId || crypto.randomUUID();
    if (this.sessions.has(sessionId)) {
      return { sessionId, name: this.sessions.get(sessionId).name };
    }
    this.buffers.set(sessionId, "");

    const pty = getPtyModule();
    let proc;

    if (IS_E2E) {
      proc = pty.createMockPty({ cwd, cols: 120, rows: 36 });
    } else {
      const { getDefaultShell, getPtyEnv } = require("../../../electron/utils/shell");
      const shell = getDefaultShell();
      proc = pty.spawn(shell.file, shell.args, {
        name: "xterm-color",
        cols: 120,
        rows: 36,
        cwd,
        env: getPtyEnv({}),
      });
    }

    const meta = {
      sessionId,
      name: name || `shell-${sessionId.slice(0, 4)}`,
      cwd,
      status: "running",
      createdAt: Date.now(),
      pty: proc,
    };

    if (IS_E2E) {
      proc.on("data", (data) => {
        this.appendBuffer(sessionId, data);
        this.onData({ sessionId, data });
      });
      proc.on("exit", ({ exitCode }) => {
        const current = this.sessions.get(sessionId);
        if (!current) return;
        current.status = "exited";
        current.exitCode = exitCode;
        this.appendBuffer(sessionId, `\r\n[process exited with code ${exitCode}]\r\n`);
        this.onExit({ sessionId, exitCode });
      });
    } else {
      proc.onData((data) => {
        this.appendBuffer(sessionId, data);
        this.onData({ sessionId, data });
      });
      proc.onExit(({ exitCode }) => {
        const current = this.sessions.get(sessionId);
        if (!current) return;
        current.status = "exited";
        current.exitCode = exitCode;
        this.appendBuffer(sessionId, `\r\n[process exited with code ${exitCode}]\r\n`);
        this.onExit({ sessionId, exitCode });
      });
    }

    this.sessions.set(sessionId, meta);
    return { sessionId, name: meta.name };
  }

  write(sessionId, data) {
    const meta = this.sessions.get(sessionId);
    if (!meta || meta.status !== "running") return;
    meta.pty.write(data);
  }

  resize(sessionId, cols, rows) {
    const meta = this.sessions.get(sessionId);
    if (!meta) return;
    if (typeof meta.pty.resize === "function") {
      meta.pty.resize(cols, rows);
    }
  }

  destroy(sessionId) {
    const meta = this.sessions.get(sessionId);
    if (!meta) return;
    try {
      meta.pty.kill();
    } catch (e) {
      this.logWarn(`kill pty failed: ${e.message}`);
    }
    this.sessions.delete(sessionId);
    this.buffers.delete(sessionId);
  }

  snapshot(sessionId) {
    return this.buffers.get(sessionId) || "";
  }

  destroyAll() {
    for (const [id] of this.sessions) {
      this.destroy(id);
    }
  }
}

module.exports = { PtyService };
