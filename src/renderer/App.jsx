import React, { useEffect, useMemo, useRef, useState } from "react";
import { Tree } from "react-arborist";
import { fileBridge, logBridge, projectBridge, sessionBridge, settingsBridge, skillgenBridge } from "../bridge";
import { TerminalPanel } from "../features/terminal/components/TerminalPanel";
import { ArchiveIcon, ExplorerToggleIcon, ProviderIcon, SettingsIcon } from "./icons/icon-registry";
import { useSessionStore } from "../store/session.store";

const DEFAULT_PROVIDER_SETTINGS = {
  defaultProfileId: "default",
  profiles: [{ id: "default", name: "Default Provider", envVars: [] }]
};
const DEFAULT_SETTINGS = {
  providers: {
    claude: { ...DEFAULT_PROVIDER_SETTINGS },
    codex: { ...DEFAULT_PROVIDER_SETTINGS },
    gemini: { ...DEFAULT_PROVIDER_SETTINGS }
  }
};
const SESSION_TOOL_OPTIONS = [
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex CLI" },
  { id: "gemini", label: "Gemini CLI" }
];
const PRIMARY_SESSION_TOOL_ID = "claude";
const PROVIDER_LABEL = {
  claude: "Claude Code",
  codex: "Codex CLI",
  gemini: "Gemini CLI"
};

