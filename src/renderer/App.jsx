import React, { useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const MAX_SESSION_BUFFER = 200000;
const DEFAULT_CLAUDE_SETTINGS = {
  apiUrl: "",
  apiKey: "",
  apiKeyEnvVarName: "ANTHROPIC_API_KEY",
  model: "",
  additionalEnvVars: []
};

function isValidHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function App() {
  const terminalWrapRef = useRef(null);
  const activeSessionIdRef = useRef(null);
  const activeProjectIdRef = useRef(null);
  const sessionsByIdRef = useRef(new Map());

  const terminalContainersRef = useRef(new Map());
  const terminalInstancesRef = useRef(new Map());
  const sessionBuffersRef = useRef(new Map());

  const [projects, setProjects] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [providers, setProviders] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [archivedSessions, setArchivedSessions] = useState([]);
  const [viewMode, setViewMode] = useState("chat");

  const [claudeSettings, setClaudeSettings] = useState(DEFAULT_CLAUDE_SETTINGS);
  const [settingsError, setSettingsError] = useState("");
  const [settingsSavedAt, setSettingsSavedAt] = useState(0);
  const [sessionError, setSessionError] = useState("");
  const [tabEditSessionId, setTabEditSessionId] = useState(null);
  const [tabEditTitle, setTabEditTitle] = useState("");

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || null,
    [sessions, activeSessionId]
  );

  function appendSessionBuffer(sessionId, text) {
    const prev = sessionBuffersRef.current.get(sessionId) || "";
    const merged = prev + text;
    sessionBuffersRef.current.set(
      sessionId,
      merged.length > MAX_SESSION_BUFFER ? merged.slice(-MAX_SESSION_BUFFER) : merged
    );
  }

  async function refreshProjects() {
    const list = await window.api.projects.list();
    setProjects(list);
    if (!activeProjectId && list[0]) setActiveProjectId(list[0].id);
  }

  async function refreshSessions(projectId) {
    if (!projectId) return;
    const list = await window.api.sessions.list(projectId);
    setSessions(list);
    if (!activeSessionId && list[0]) setActiveSessionId(list[0].id);
    if (activeSessionId && !list.some((s) => s.id === activeSessionId)) {
      setActiveSessionId(list[0]?.id || null);
    }
  }

  async function refreshArchivedSessions(projectId) {
    if (!projectId) return;
    const list = await window.api.sessions.listArchived(projectId);
    setArchivedSessions(list);
  }

  async function loadClaudeSettings() {
    const value = await window.api.settings.getClaude();
    setClaudeSettings({ ...DEFAULT_CLAUDE_SETTINGS, ...(value || {}) });
  }

  function showSessionTerminal(sessionId) {
    for (const [id, el] of terminalContainersRef.current.entries()) {
      el.style.display = id === sessionId && viewMode === "chat" ? "block" : "none";
    }

    const entry = terminalInstancesRef.current.get(sessionId);
    if (entry && viewMode === "chat") {
      entry.fit.fit();
      entry.term.focus();
    }
  }

  async function ensureTerminal(sessionId) {
    if (!sessionId) return;
    if (terminalInstancesRef.current.has(sessionId)) {
      showSessionTerminal(sessionId);
      return;
    }

    const container = terminalContainersRef.current.get(sessionId);
    if (!container) return;

    const term = new Terminal({
      convertEol: true,
      fontSize: 13,
      cursorBlink: true,
      theme: {
        background: "#f7f7f6",
        foreground: "#252525"
      }
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    fit.fit();

    term.onData((data) => {
      if (activeSessionIdRef.current !== sessionId) return;
      window.api.terminal.input(sessionId, data).catch(() => {});
    });

    terminalInstancesRef.current.set(sessionId, { term, fit });

    let snapshot = sessionBuffersRef.current.get(sessionId);
    if (!snapshot) {
      const latest = await window.api.sessions.buffer(sessionId).catch(() => ({ buffer: "" }));
      snapshot = latest?.buffer || "";
      sessionBuffersRef.current.set(sessionId, snapshot);
    }

    if (snapshot) term.write(snapshot);
    showSessionTerminal(sessionId);
  }

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
    ensureTerminal(activeSessionId);
    showSessionTerminal(activeSessionId);
  }, [activeSessionId, viewMode]);

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  useEffect(() => {
    sessionsByIdRef.current = new Map(sessions.map((s) => [s.id, s]));
  }, [sessions]);

  useEffect(() => {
    window.__ZEELIN_TEST__ = {
      getSessionBuffer: (sessionId) => sessionBuffersRef.current.get(sessionId) || "",
      getActiveSessionId: () => activeSessionIdRef.current,
      getRenderedText: () => {
        const sid = activeSessionIdRef.current;
        const entry = terminalInstancesRef.current.get(sid);
        if (!entry) return "";

        const out = [];
        const buf = entry.term.buffer.active;
        for (let i = 0; i < buf.length; i += 1) {
          const line = buf.getLine(i);
          if (line) out.push(line.translateToString(true));
        }
        return out.join("\n");
      }
    };

    return () => {
      delete window.__ZEELIN_TEST__;
    };
  }, []);

  useEffect(() => {
    refreshProjects();
    window.api.providers.list().then(setProviders);
    loadClaudeSettings();
  }, []);

  useEffect(() => {
    refreshSessions(activeProjectId);
    refreshArchivedSessions(activeProjectId);
  }, [activeProjectId]);

  useEffect(() => {
    const offOutput = window.api.terminal.onOutput(({ sessionId, chunk }) => {
      appendSessionBuffer(sessionId, chunk);
      const entry = terminalInstancesRef.current.get(sessionId);
      if (entry) entry.term.write(chunk);
    });

    const offExit = window.api.terminal.onExit(async ({ sessionId, code }) => {
      const line = `\r\n[Process exited: ${code}]\r\n`;
      appendSessionBuffer(sessionId, line);
      const entry = terminalInstancesRef.current.get(sessionId);
      if (entry) entry.term.write(line);

      try {
        const latest = await window.api.sessions.buffer(sessionId);
        if (latest && typeof latest.buffer === "string") {
          sessionBuffersRef.current.set(sessionId, latest.buffer);
        }
      } catch {
      }

      if (activeProjectIdRef.current) refreshSessions(activeProjectIdRef.current);
    });

    const onResize = () => {
      for (const { fit } of terminalInstancesRef.current.values()) {
        fit.fit();
      }
    };
    window.addEventListener("resize", onResize);

    return () => {
      offOutput();
      offExit();
      window.removeEventListener("resize", onResize);

      for (const { term } of terminalInstancesRef.current.values()) {
        term.dispose();
      }
      terminalInstancesRef.current.clear();
    };
  }, []);

  async function onAddProject() {
    setSessionError("");
    const created = await window.api.projects.add();
    if (created) {
      await refreshProjects();
      setActiveProjectId(created.id);
    }
  }

  async function ensureSessionRunning(session) {
    if (!session) return;

    try {
      if (session.provider_session_id) {
        await window.api.sessions.resume(session.id);
      } else {
        await window.api.sessions.start(session.id);
      }
    } catch {
      await window.api.sessions.start(session.id);
    }

    await refreshSessions(session.project_id);
  }

  async function onSelectSession(session) {
    setSessionError("");
    setViewMode("chat");
    setActiveSessionId(session.id);

    await ensureTerminal(session.id);
    await ensureSessionRunning(session);

    const latest = await window.api.sessions.buffer(session.id).catch(() => ({ buffer: "" }));
    if (latest && typeof latest.buffer === "string") {
      sessionBuffersRef.current.set(session.id, latest.buffer);
      const entry = terminalInstancesRef.current.get(session.id);
      if (entry) {
        entry.term.reset();
        if (latest.buffer) entry.term.write(latest.buffer);
      }
    }

    showSessionTerminal(session.id);
  }

  async function onArchiveSession(sessionId) {
    await window.api.sessions.archive(sessionId);
    await refreshSessions(activeProjectIdRef.current);
    await refreshArchivedSessions(activeProjectIdRef.current);

    if (activeSessionIdRef.current === sessionId) {
      const next = sessions.find((s) => s.id !== sessionId);
      setActiveSessionId(next?.id || null);
    }
  }

  async function onRestoreSession(sessionId) {
    await window.api.sessions.restore(sessionId);
    await refreshSessions(activeProjectIdRef.current);
    await refreshArchivedSessions(activeProjectIdRef.current);
  }

  function startRenameSession(session) {
    setTabEditSessionId(session.id);
    setTabEditTitle(session.title);
  }

  async function commitRenameSession(sessionId) {
    const title = (tabEditTitle || "").trim();
    if (!title) return;
    await window.api.sessions.rename(sessionId, title);
    setTabEditSessionId(null);
    setTabEditTitle("");
    await refreshSessions(activeProjectIdRef.current);
  }

  async function onCreateSession() {
    setSessionError("");
    const projectId = activeProjectId || projects[0]?.id;
    if (!projectId) {
      setSessionError("请先添加并选择一个项目，再新建会话");
      return;
    }

    try {
      const created = await window.api.sessions.create({
        projectId,
        title: "New Chat",
        provider: "claude"
      });
      await refreshSessions(projectId);

      try {
        await onSelectSession(created);
      } catch (e) {
        setViewMode("chat");
        setActiveSessionId(created.id);
        setSessionError(`会话已创建，但启动失败：${e?.message || "未知错误"}`);
      }
    } catch (e) {
      setSessionError(`新建会话失败：${e?.message || "未知错误"}`);
    }
  }

  function updateClaudeSetting(key, value) {
    setSettingsSavedAt(0);
    setSettingsError("");
    setClaudeSettings((prev) => ({ ...prev, [key]: value }));
  }

  function updateAdditionalEnv(index, key, value) {
    setSettingsSavedAt(0);
    setSettingsError("");
    setClaudeSettings((prev) => {
      const next = [...(prev.additionalEnvVars || [])];
      next[index] = { ...next[index], [key]: value };
      return { ...prev, additionalEnvVars: next };
    });
  }

  function addAdditionalEnv() {
    setSettingsSavedAt(0);
    setSettingsError("");
    setClaudeSettings((prev) => ({
      ...prev,
      additionalEnvVars: [...(prev.additionalEnvVars || []), { key: "", value: "" }]
    }));
  }

  function removeAdditionalEnv(index) {
    setSettingsSavedAt(0);
    setSettingsError("");
    setClaudeSettings((prev) => ({
      ...prev,
      additionalEnvVars: (prev.additionalEnvVars || []).filter((_, i) => i !== index)
    }));
  }

  async function onSaveClaudeSettings() {
    const apiUrl = (claudeSettings.apiUrl || "").trim();
    if (apiUrl && !isValidHttpUrl(apiUrl)) {
      setSettingsError("API URL 格式不正确，请使用 http:// 或 https://");
      return;
    }

    for (const pair of claudeSettings.additionalEnvVars || []) {
      if (!pair.key && !pair.value) continue;
      if (!/^[A-Z_][A-Z0-9_]*$/.test((pair.key || "").trim())) {
        setSettingsError("Additional environment variables 的 Key 需为大写环境变量格式");
        return;
      }
    }

    const payload = {
      apiUrl,
      apiKey: claudeSettings.apiKey || "",
      apiKeyEnvVarName: claudeSettings.apiKeyEnvVarName || "ANTHROPIC_API_KEY",
      model: (claudeSettings.model || "").trim(),
      additionalEnvVars: (claudeSettings.additionalEnvVars || [])
        .map((p) => ({ key: (p.key || "").trim(), value: p.value || "" }))
        .filter((p) => p.key)
    };

    try {
      const saved = await window.api.settings.saveClaude(payload);
      setClaudeSettings({ ...DEFAULT_CLAUDE_SETTINGS, ...(saved || {}) });
      setSettingsSavedAt(Date.now());
      setSettingsError("");
    } catch (e) {
      setSettingsError(e?.message || "保存失败");
    }
  }

  function setTerminalContainer(sessionId, el) {
    if (!el) {
      terminalContainersRef.current.delete(sessionId);
      const entry = terminalInstancesRef.current.get(sessionId);
      if (entry) {
        entry.term.dispose();
        terminalInstancesRef.current.delete(sessionId);
      }
      return;
    }

    terminalContainersRef.current.set(sessionId, el);
    ensureTerminal(sessionId);
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="title">ZeeLinCode</div>
        <button onClick={onAddProject}>+ 添加项目</button>
        <button onClick={onCreateSession} disabled={projects.length === 0}>+ 新建会话</button>
        <button className={`nav-btn ${viewMode === "settings" ? "active" : ""}`} onClick={() => setViewMode("settings")}>设置</button>

        <div className="block">
          <div className="label">项目</div>
          {projects.map((p) => (
            <div
              className={`item ${activeProjectId === p.id ? "active" : ""}`}
              key={p.id}
              onClick={() => setActiveProjectId(p.id)}
            >
              {p.name}
            </div>
          ))}
        </div>

        <div className="block">
          <div className="label">会话</div>
          {sessions.map((s) => (
            <div
              className={`item ${activeSessionId === s.id ? "active" : ""}`}
              key={s.id}
              onClick={() => onSelectSession(s)}
            >
              {s.title}
            </div>
          ))}
        </div>
      </aside>

      <main className="main">
        <header className="toolbar">
          <div>
            {viewMode === "settings"
              ? "设置 · Claude 启动环境变量"
              : (activeSession ? `${activeSession.title} (${activeSession.status})` : "未选择会话")}
          </div>
          <div className="provider-list">
            {providers.map((p) => (
              <button key={p.id} disabled={!p.enabled}>{p.label}</button>
            ))}
          </div>
        </header>

        {sessionError && viewMode === "chat" && (
          <div className="banner-error">{sessionError}</div>
        )}

        {viewMode === "chat" && (
          <div className="session-tabs">
            {sessions.map((s) => (
              <div
                key={`tab-${s.id}`}
                className={`session-tab ${activeSessionId === s.id ? "active" : ""}`}
                onClick={() => onSelectSession(s)}
                onDoubleClick={() => startRenameSession(s)}
              >
                {tabEditSessionId === s.id ? (
                  <input
                    value={tabEditTitle}
                    onChange={(e) => setTabEditTitle(e.target.value)}
                    onBlur={() => commitRenameSession(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRenameSession(s.id);
                      if (e.key === "Escape") {
                        setTabEditSessionId(null);
                        setTabEditTitle("");
                      }
                    }}
                    autoFocus
                  />
                ) : (
                  <span className="title">{s.title}</span>
                )}

                <button
                  className="tab-archive"
                  title="归档"
                  onClick={(e) => {
                    e.stopPropagation();
                    onArchiveSession(s.id);
                  }}
                >
                  归档
                </button>
              </div>
            ))}
          </div>
        )}

        <section
          key="terminal-pane"
          className="terminal-wrap"
          ref={terminalWrapRef}
          style={{ display: viewMode === "chat" ? "block" : "none" }}
          onClick={() => {
            const sid = activeSessionIdRef.current;
            if (!sid) return;
            const entry = terminalInstancesRef.current.get(sid);
            if (entry) entry.term.focus();
          }}
        >
          {sessions.map((s) => (
            <div
              key={s.id}
              className="terminal-pane"
              data-session-id={s.id}
              ref={(el) => setTerminalContainer(s.id, el)}
              onClick={() => {
                const entry = terminalInstancesRef.current.get(s.id);
                if (entry) entry.term.focus();
              }}
            />
          ))}
        </section>

        <section key="settings-pane" className="settings-wrap" style={{ display: viewMode === "settings" ? "block" : "none" }}>
          <div className="settings-form">
            <label>
              <span>API URL</span>
              <input
                type="url"
                placeholder="https://api.anthropic.com"
                value={claudeSettings.apiUrl}
                onChange={(e) => updateClaudeSetting("apiUrl", e.target.value)}
              />
            </label>

            <label>
              <span>API Key</span>
              <input
                type="password"
                placeholder="sk-..."
                value={claudeSettings.apiKey}
                onChange={(e) => updateClaudeSetting("apiKey", e.target.value)}
              />
            </label>

            <label>
              <span>API Key Env Var Name</span>
              <select
                value={claudeSettings.apiKeyEnvVarName}
                onChange={(e) => updateClaudeSetting("apiKeyEnvVarName", e.target.value)}
              >
                <option value="ANTHROPIC_API_KEY">ANTHROPIC_API_KEY</option>
                <option value="ANTHROPIC_AUTH_TOKEN">ANTHROPIC_AUTH_TOKEN</option>
              </select>
            </label>

            <label>
              <span>Model (optional)</span>
              <input
                type="text"
                placeholder="claude-3-5-sonnet-20241022"
                value={claudeSettings.model}
                onChange={(e) => updateClaudeSetting("model", e.target.value)}
              />
            </label>

            <div className="env-list">
              <div className="env-list-header">
                <span>Additional environment variables (optional)</span>
                <button onClick={addAdditionalEnv}>+ 新增变量</button>
              </div>

              {(claudeSettings.additionalEnvVars || []).map((pair, index) => (
                <div className="env-row" key={`env-${index}`}>
                  <input
                    type="text"
                    placeholder="KEY (e.g. ANTHROPIC_SMALL_FAST_MODEL)"
                    value={pair.key}
                    onChange={(e) => updateAdditionalEnv(index, "key", e.target.value.toUpperCase())}
                  />
                  <input
                    type="text"
                    placeholder="VALUE"
                    value={pair.value}
                    onChange={(e) => updateAdditionalEnv(index, "value", e.target.value)}
                  />
                  <button className="danger" onClick={() => removeAdditionalEnv(index)}>删除</button>
                </div>
              ))}
            </div>

            <div className="settings-actions">
              <button onClick={onSaveClaudeSettings}>保存设置</button>
              {settingsSavedAt > 0 && <span className="success">已保存</span>}
              {settingsError && <span className="error">{settingsError}</span>}
            </div>

            <div className="archived-list">
              <div className="archived-title">已归档会话</div>
              {(archivedSessions || []).length === 0 && (
                <div className="archived-empty">暂无归档会话</div>
              )}
              {(archivedSessions || []).map((s) => (
                <div className="archived-row" key={`arch-${s.id}`}>
                  <span>{s.title}</span>
                  <button onClick={() => onRestoreSession(s.id)}>恢复</button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
