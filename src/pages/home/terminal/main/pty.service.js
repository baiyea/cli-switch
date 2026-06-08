const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const pty = require('node-pty');
const { getDefaultShell, getPtyEnv } = require('./shell');

function normalizePtyDimension(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.floor(numeric));
}

class PtyService {
  constructor({ onData, onExit, getStartupEnv, logInfo, logWarn } = {}) {
    this.sessions = new Map();
    this.buffers = new Map();
    this.dataStats = new Map();
    this.resizeStats = new Map();
    this.onData = onData || (() => {});
    this.onExit = onExit || (() => {});
    this.getStartupEnv = getStartupEnv || (() => ({}));
    this.logInfo = logInfo || (() => {});
    this.logWarn = logWarn || (() => {});
  }

  appendBuffer(sessionId, chunk) {
    const prev = this.buffers.get(sessionId) || '';
    const merged = prev + chunk;
    const limit = 300000;
    this.buffers.set(sessionId, merged.length > limit ? merged.slice(-limit) : merged);
  }

  create({ cwd, name, provider, sessionId: preferredSessionId, initialCols, initialRows }) {
    const sessionId = preferredSessionId || crypto.randomUUID();
    if (this.sessions.has(sessionId)) {
      const existing = this.sessions.get(sessionId);
      this.logInfo('pty', 'PTY create skipped: session already exists', {
        sessionId,
        provider: existing?.provider || provider || 'claude',
        status: existing?.status || 'running',
        bufferLength: String(this.buffers.get(sessionId) || '').length,
      });
      return { sessionId, name: this.sessions.get(sessionId).name };
    }
    this.buffers.set(sessionId, '');
    const initialPtyCols = normalizePtyDimension(initialCols, 120);
    const initialPtyRows = normalizePtyDimension(initialRows, 36);
    const shell = getDefaultShell();
    const proc = pty.spawn(shell.file, shell.args, {
      name: 'xterm-color',
      cols: initialPtyCols,
      rows: initialPtyRows,
      cwd,
      env: getPtyEnv(this.getStartupEnv({ provider: provider || 'claude', cwd })),
    });
    this.logInfo('pty', 'PTY spawned', {
      sessionId,
      provider: provider || 'claude',
      cwd,
      shell: shell.file,
      shellArgs: shell.args,
      pid: proc?.pid || null,
      initialCols: initialPtyCols,
      initialRows: initialPtyRows,
    });

    const meta = {
      sessionId,
      name: name || `shell-${sessionId.slice(0, 4)}`,
      cwd,
      provider: provider || 'claude',
      status: 'running',
      createdAt: Date.now(),
      initialCols: initialPtyCols,
      initialRows: initialPtyRows,
      pty: proc,
      autoResponses: new Set(),
    };

    proc.onData((data) => {
      this.appendBuffer(sessionId, data);
      this.handleAutoResponses(meta);
      const prevStats = this.dataStats.get(sessionId) || {
        chunks: 0,
        totalLength: 0,
        lastLogAt: 0,
      };
      const now = Date.now();
      const nextStats = {
        chunks: prevStats.chunks + 1,
        totalLength: prevStats.totalLength + String(data || '').length,
        lastLogAt: prevStats.lastLogAt,
      };
      if (nextStats.chunks <= 3 || now - prevStats.lastLogAt > 10000) {
        nextStats.lastLogAt = now;
        this.logInfo('pty', 'PTY output received', {
          sessionId,
          provider: meta.provider,
          chunkLength: String(data || '').length,
          chunks: nextStats.chunks,
          totalLength: nextStats.totalLength,
          bufferLength: String(this.buffers.get(sessionId) || '').length,
        });
      }
      this.dataStats.set(sessionId, nextStats);
      this.onData({ sessionId, data });
    });

    proc.onExit(({ exitCode }) => {
      const current = this.sessions.get(sessionId);
      if (!current) return;
      if (current.pty !== proc) {
        this.logInfo('pty', 'Ignored stale PTY exit for replaced session', {
          sessionId,
          provider: meta.provider,
          exitCode,
        });
        return;
      }
      current.status = 'exited';
      current.exitCode = exitCode;
      this.appendBuffer(sessionId, `\r\n[process exited with code ${exitCode}]\r\n`);
      this.onExit({ sessionId, exitCode });
      this.sessions.delete(sessionId);
      this.dataStats.delete(sessionId);
      this.resizeStats.delete(sessionId);
    });

    this.sessions.set(sessionId, meta);

    return {
      sessionId,
      name: meta.name,
    };
  }

  stripAnsi(value) {
    return String(value || '')
      .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
      .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
      .replace(/\r/g, '\n');
  }

