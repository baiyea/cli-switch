const { ClaudeAdapter } = require("../providers/claude.adapter");
const { CodexAdapter } = require("../providers/codex.adapter");
const { GeminiAdapter } = require("../providers/gemini.adapter");
const { KimiAdapter } = require("../providers/kimi.adapter");

function resolveShell(platform) {
  if (platform === "win32") {
    return { command: "powershell.exe", args: ["-NoLogo"] };
  }
  return { command: "zsh", args: ["-l"] };
}

class SessionManager {
  constructor({ getSessionById, updateSessionState, updateProviderSessionId }) {
    this.getSessionById = getSessionById;
    this.updateSessionState = updateSessionState;
    this.updateProviderSessionId = updateProviderSessionId;
    this.runtimes = new Map();
    this.outputBuffers = new Map();
    this.maxBufferSize = 200000;
    this.adapters = {
      claude: new ClaudeAdapter(),
      codex: new CodexAdapter(),
      gemini: new GeminiAdapter(),
      kimi: new KimiAdapter()
    };
  }

  async startSession(sessionId, { platform, startupEnv, onOutput, onExit }) {
    if (this.runtimes.has(sessionId)) {
      this.updateSessionState({ sessionId, status: "running" });
      return { ok: true, alreadyRunning: true };
    }

    const session = this.getSessionById(sessionId);
    if (!session) throw new Error("Session not found");

    const adapter = this.adapters[session.provider];
    if (!adapter) throw new Error("Provider adapter not found");

    const runtime = await adapter.startSession({
      cwd: session.cwd,
      shell: resolveShell(platform),
      startupEnv,
      onOutput: (chunk) => {
        this.appendOutput(sessionId, chunk);
        onOutput(chunk);
      },
      onExit: (payload) => {
        this.runtimes.delete(sessionId);
        this.updateSessionState({ sessionId, status: "stopped" });
        onExit(payload);
      }
    });

    this.runtimes.set(sessionId, { adapter, runtime: runtime.pty });
    this.updateSessionState({ sessionId, status: "running" });

    const sid = await adapter.fetchSessionId({ runtimeId: runtime.runtimeId, runtime: runtime.pty });
    if (sid) this.updateProviderSessionId({ sessionId, providerSessionId: sid });

    return { ok: true };
  }

  async resumeSession(sessionId, { platform, startupEnv, onOutput, onExit }) {
    if (this.runtimes.has(sessionId)) {
      this.updateSessionState({ sessionId, status: "running" });
      return { ok: true, alreadyRunning: true };
    }

    const session = this.getSessionById(sessionId);
    if (!session) throw new Error("Session not found");
    if (!session.provider_session_id) throw new Error("provider_session_id missing");

    const adapter = this.adapters[session.provider];
    const runtime = await adapter.resumeSession({
      cwd: session.cwd,
      providerSessionId: session.provider_session_id,
      shell: resolveShell(platform),
      startupEnv,
      onOutput: (chunk) => {
        this.appendOutput(sessionId, chunk);
        onOutput(chunk);
      },
      onExit: (payload) => {
        this.runtimes.delete(sessionId);
        this.updateSessionState({ sessionId, status: "stopped" });
        onExit(payload);
      }
    });

    this.runtimes.set(sessionId, { adapter, runtime: runtime.pty });
    this.updateSessionState({ sessionId, status: "running" });

    return { ok: true };
  }

  async stopSession(sessionId) {
    const entry = this.runtimes.get(sessionId);
    if (!entry) return { ok: true };

    await entry.adapter.stopSession({ runtime: entry.runtime });
    this.runtimes.delete(sessionId);
    this.updateSessionState({ sessionId, status: "stopped" });
    return { ok: true };
  }

  async sendInput(sessionId, text) {
    const entry = this.runtimes.get(sessionId);
    if (!entry) throw new Error("Session is not running");

    await entry.adapter.sendInput({ runtime: entry.runtime, text });
    return { ok: true };
  }

  appendOutput(sessionId, chunk) {
    const prev = this.outputBuffers.get(sessionId) || "";
    const merged = prev + chunk;
    this.outputBuffers.set(
      sessionId,
      merged.length > this.maxBufferSize ? merged.slice(-this.maxBufferSize) : merged
    );
  }

  getSessionBuffer(sessionId) {
    return this.outputBuffers.get(sessionId) || "";
  }
}

module.exports = { SessionManager };