function App() {
  const [projects, setProjects] = useState([]);
  const [expandedProjects, setExpandedProjects] = useState({});
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState("providers");
  const [providerTab, setProviderTab] = useState("claude");
  const [editingProfileByProvider, setEditingProfileByProvider] = useState({
    claude: "default",
    codex: "default",
    gemini: "default"
  });

  const [settingsModel, setSettingsModel] = useState(DEFAULT_SETTINGS);
  const [settingsError, setSettingsError] = useState("");
  const [settingsSavedAt, setSettingsSavedAt] = useState(0);
  const [appError, setAppError] = useState("");
  const [skillgenDialog, setSkillgenDialog] = useState({
    open: false,
    status: "idle",
    title: "",
    lines: []
  });
  const [explorerTree, setExplorerTree] = useState([]);
  const [explorerCwd, setExplorerCwd] = useState("");
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [archivedSessions, setArchivedSessions] = useState([]);
  const [explorerIsGitRepo, setExplorerIsGitRepo] = useState(false);
  const [explorerVisible, setExplorerVisible] = useState(false);
  const [explorerTreeHeight, setExplorerTreeHeight] = useState(300);
  const [openCreateMenuProjectId, setOpenCreateMenuProjectId] = useState(null);
  const [createMenuPlacementByProject, setCreateMenuPlacementByProject] = useState({});
  const explorerTreeWrapRef = useRef(null);

  const sessions = useSessionStore((state) => state.sessions);
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const createSession = useSessionStore((state) => state.createSession);
  const loadSessionsByProjects = useSessionStore((state) => state.loadSessionsByProjects);
  const ensureSessionRunning = useSessionStore((state) => state.ensureSessionRunning);
  const setActiveSession = useSessionStore((state) => state.setActiveSession);
  const destroySession = useSessionStore((state) => state.destroySession);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) || null,
    [projects, activeProjectId]
  );
  const activeSession = useMemo(
    () => sessions.find((s) => s.sessionId === activeSessionId) || null,
    [sessions, activeSessionId]
  );
  const activeWorkspaceCwd = activeSession?.cwd || activeProject?.path || "";
  const currentProviderSettings = settingsModel.providers?.[providerTab] || DEFAULT_PROVIDER_SETTINGS;
  const editingProfileId = editingProfileByProvider[providerTab] || currentProviderSettings.defaultProfileId || "default";

  async function loadProjects() {
    const list = await projectBridge.list();
    setProjects(list);

    setExpandedProjects((prev) => {
      const next = { ...prev };
      for (const p of list) {
        if (typeof next[p.id] !== "boolean") next[p.id] = true;
      }
      return next;
    });

    if (!activeProjectId && list[0]) {
      setActiveProjectId(list[0].id);
    }
    return list;
  }

  async function loadSettings() {
    const value = await settingsBridge.getClaude();
    const merged = {
      providers: {
        claude: {
          ...DEFAULT_PROVIDER_SETTINGS,
          ...(value?.providers?.claude || {})
        },
        codex: {
          ...DEFAULT_PROVIDER_SETTINGS,
          ...(value?.providers?.codex || {})
        },
        gemini: {
          ...DEFAULT_PROVIDER_SETTINGS,
          ...(value?.providers?.gemini || {})
        }
      }
    };
    setSettingsModel(merged);
    setEditingProfileByProvider((prev) => ({
      claude: prev.claude || merged.providers.claude.defaultProfileId || merged.providers.claude.profiles?.[0]?.id || "default",
      codex: prev.codex || merged.providers.codex.defaultProfileId || merged.providers.codex.profiles?.[0]?.id || "default",
      gemini: prev.gemini || merged.providers.gemini.defaultProfileId || merged.providers.gemini.profiles?.[0]?.id || "default"
    }));
  }

  async function onAddProject() {
    setAppError("");
    try {
      const created = await projectBridge.add();
      if (!created) return;
      const list = await loadProjects();
      await loadSessionsByProjects(list.map((p) => p.id));
      setActiveProjectId(created.id);
    } catch (e) {
      setAppError(`添加项目失败：${e?.message || "未知错误"}`);
    }
  }

  async function refreshSessions() {
    const ids = projects.map((p) => p.id);
    await loadSessionsByProjects(ids);
  }

  async function loadArchivedSessions() {
    const list = await sessionBridge.listArchived();
    setArchivedSessions(list);
  }

  async function loadExplorerTree(cwd) {
    if (!cwd) {
      setExplorerTree([]);
      setExplorerCwd("");
      setExplorerIsGitRepo(false);
      return;
    }
    setExplorerLoading(true);
    try {
      const result = await fileBridge.readTree({ cwd, depth: 4 });
      setExplorerTree(result.items || []);
      setExplorerCwd(result.cwd || cwd);
      setExplorerIsGitRepo(Boolean(result.isGitRepo));
    } catch {
      setExplorerTree([]);
      setExplorerCwd(cwd);
      setExplorerIsGitRepo(false);
    } finally {
      setExplorerLoading(false);
    }
  }

  async function onOpenWorkspaceInFileManager() {
    const target = activeWorkspaceCwd || activeProject?.path || "";
    if (!target) return;
    try {
      await fileBridge.openPath({ path: target });
    } catch (e) {
      setAppError(`打开目录失败：${e?.message || "未知错误"}`);
    }
  }

  async function onOpenExplorerFile(path) {
    if (!path) return;
    try {
      await fileBridge.openPath({ path });
    } catch (e) {
      setAppError(`打开文件失败：${e?.message || "未知错误"}`);
    }
  }

  async function createSessionForProject(project, toolId = PRIMARY_SESSION_TOOL_ID) {
    if (!project) return;
    setSettingsOpen(false);
    const currentTool = SESSION_TOOL_OPTIONS.find((item) => item.id === toolId) || SESSION_TOOL_OPTIONS[0];
    const sid = await createSession(project.id, project.path, currentTool.id);
    setActiveSession(sid);
  }

  async function onSyncProjectHistory(project) {
    if (!project) return;
    setAppError("");
    try {
      await sessionBridge.syncProject({ projectId: project.id });
      await refreshSessions();
    } catch (e) {
      setAppError(`读取历史会话失败：${e?.message || "未知错误"}`);
    }
  }

  async function onDiscardSettings() {
    await loadSettings();
    setSettingsError("");
    setSettingsSavedAt(0);
    setSettingsOpen(false);
  }

  async function onRestoreArchivedSession(archiveId) {
    await sessionBridge.restore({ archiveId });
    await Promise.all([refreshSessions(), loadArchivedSessions()]);
  }

  function updateEnvVar(index, key, value) {
    setSettingsError("");
    setSettingsSavedAt(0);
    setSettingsModel((prev) => {
      const nextProfiles = (prev.providers?.[providerTab]?.profiles || []).map((profile) => {
        if (profile.id !== editingProfileId) return profile;
        const nextEnv = [...(profile.envVars || [])];
        nextEnv[index] = { ...nextEnv[index], [key]: value };
        return { ...profile, envVars: nextEnv };
      });
      return {
        ...prev,
        providers: {
          ...(prev.providers || {}),
          [providerTab]: {
            ...(prev.providers?.[providerTab] || DEFAULT_PROVIDER_SETTINGS),
            profiles: nextProfiles
          }
        }
      };
    });
  }

  function addEnvVar() {
    setSettingsError("");
    setSettingsSavedAt(0);
    setSettingsModel((prev) => ({
      ...prev,
      providers: {
        ...(prev.providers || {}),
        [providerTab]: {
          ...(prev.providers?.[providerTab] || DEFAULT_PROVIDER_SETTINGS),
          profiles: (prev.providers?.[providerTab]?.profiles || []).map((profile) =>
            profile.id === editingProfileId
              ? { ...profile, envVars: [...(profile.envVars || []), { key: "", value: "" }] }
              : profile
          )
        }
      }
    }));
  }

  function removeEnvVar(index) {
    setSettingsError("");
    setSettingsSavedAt(0);
    setSettingsModel((prev) => ({
      ...prev,
      providers: {
        ...(prev.providers || {}),
        [providerTab]: {
          ...(prev.providers?.[providerTab] || DEFAULT_PROVIDER_SETTINGS),
          profiles: (prev.providers?.[providerTab]?.profiles || []).map((profile) =>
            profile.id === editingProfileId
              ? { ...profile, envVars: (profile.envVars || []).filter((_, i) => i !== index) }
              : profile
          )
        }
      }
    }));
  }

  function addProviderProfile() {
    const id = `provider-${Date.now()}`;
    setSettingsError("");
    setSettingsSavedAt(0);
    setSettingsModel((prev) => ({
      ...prev,
      providers: {
        ...(prev.providers || {}),
        [providerTab]: {
          ...(prev.providers?.[providerTab] || DEFAULT_PROVIDER_SETTINGS),
          profiles: [
            ...(prev.providers?.[providerTab]?.profiles || []),
            { id, name: `Provider ${(prev.providers?.[providerTab]?.profiles || []).length + 1}`, envVars: [] }
          ]
        }
      }
    }));
    setEditingProfileByProvider((prev) => ({ ...prev, [providerTab]: id }));
  }

  function renameProviderProfile(profileId, name) {
    setSettingsError("");
    setSettingsSavedAt(0);
    setSettingsModel((prev) => ({
      ...prev,
      providers: {
        ...(prev.providers || {}),
        [providerTab]: {
          ...(prev.providers?.[providerTab] || DEFAULT_PROVIDER_SETTINGS),
          profiles: (prev.providers?.[providerTab]?.profiles || []).map((profile) =>
            profile.id === profileId ? { ...profile, name } : profile
          )
        }
      }
    }));
  }

  function setDefaultProviderProfile(profileId) {
    setSettingsError("");
    setSettingsSavedAt(0);
    setSettingsModel((prev) => ({
      ...prev,
      providers: {
        ...(prev.providers || {}),
        [providerTab]: {
          ...(prev.providers?.[providerTab] || DEFAULT_PROVIDER_SETTINGS),
          defaultProfileId: profileId
        }
      }
    }));
    setEditingProfileByProvider((prev) => ({ ...prev, [providerTab]: profileId }));
  }

  function removeProviderProfile(profileId) {
    setSettingsError("");
    setSettingsSavedAt(0);
    setSettingsModel((prev) => {
      const currentProvider = prev.providers?.[providerTab] || DEFAULT_PROVIDER_SETTINGS;
      const next = (currentProvider.profiles || []).filter((profile) => profile.id !== profileId);
      if (next.length === 0) return prev;
      const defaultProfileId = currentProvider.defaultProfileId === profileId ? next[0].id : currentProvider.defaultProfileId;
      if (editingProfileId === profileId) {
        setEditingProfileByProvider((p) => ({ ...p, [providerTab]: defaultProfileId }));
      }
      return {
        ...prev,
        providers: {
          ...(prev.providers || {}),
          [providerTab]: {
            ...currentProvider,
            defaultProfileId,
            profiles: next
          }
        }
      };
    });
  }

  async function onSaveSettings() {
    const providerKeys = ["claude", "codex", "gemini"];
    const providersPayload = {};
    for (const providerKey of providerKeys) {
      const source = settingsModel.providers?.[providerKey] || DEFAULT_PROVIDER_SETTINGS;
      const profiles = (source.profiles || []).map((profile, idx) => ({
        id: String(profile.id || `provider-${idx + 1}`),
        name: String(profile.name || `Provider ${idx + 1}`).trim() || `Provider ${idx + 1}`,
        envVars: (profile.envVars || [])
          .map((pair) => ({ key: (pair.key || "").trim().toUpperCase(), value: pair.value || "" }))
          .filter((pair) => pair.key)
      }));

      if (profiles.length === 0) {
        setSettingsError(`Provider ${providerKey} 至少保留一个供应商配置`);
        return;
      }

      for (const profile of profiles) {
        for (const pair of profile.envVars) {
          if (!/^[A-Z_][A-Z0-9_]*$/.test(pair.key)) {
            setSettingsError("变量名格式不正确，仅支持大写字母/数字/下划线，且不能数字开头");
            return;
          }
        }
        if (!profile.name.trim()) {
          setSettingsError("供应商名称不能为空");
          return;
        }
      }

      const defaultProfileId = profiles.some((p) => p.id === source.defaultProfileId)
        ? source.defaultProfileId
        : profiles[0].id;
      providersPayload[providerKey] = { defaultProfileId, profiles };
    }

    try {
      const saved = await settingsBridge.saveClaude({ providers: providersPayload });
      setSettingsModel({ ...DEFAULT_SETTINGS, ...(saved || {}) });
      setSettingsSavedAt(Date.now());
      setSettingsError("");
    } catch (e) {
      setSettingsError(e?.message || "保存失败");
    }
  }

  const editingProfile = useMemo(
    () => (currentProviderSettings.profiles || []).find((profile) => profile.id === editingProfileId)
      || currentProviderSettings.profiles?.[0]
      || null,
    [currentProviderSettings, editingProfileId]
  );

  useEffect(() => {
    (async () => {
      const list = await loadProjects();
      await Promise.all([loadSettings(), loadSessionsByProjects(list.map((p) => p.id))]);
    })();
  }, []);

  useEffect(() => {
    if (!settingsOpen || settingsSection !== "archive") return;
    loadArchivedSessions();
  }, [settingsOpen, settingsSection]);

  useEffect(() => {
    if (!activeSession) return;
    const project = projects.find((item) => item.path === activeSession.cwd);
    if (project && project.id !== activeProjectId) {
      setActiveProjectId(project.id);
    }
  }, [activeSession, projects, activeProjectId]);

  useEffect(() => {
    if (!activeSessionId) return;
    logBridge.write({
      level: "info",
      scope: "app",
      message: "Ensuring session running",
      meta: { activeSessionId }
    });
    ensureSessionRunning(activeSessionId);
  }, [activeSessionId, ensureSessionRunning]);

  function buildSkillgenDialog(result) {
    if (Array.isArray(result)) {
      const totalCreated = result.reduce((sum, item) => sum + Number(item?.created || 0), 0);
      const totalUpdated = result.reduce((sum, item) => sum + Number(item?.updated || 0), 0);
      const totalDrafted = result.reduce((sum, item) => sum + Number(item?.drafted || 0), 0);
      const totalExtracted = totalCreated + totalUpdated;
      if (totalExtracted > 0) {
        return {
          status: "success",
          title: "提取完成",
          lines: [`已提取 ${totalExtracted} 个 Skill（新建 ${totalCreated}，更新 ${totalUpdated}）。`]
        };
      }
      if (totalDrafted > 0) {
        return {
          status: "info",
          title: "提取完成",
          lines: [`未提取到高置信 Skill，已生成 ${totalDrafted} 个候选草稿。`]
        };
      }
      return {
        status: "info",
        title: "提取完成",
        lines: ["未提取到有价值的内容。"]
      };
    }

    if (!result || typeof result !== "object") {
      return {
        status: "info",
        title: "提取完成",
        lines: ["未提取到有价值的内容。"]
      };
    }

    if (result.ok === false) {
      return {
        status: "error",
        title: "提取失败",
        lines: [result.error || result.reason || "未知错误"]
      };
    }

    const created = Number(result.created || 0);
    const updated = Number(result.updated || 0);
    const drafted = Number(result.drafted || 0);
    const processed = Number(result.processed || 0);
    const extracted = created + updated;

    if (extracted > 0) {
      return {
        status: "success",
        title: "提取完成",
        lines: [
          `已提取 ${extracted} 个 Skill（新建 ${created}，更新 ${updated}）。`,
          processed > 0 ? `本次分析消息数：${processed}` : ""
        ].filter(Boolean)
      };
    }

    if (drafted > 0) {
      return {
        status: "info",
        title: "提取完成",
        lines: [
          `未提取到高置信 Skill，已生成 ${drafted} 个候选草稿。`,
          processed > 0 ? `本次分析消息数：${processed}` : ""
        ].filter(Boolean)
      };
    }

    return {
      status: "info",
      title: "提取完成",
      lines: ["未提取到有价值的内容。"]
    };
  }

  async function onExtractSkill() {
    if (!activeSessionId || !activeSession) return;

    setAppError("");
    setSkillgenDialog({
      open: true,
      status: "running",
      title: "正在提取中",
      lines: ["正在提取中，请稍候..."]
    });
    logBridge.write({
      level: "info",
      scope: "app",
      message: "Triggering skill extraction",
      meta: {
        activeSessionId,
        projectId: activeSession.projectId || activeProjectId || null,
        trigger: "manual-button"
      }
    });
    try {
      const result = await skillgenBridge.run({
        projectId: activeSession.projectId || activeProjectId || undefined,
        trigger: "manual-button",
        force: true
      });
      const next = buildSkillgenDialog(result);
      setSkillgenDialog({
        open: true,
        status: next.status,
        title: next.title,
        lines: next.lines
      });
    } catch (e) {
      setSkillgenDialog({
        open: true,
        status: "error",
        title: "提取失败",
        lines: [e?.message || "未知错误"]
      });
    }
  }

  useEffect(() => {
    const profiles = currentProviderSettings.profiles || [];
    if (profiles.length === 0) return;
    if (!profiles.some((p) => p.id === editingProfileId)) {
      setEditingProfileByProvider((prev) => ({
        ...prev,
        [providerTab]: currentProviderSettings.defaultProfileId || profiles[0].id
      }));
    }
  }, [currentProviderSettings, editingProfileId, providerTab]);

  useEffect(() => {
    logBridge.write({
      level: "debug",
      scope: "app",
      message: "Loading explorer tree",
      meta: { cwd: activeWorkspaceCwd || "" }
    });
    loadExplorerTree(activeWorkspaceCwd);
  }, [activeWorkspaceCwd]);

  useEffect(() => {
    logBridge.write({
      level: "info",
      scope: "app",
      message: "Selection changed",
      meta: {
        activeProjectId: activeProject?.id || null,
        activeSessionId: activeSession?.sessionId || null,
        activeSessionCwd: activeSession?.cwd || ""
      }
    });
  }, [activeProject?.id, activeSession?.sessionId, activeSession?.cwd]);

  useEffect(() => {
    if (!openCreateMenuProjectId) return undefined;
    const onWindowClick = (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest(".project-create-wrap")) return;
      setOpenCreateMenuProjectId(null);
    };
    window.addEventListener("click", onWindowClick);
    return () => window.removeEventListener("click", onWindowClick);
  }, [openCreateMenuProjectId]);

  useEffect(() => {
    if (!activeProject || !explorerVisible) return;

    const updateHeight = () => {
      const container = explorerTreeWrapRef.current;
      if (!container) return;
      const nextHeight = Math.max(180, Math.floor(container.getBoundingClientRect().height));
      setExplorerTreeHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    };

    const scheduleUpdate = () => window.requestAnimationFrame(updateHeight);
    const raf1 = window.requestAnimationFrame(updateHeight);
    const raf2 = window.requestAnimationFrame(scheduleUpdate);
    window.addEventListener("resize", scheduleUpdate);

    let observer = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(scheduleUpdate);
      const container = explorerTreeWrapRef.current;
      if (container) observer.observe(container);
    }

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      window.removeEventListener("resize", scheduleUpdate);
      if (observer) observer.disconnect();
    };
  }, [activeProject, explorerVisible, explorerCwd]);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">▣</div>
          <div>
            <div className="brand-title">ZeeLinCode</div>
            <div className="brand-subtitle">ARCHITECTURAL EDITOR</div>
          </div>
        </div>

        <button className="add-project-btn" onClick={onAddProject}>+ Add Project</button>

        <div className="block">
          <div className="label">ACTIVE WORKSPACE</div>
          <div className="project-tree" data-testid="project-tree">
            {projects.map((p) => {
              const expanded = expandedProjects[p.id] !== false;
              const projectSessions = sessions.filter(
                (s) =>
                  s.projectId === p.id
                  || s.cwd === p.path
                  || s.cwd.startsWith(`${p.path}${p.path.endsWith("/") ? "" : "/"}`)
              );
              return (
                <div key={p.id} className="project-node" data-testid={`project-${p.id}`}>
                  <div
                    className={`project-head ${activeProjectId === p.id ? "active" : ""}`}
                    onClick={() => {
                      setActiveProjectId(p.id);
                      setExpandedProjects((prev) => ({ ...prev, [p.id]: !expanded }));
                      setSettingsOpen(false);
                    }}
                  >
                    <span className="project-caret">{expanded ? "▾" : "▸"}</span>
                    <span className="project-name">{p.name}</span>
                    <div className={`project-create-wrap ${openCreateMenuProjectId === p.id ? "open" : ""}`}>
                      <button
                        className="project-create-main"
                        title={`新建会话（${(SESSION_TOOL_OPTIONS.find((item) => item.id === PRIMARY_SESSION_TOOL_ID) || SESSION_TOOL_OPTIONS[0]).label}）`}
                        aria-label={`为项目 ${p.name} 新建会话`}
                        onClick={async (e) => {
                          e.stopPropagation();
                          setOpenCreateMenuProjectId(null);
                          setActiveProjectId(p.id);
                          await createSessionForProject(p, PRIMARY_SESSION_TOOL_ID);
                        }}
                      >
                        <ProviderIcon provider={PRIMARY_SESSION_TOOL_ID} className="project-tool-icon" />
                      </button>
                      <button
                        className="project-create-toggle"
                        title="选择会话类型"
                        aria-label="选择会话类型"
                        onClick={(e) => {
                          e.stopPropagation();
                          const button = e.currentTarget;
                          const block = button.closest(".block");
                          const menuEstimatedHeight = 230;
                          let placement = "down";
                          if (block instanceof HTMLElement && button instanceof HTMLElement) {
                            const blockRect = block.getBoundingClientRect();
                            const buttonRect = button.getBoundingClientRect();
                            const spaceBelow = blockRect.bottom - buttonRect.bottom;
                            const spaceAbove = buttonRect.top - blockRect.top;
                            if (spaceBelow < menuEstimatedHeight && spaceAbove > spaceBelow) {
                              placement = "up";
                            }
                          }
                          setCreateMenuPlacementByProject((prev) => ({ ...prev, [p.id]: placement }));
                          setOpenCreateMenuProjectId((prev) => (prev === p.id ? null : p.id));
                        }}
                      >
                        ▾
                      </button>
                      {openCreateMenuProjectId === p.id && (
                        <div
                          className={`project-create-menu ${createMenuPlacementByProject[p.id] === "up" ? "upward" : ""}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {SESSION_TOOL_OPTIONS.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              className={`project-create-item ${PRIMARY_SESSION_TOOL_ID === option.id ? "active" : ""}`}
                              onClick={async () => {
                                setOpenCreateMenuProjectId(null);
                                setActiveProjectId(p.id);
                                await createSessionForProject(p, option.id);
                              }}
                            >
                              <ProviderIcon provider={option.id} className="project-tool-icon" />
                              <span>{option.label}</span>
                            </button>
                          ))}
                          <div className="project-create-divider" />
                          <button
                            type="button"
                            className="project-create-item"
                            onClick={async () => {
                              setOpenCreateMenuProjectId(null);
                              setActiveProjectId(p.id);
                              await onSyncProjectHistory(p);
                            }}
                          >
                            <span className="project-create-history-icon" aria-hidden="true">↻</span>
                            <span>读取历史会话</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {expanded && (
                    <div className="project-content">
                      {projectSessions.length === 0 ? (
                        <div className="session-empty">暂无会话</div>
                      ) : (
                        projectSessions.map((session) => (
                          <div
                            key={session.sessionId}
                            className={`session-item ${session.sessionId === activeSessionId ? "active" : ""}`}
                            data-testid={`session-item-${session.sessionId}`}
                            onClick={() => {
                              setSettingsOpen(false);
                              setActiveProjectId(p.id);
                              setActiveSession(session.sessionId);
                              ensureSessionRunning(session.sessionId);
                            }}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key !== "Enter" && e.key !== " ") return;
                              e.preventDefault();
                              setSettingsOpen(false);
                              setActiveProjectId(p.id);
                              setActiveSession(session.sessionId);
                              ensureSessionRunning(session.sessionId);
                            }}
                          >
                            <ProviderIcon
                              provider={session.provider || "claude"}
                              className="project-tool-icon session-provider-icon"
                              variant="muted"
                              size={12}
                              title={PROVIDER_LABEL[session.provider] || session.provider || "Claude Code"}
                            />
                            <span className="session-item-name">{session.name}</span>
                            <button
                              type="button"
                              className="session-archive-btn"
                              title="归档会话"
                              aria-label={`归档会话 ${session.name}`}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                destroySession(session.sessionId);
                              }}
                            >
                              <ArchiveIcon size={12} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="sidebar-bottom">
          <button
            className={`nav-btn ${settingsOpen ? "active" : ""}`}
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon className="settings-link-icon" />
            <span>Settings</span>
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="toolbar">
          <div className="toolbar-title-group">
            <span className="toolbar-title">
              {activeSession ? activeSession.name : "ready"}
            </span>
            {activeSession && (
              <span className={`status-chip ${activeSession.status}`}>
                {activeSession.status}
              </span>
            )}
            <span className="provider-name">{PROVIDER_LABEL[activeSession?.provider || "claude"] || "Claude Code"}</span>
          </div>

          <div className="toolbar-actions">
            <button
              className="skill-extract-btn"
              type="button"
              onClick={onExtractSkill}
              disabled={!activeSessionId || skillgenDialog.status === "running"}
              title="从当前会话提取并生成项目 Skill"
            >
              提取技能
            </button>
            <button
              className="archive-btn"
              type="button"
              onClick={() => activeSessionId && destroySession(activeSessionId)}
              disabled={!activeSessionId}
            >
              Archive
            </button>
            <button
              className={`explorer-toggle-btn ${explorerVisible ? "active" : ""}`}
              type="button"
              title={explorerVisible ? "关闭文件树" : "展开文件树"}
              aria-label={explorerVisible ? "关闭文件树" : "展开文件树"}
              onClick={() => setExplorerVisible((prev) => !prev)}
            >
              <ExplorerToggleIcon size={16} />
            </button>
          </div>
        </header>

        {appError && <div className="banner-error">{appError}</div>}

        {skillgenDialog.open && (
          <div
            className="skillgen-modal-backdrop"
            onClick={() => {
              if (skillgenDialog.status === "running") return;
              setSkillgenDialog((prev) => ({ ...prev, open: false }));
            }}
          >
            <div className="skillgen-modal" onClick={(e) => e.stopPropagation()}>
              <div className="skillgen-modal-header">
                <div className={`skillgen-dot ${skillgenDialog.status}`} />
                <div className="skillgen-title">{skillgenDialog.title}</div>
              </div>
              <div className="skillgen-body">
                {skillgenDialog.lines.map((line, idx) => (
                  <div key={`${line}-${idx}`} className="skillgen-line">{line}</div>
                ))}
              </div>
              <div className="skillgen-footer">
                <button
                  type="button"
                  className="skillgen-close-btn"
                  onClick={() => setSkillgenDialog((prev) => ({ ...prev, open: false }))}
                  disabled={skillgenDialog.status === "running"}
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        )}

        <div className={`main-content ${explorerVisible ? "" : "explorer-hidden"}`}>
          <section className="main-panel">
            {activeProject ? (
              <TerminalPanel projectId={activeProject.id} cwd={activeProject.path} />
            ) : (
              <div className="settings-wrap" style={{ display: "block" }}>
                Select a project from the sidebar to begin your architectural session.
              </div>
            )}
          </section>

          <aside className="explorer" style={{ display: explorerVisible ? "flex" : "none" }}>
            <div className="explorer-head">
              <span>EXPLORER</span>
              <div className="explorer-actions">
                <button
                  type="button"
                  title="Open Workspace"
                  aria-label="Open Workspace"
                  onClick={onOpenWorkspaceInFileManager}
                  disabled={!activeWorkspaceCwd && !activeProject?.path}
                >
                  📁
                </button>
              </div>
            </div>

            {activeProject ? (
              <div className="explorer-tree">
                <div className="explorer-root-row">
                  <span className="explorer-root-path" title={explorerCwd || activeWorkspaceCwd}>
                    {explorerCwd || activeWorkspaceCwd}
                  </span>
                </div>
                <div className="explorer-tree-wrap" ref={explorerTreeWrapRef}>
                  {explorerLoading ? (
                    <div className="explorer-empty">Loading directory...</div>
                  ) : (
                    <Tree
                      data={explorerTree}
                      idAccessor={(item) => item.path}
                      childrenAccessor={(item) => item.children}
                      width="100%"
                      height={explorerTreeHeight}
                      rowHeight={28}
                      indent={18}
                      openByDefault={false}
                      className="explorer-arborist"
                    >
                      {({ node, style, dragHandle }) => (
                        <div
                          style={style}
                          ref={dragHandle}
                          className={`explorer-node-row ${node.isSelected ? "selected" : ""}`}
                          title={node.data.path}
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (node.data.type !== "file") return;
                            void onOpenExplorerFile(node.data.path);
                          }}
                        >
                          <button
                            type="button"
                            className="explorer-toggle"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!node.isInternal) return;
                              node.toggle();
                            }}
                          >
                            {node.isInternal ? (node.isOpen ? "▾" : "▸") : ""}
                          </button>
                          <span className={`explorer-node-icon ${node.isInternal ? "folder" : "file"}`} />
                          <span className="explorer-node-name">{node.data.name}</span>
                          {explorerIsGitRepo && node.data.type === "directory" && node.data.hasGitChanges && (
                            <span className="explorer-git-dot" aria-hidden="true" />
                          )}
                          {explorerIsGitRepo && node.data.type === "file" && node.data.gitStatus && (
                            <span className={`explorer-git-badge git-${String(node.data.gitStatus).toLowerCase()}`}>
                              {node.data.gitStatus}
                            </span>
                          )}
                        </div>
                      )}
                    </Tree>
                  )}
                </div>
              </div>
            ) : (
              <div className="explorer-empty">Select a project to view the file tree.</div>
            )}
          </aside>
        </div>

        {settingsOpen && (
          <div className="settings-modal-backdrop" data-testid="settings-wrap" onClick={() => setSettingsOpen(false)}>
            <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
              <div className="settings-modal-header">
                <div>
                  <div className="settings-modal-title">Settings</div>
                  <div className="settings-modal-subtitle">Configure environments and manage archives.</div>
                </div>
                <button className="settings-close" type="button" onClick={() => setSettingsOpen(false)}>×</button>
              </div>

              <div className="settings-modal-body">
                <div className="settings-side-nav">
                  <button
                    type="button"
                    className={settingsSection === "providers" ? "active" : ""}
                    onClick={() => setSettingsSection("providers")}
                  >
                    Providers
                  </button>
                  <button
                    type="button"
                    className={settingsSection === "archive" ? "active" : ""}
                    onClick={async () => {
                      setSettingsSection("archive");
                      await loadArchivedSessions();
                    }}
                  >
                    Archive
                  </button>
                  <button
                    type="button"
                    className={settingsSection === "appearance" ? "active" : ""}
                    onClick={() => setSettingsSection("appearance")}
                  >
                    Appearance
                  </button>
                </div>

                <div className="settings-panel">
                  {settingsSection === "providers" && (
                    <div className="settings-form">
                      <h3>Model Provider Settings</h3>
                      <div className="provider-tabs">
                        <button
                          type="button"
                          className={providerTab === "claude" ? "active" : ""}
                          onClick={() => setProviderTab("claude")}
                        >
                          Claude Code
                        </button>
                        <button
                          type="button"
                          className={providerTab === "codex" ? "active" : ""}
                          onClick={() => setProviderTab("codex")}
                        >
                          Codex CLI
                        </button>
                        <button
                          type="button"
                          className={providerTab === "gemini" ? "active" : ""}
                          onClick={() => setProviderTab("gemini")}
                        >
                          Gemini CLI
                        </button>
                      </div>

                      <>
                          <div className="provider-profiles">
                            <div className="provider-profiles-head">
                              <span>供应商配置组</span>
                              <button type="button" onClick={addProviderProfile}>+ 新增供应商</button>
                            </div>
                            <div className="provider-profiles-list">
                              {(currentProviderSettings.profiles || []).map((profile) => (
                                <button
                                  key={profile.id}
                                  type="button"
                                  className={`provider-profile-item ${profile.id === editingProfile?.id ? "active" : ""}`}
                                  onClick={() => setEditingProfileByProvider((prev) => ({ ...prev, [providerTab]: profile.id }))}
                                >
                                  <span className="provider-profile-name">{profile.name}</span>
                                  {currentProviderSettings.defaultProfileId === profile.id && (
                                    <span className="provider-default-tag">默认</span>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>

                          {editingProfile && (
                            <div className="provider-profile-editor">
                              <div className="provider-profile-controls">
                                <input
                                  type="text"
                                  value={editingProfile.name}
                                  onChange={(e) => renameProviderProfile(editingProfile.id, e.target.value)}
                                  placeholder="供应商名称"
                                />
                                <button
                                  type="button"
                                  onClick={() => setDefaultProviderProfile(editingProfile.id)}
                                  disabled={currentProviderSettings.defaultProfileId === editingProfile.id}
                                >
                                  设为默认
                                </button>
                                <button
                                  type="button"
                                  className="danger"
                                  onClick={() => removeProviderProfile(editingProfile.id)}
                                  disabled={(currentProviderSettings.profiles || []).length <= 1}
                                >
                                  删除供应商
                                </button>
                              </div>

                              <div className="env-list">
                                <div className="env-list-header">
                                  <span>环境变量（仅默认供应商在启动/恢复时注入）</span>
                                  <button type="button" onClick={addEnvVar}>+ 新增变量</button>
                                </div>

                                {(editingProfile.envVars || []).map((pair, index) => (
                                  <div className="env-row" key={`${editingProfile.id}-env-${index}`}>
                                    <input
                                      type="text"
                                      placeholder="NAME"
                                      value={pair.key}
                                      onChange={(e) => updateEnvVar(index, "key", e.target.value.toUpperCase())}
                                    />
                                    <input
                                      type="text"
                                      placeholder="VALUE"
                                      value={pair.value}
                                      onChange={(e) => updateEnvVar(index, "value", e.target.value)}
                                    />
                                    <button className="danger" onClick={() => removeEnvVar(index)}>删除</button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {settingsError && <span className="error">{settingsError}</span>}
                          {settingsSavedAt > 0 && <span className="success">已保存</span>}
                        </>
                    </div>
                  )}

                  {settingsSection === "archive" && (
                    <div className="settings-form">
                      <h3>Archived Sessions</h3>
                      {archivedSessions.length === 0 ? (
                        <div className="settings-coming-soon">暂无已归档会话。</div>
                      ) : (
                        <div className="archived-list">
                          {archivedSessions.map((item) => (
                            <div key={item.archiveId || `${item.provider}:${item.sessionId}`} className="archived-row">
                              <div className="archived-meta">
                                <div className="archived-name">{item.name} · {PROVIDER_LABEL[item.provider] || item.provider}</div>
                                <div className="archived-cwd">{item.cwd}</div>
                              </div>
                              <button type="button" onClick={() => onRestoreArchivedSession(item.archiveId || item.sessionId)}>
                                恢复
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {settingsSection === "appearance" && (
                    <div className="settings-form">
                      <h3>Appearance</h3>
                      <div className="settings-coming-soon">外观主题设置将在下一步接入。</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="settings-modal-footer">
                <button type="button" className="discard-btn" onClick={onDiscardSettings}>Discard</button>
                <button type="button" className="apply-btn" onClick={onSaveSettings}>Apply Changes</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