  handleAutoResponses(meta) {
    if (!meta || String(meta.provider || 'claude').toLowerCase() !== 'claude') return;
    const text = this.stripAnsi(this.buffers.get(meta.sessionId) || '').slice(-12000);
    const prompts = [
      {
        key: 'claude-theme',
        test: /Choose the text style that looks best with your terminal/i,
        input: '\r',
        repeat: true,
      },
      {
        key: 'claude-trust-workspace',
        test: /Enter to confirm/i,
        input: '\r',
        repeat: true,
      },
      {
        key: 'claude-bypass-permissions',
        test: /Bypass Permissions mode/i,
        guards: [/Yes,\s*I accept/i, /No,\s*exit/i],
        input: '2\r',
      },
      {
        key: 'claude-api-key-confirm',
        test: /Detected a custom API key in your environment/i,
        guards: [/Do you want to use this API key\?/i, /1\.\s*Yes/i, /2\.\s*No\s*\(recommended\)/i],
        input: '\x1b[A\r',
        repeat: true,
      },
    ];

    for (const prompt of prompts) {
      if (meta.autoResponses.has(prompt.key) || !prompt.test.test(text)) continue;
      if (Array.isArray(prompt.guards) && prompt.guards.some((guard) => !guard.test(text)))
        continue;
      if (
        prompt.key === 'claude-trust-workspace' &&
        !/Quick safety check:|Yes,\s*I trust this folder|Accessing workspace:/i.test(text)
      )
        continue;
      meta.autoResponses.add(prompt.key);
      meta.pty.write(prompt.input);
      if (prompt.repeat) {
        setTimeout(() => {
          try {
            if (this.sessions.has(meta.sessionId)) meta.pty.write(prompt.input);
          } catch {}
        }, 500);
      }
      break;
    }
  }

  hasSession(sessionId) {
    return this.sessions.has(sessionId);
  }

  getSessionMeta(sessionId) {
    const target = this.sessions.get(sessionId);
    if (!target) return null;
    return {
      sessionId: target.sessionId,
      name: target.name,
      cwd: target.cwd,
      provider: target.provider,
      status: target.status,
      createdAt: target.createdAt,
      initialCols: target.initialCols,
      initialRows: target.initialRows,
    };
  }

  write(sessionId, data) {
    const target = this.sessions.get(sessionId);
    if (!target) {
      this.logWarn('pty', 'PTY write skipped: session not found', {
        sessionId,
        dataLength: String(data || '').length,
      });
      return false;
    }
    target.pty.write(data);
    this.logInfo('pty', 'PTY input written', {
      sessionId,
      provider: target.provider,
      dataLength: String(data || '').length,
      bufferLength: String(this.buffers.get(sessionId) || '').length,
    });
    return true;
  }

  resize(sessionId, cols, rows) {
    const target = this.sessions.get(sessionId);
    if (!target) {
      this.logWarn('pty', 'PTY resize skipped: session not found', { sessionId, cols, rows });
      return;
    }
    if (!Number.isFinite(cols) || !Number.isFinite(rows)) {
      this.logWarn('pty', 'PTY resize skipped: invalid dimensions', { sessionId, cols, rows });
      return;
    }
    const nextCols = Math.max(1, Math.floor(cols));
    const nextRows = Math.max(1, Math.floor(rows));
    target.pty.resize(nextCols, nextRows);
    const prevResize = this.resizeStats.get(sessionId);
    if (!prevResize || prevResize.cols !== nextCols || prevResize.rows !== nextRows) {
      this.resizeStats.set(sessionId, { cols: nextCols, rows: nextRows });
      this.logInfo('pty', 'PTY resized', {
        sessionId,
        provider: target.provider,
        cols: nextCols,
        rows: nextRows,
      });
    }
  }

  killWindowsProcessTree(pid) {
    const numericPid = Number(pid);
    if (!Number.isInteger(numericPid) || numericPid <= 0) return false;
    const result = spawnSync('taskkill.exe', ['/PID', String(numericPid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return result.status === 0;
  }

  destroy(sessionId, options = {}) {
    const target = this.sessions.get(sessionId);
    if (!target) return;
    const quiet = options?.quiet === true;
    if (quiet && process.platform === 'win32') {
      try {
        const killed = this.killWindowsProcessTree(target.pty?.pid);
        if (!killed) {
          this.logWarn('pty', 'Windows quiet PTY cleanup did not confirm taskkill success', {
            sessionId,
            pid: target.pty?.pid || null,
          });
        }
      } catch (error) {
        this.logWarn('pty', 'Windows quiet PTY cleanup failed', {
          sessionId,
          pid: target.pty?.pid || null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      try {
        target.pty.kill();
      } catch {}
    }
    this.sessions.delete(sessionId);
    this.dataStats.delete(sessionId);
    this.resizeStats.delete(sessionId);
  }

  getSnapshot(sessionId) {
    const target = this.sessions.get(sessionId);
    this.logInfo('pty', 'PTY snapshot read', {
      sessionId,
      provider: target?.provider || '',
      hasSession: Boolean(target),
      bufferLength: String(this.buffers.get(sessionId) || '').length,
    });
    return {
      sessionId,
      data: this.buffers.get(sessionId) || '',
    };
  }

  destroyAll(options = {}) {
    for (const sessionId of this.sessions.keys()) {
      this.destroy(sessionId, options);
    }
  }
}

module.exports = { PtyService, normalizePtyDimension };
