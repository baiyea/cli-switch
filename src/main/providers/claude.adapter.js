const pty = require("node-pty");
const { BaseProviderAdapter } = require("./base");

class ClaudeAdapter extends BaseProviderAdapter {
  id = "claude";

  parseCommand(command) {
    const parts = (command.match(/(?:[^\s"]+|"[^"]*")+/g) || []).map((p) =>
      p.startsWith("\"") && p.endsWith("\"") ? p.slice(1, -1) : p
    );
    if (parts.length === 0) return { command: "claude", args: [] };
    return { command: parts[0], args: parts.slice(1) };
  }

  getStartCommand() {
    return process.env.ZEELIN_CLAUDE_START_CMD || "claude";
  }

  getResumeCommand(providerSessionId) {
    const tpl = process.env.ZEELIN_CLAUDE_RESUME_CMD_TEMPLATE;
    if (tpl) return tpl.replaceAll("{sessionId}", providerSessionId);
    return `claude resume ${providerSessionId}`;
  }

  async isAvailable() {
    return { ok: true };
  }

  async startSession({ cwd, startupEnv = {}, onOutput, onExit }) {
    const boot = this.parseCommand(this.getStartCommand());
    const proc = pty.spawn(boot.command, boot.args, {
      name: "xterm-color",
      cols: 120,
      rows: 36,
      cwd,
      env: { ...process.env, ...startupEnv }
    });

    proc.onData((chunk) => onOutput(chunk));
    proc.onExit(({ exitCode, signal }) => onExit({ code: exitCode, signal }));

    return {
      runtimeId: String(proc.pid),
      pty: proc
    };
  }

  async resumeSession({ cwd, providerSessionId, startupEnv = {}, onOutput, onExit }) {
    const boot = this.parseCommand(this.getResumeCommand(providerSessionId));
    const proc = pty.spawn(boot.command, boot.args, {
      name: "xterm-color",
      cols: 120,
      rows: 36,
      cwd,
      env: { ...process.env, ...startupEnv }
    });

    proc.onData((chunk) => onOutput(chunk));
    proc.onExit(({ exitCode, signal }) => onExit({ code: exitCode, signal }));

    return {
      runtimeId: String(proc.pid),
      pty: proc
    };
  }

  async sendInput({ runtime, text }) {
    runtime.write(text);
  }

  async stopSession({ runtime }) {
    runtime.write("\u0003");
    setTimeout(() => {
      try {
        runtime.kill();
      } catch {
      }
    }, 120);
  }

  async fetchSessionId() {
    return null;
  }
}

module.exports = { ClaudeAdapter };
