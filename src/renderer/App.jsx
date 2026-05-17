import React, { useEffect, useMemo, useRef, useState } from "react";
import { fileBridge, logBridge, projectBridge, ptyBridge, sessionBridge, settingsBridge, skillgenBridge, windowBridge } from "../bridge";
import { TerminalPanel } from "../features/terminal/renderer/TerminalPanel";
import {
  ExplorerToggleIcon,
  SettingsIcon
} from "../ui/icon-registry";
import { SettingsModal } from "../features/providers/renderer/SettingsModal";
import { Button } from "../ui/button";
import { TopToolbar } from "../features/terminal/renderer/TopToolbar";
import { ExplorerPane } from "../features/file-tree/renderer/ExplorerPane";
import { WelcomeView } from "../pages/WelcomeView";
import { SidebarProjectsPanel } from "../features/sidebar/renderer/SidebarProjectsPanel";
import { RenameSessionDialog } from "../features/terminal/renderer/RenameSessionDialog";
import { SkillgenResultDialog } from "../features/terminal/renderer/SkillgenResultDialog";
import { useSessionStore } from "../features/workspace/renderer/session.store";
import packageJson from "../../package.json";
import appLogo from "./assets/brand/app-logo.png";
import {
  OAUTH_COMMAND_HINT,
  PROVIDER_IDS,
  PROXY_ENV_KEYS,
  INTERNAL_PROXY_URL_KEY,
  INTERNAL_PROXY_ENABLED_KEY,
  normalizeProviderId,
  getProviderPresetConfig,
  normalizeProviderSettings,
  getMissingRequiredKeys,
  resolveProviderModel,
  stripPresetFixedEnvVarsForPersist,
  normalizeProviderEntry,
  isOAuthProfile,
  isInternalEnvKey,
  isProxyEnvKey,
  parseBooleanText,
  oauthProviderHint,
  resolveOAuthDisplayUrl
} from "../features/providers/renderer/provider-config";

const DEFAULT_PROVIDER_SETTINGS = {
  defaultProfileId: "",
  enabledProfileId: "",
  profiles: []
};
const DEFAULT_SETTINGS = {
  providers: {
    claude: { ...DEFAULT_PROVIDER_SETTINGS },
    codex: { ...DEFAULT_PROVIDER_SETTINGS },
    gemini: { ...DEFAULT_PROVIDER_SETTINGS }
  }
};

function isProviderConfigured(settingsModel) {
  const providers = settingsModel?.providers;
  if (!providers) return false;
  return Object.values(providers).some(p => p?.enabledProfileId);
}

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
const RUNTIME_STATUS_LABEL = {
  starting: "启动中",
  streaming: "输出中",
  awaiting_input: "等待输入",
  awaiting_confirmation: "等待确认",
  error: "异常",
  exited: "已退出",
  creating: "启动中",
  running: "运行中"
};
const TRAFFIC_LIGHT_Y = 20;
const TRAFFIC_LIGHT_X_IN_SIDEBAR = 14;
const APP_VERSION = String(packageJson?.version || "0.1.0");

function App() {
  const isMacOS = typeof navigator !== "undefined"
    && /mac/i.test(String(navigator.platform || navigator.userAgent || ""));
  const isWindows = typeof navigator !== "undefined"
    && /win/i.test(String(navigator.platform || navigator.userAgent || ""));
  const [projects, setProjects] = useState([]);
  const [expandedProjects, setExpandedProjects] = useState({});
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [providerCheckPassed, setProviderCheckPassed] = useState(false);
  const [settingsSection, setSettingsSection] = useState("providers");
  const [providerTab, setProviderTab] = useState("claude");
  const [editingProfileByProvider, setEditingProfileByProvider] = useState({
    claude: "",
    codex: "",
    gemini: ""
  });

  const [settingsModel, setSettingsModel] = useState(DEFAULT_SETTINGS);
  const [settingsError, setSettingsError] = useState("");
  const [settingsSavedAt, setSettingsSavedAt] = useState(0);
  const [appError, setAppError] = useState("");
  const [explorerTree, setExplorerTree] = useState([]);
  const [explorerCwd, setExplorerCwd] = useState("");
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [archivedSessions, setArchivedSessions] = useState([]);
  const [explorerIsGitRepo, setExplorerIsGitRepo] = useState(false);
  const [explorerVisible, setExplorerVisible] = useState(false);
  const [explorerTreeHeight, setExplorerTreeHeight] = useState(300);
  const [openCreateMenuProjectId, setOpenCreateMenuProjectId] = useState(null);
  const [createMenuPlacementByProject, setCreateMenuPlacementByProject] = useState({});
  const [showAllSessionsByProject, setShowAllSessionsByProject] = useState({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [providerTestStateByKey, setProviderTestStateByKey] = useState({});
  const [oauthLinksByKey, setOauthLinksByKey] = useState({});
  const [oauthCodeByKey, setOauthCodeByKey] = useState({});
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameSessionId, setRenameSessionId] = useState("");
  const [renameDraft, setRenameDraft] = useState("");
  const [renameSubmitting, setRenameSubmitting] = useState(false);
  const [renameSuggestedTitle, setRenameSuggestedTitle] = useState("");
  const [renameSuggesting, setRenameSuggesting] = useState(false);
  const [renameSuggestSource, setRenameSuggestSource] = useState("");
  const [draggingSessionId, setDraggingSessionId] = useState("");
  const [dragOverSessionId, setDragOverSessionId] = useState("");
  const [skillgenModalOpen, setSkillgenModalOpen] = useState(false);
  const [skillgenRunning, setSkillgenRunning] = useState(false);
  const [skillgenResult, setSkillgenResult] = useState(null);
  const explorerTreeWrapRef = useRef(null);
  const renameInputRef = useRef(null);
  const oauthLinkPollTimerRef = useRef({});

  const sessions = useSessionStore((state) => state.sessions);
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const createSession = useSessionStore((state) => state.createSession);
  const loadSessionsByProjects = useSessionStore((state) => state.loadSessionsByProjects);
  const ensureSessionRunning = useSessionStore((state) => state.ensureSessionRunning);
  const renameSession = useSessionStore((state) => state.renameSession);
  const reorderSessions = useSessionStore((state) => state.reorderSessions);
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
  const activeSessionProviderMeta = useMemo(() => {
    if (!activeSession) return "";
    const providerId = normalizeProviderId(activeSession.provider);
    const providerLabel = PROVIDER_LABEL[providerId] || String(activeSession.provider || providerId);
    const providerSettings = settingsModel.providers?.[providerId] || DEFAULT_PROVIDER_SETTINGS;
    const activeProfileId = providerSettings.enabledProfileId || providerSettings.defaultProfileId;
    const activeProfile = (providerSettings.profiles || []).find((profile) => profile.id === activeProfileId)
      || providerSettings.profiles?.[0]
      || null;
    const model = resolveProviderModel(providerId, activeProfile?.envVars || []);
    return `${providerLabel} · ${model}`;
  }, [activeSession, settingsModel]);
  const activeWorkspaceCwd = activeSession?.cwd || activeProject?.path || "";
  const currentProviderSettings = settingsModel.providers?.[providerTab] || DEFAULT_PROVIDER_SETTINGS;
  const editingProfileId = editingProfileByProvider[providerTab]
    || currentProviderSettings.enabledProfileId
    || currentProviderSettings.defaultProfileId
    || "";
  const currentProviderPresetConfig = getProviderPresetConfig(providerTab) || { type: "keyList", keys: [] };
  const isFixedProfileProvider = currentProviderPresetConfig.type === "fixedProfiles";
  const currentProviderTestKey = `${providerTab}:${editingProfileId}`;
  const currentProviderTestState = providerTestStateByKey[currentProviderTestKey] || { status: "idle", message: "" };
  const currentOauthLinksState = oauthLinksByKey[currentProviderTestKey] || {
    sessionId: "",
    allUrls: [],
    authUrls: [],
    autoOpenedUrl: ""
  };
  const currentOauthDisplayUrl = resolveOAuthDisplayUrl(providerTab, currentOauthLinksState);
  const hasCurrentOauthDisplayUrl = !!String(currentOauthDisplayUrl || "").trim();
  const currentOauthCode = oauthCodeByKey[currentProviderTestKey] || "";
  const currentProxyTestKey = `${providerTab}:${editingProfileId}:proxy`;
  const currentProxyTestState = providerTestStateByKey[currentProxyTestKey] || { status: "idle", message: "" };
  const enabledProviderIds = useMemo(
    () => PROVIDER_IDS.filter((id) => {
      const providerSettings = settingsModel.providers?.[id];
      if (!providerSettings) return false;
      const enabledProfileId = providerSettings.enabledProfileId;
      if (!enabledProfileId) return false;
      return (providerSettings.profiles || []).some((profile) => profile.id === enabledProfileId);
    }),
    [settingsModel]
  );
  const enabledSessionToolOptions = useMemo(
    () => SESSION_TOOL_OPTIONS.filter((item) => enabledProviderIds.includes(item.id)),
    [enabledProviderIds]
  );
  const primarySessionTool = enabledSessionToolOptions[0] || null;

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
    const merged = { providers: normalizeProviderSettings(value?.providers || {}) };
    setSettingsModel(merged);
    setEditingProfileByProvider({
      claude: merged.providers.claude.enabledProfileId || merged.providers.claude.defaultProfileId || merged.providers.claude.profiles?.[0]?.id || "",
      codex: merged.providers.codex.enabledProfileId || merged.providers.codex.defaultProfileId || merged.providers.codex.profiles?.[0]?.id || "",
      gemini: merged.providers.gemini.enabledProfileId || merged.providers.gemini.defaultProfileId || merged.providers.gemini.profiles?.[0]?.id || ""
    });
    return merged;
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
      const result = await fileBridge.readTree({ cwd, depth: 6 });
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
    const providerSettings = settingsModel.providers?.[currentTool.id] || DEFAULT_PROVIDER_SETTINGS;
    const enabledProfileId = providerSettings.enabledProfileId;
    const enabledProfile = (providerSettings.profiles || []).find((profile) => profile.id === enabledProfileId);
    if (!enabledProfileId || !enabledProfile) {
      setAppError(`${currentTool.label} 未启用，请先在 Settings -> Providers 中测试连接并启用。`);
      setSettingsOpen(true);
      setSettingsSection("providers");
      setProviderTab(currentTool.id);
      return;
    }
    const sid = await createSession(project.id, project.path, currentTool.id);
    setActiveSession(sid);
  }

  async function handleSessionDrop(projectId, orderedProjectSessions, targetSessionId) {
    const sourceSessionId = draggingSessionId;
    setDragOverSessionId("");
    setDraggingSessionId("");
    if (!projectId || !sourceSessionId || !targetSessionId || sourceSessionId === targetSessionId) return;

    const fromIndex = orderedProjectSessions.findIndex((item) => item.sessionId === sourceSessionId);
    const toIndex = orderedProjectSessions.findIndex((item) => item.sessionId === targetSessionId);
    if (fromIndex < 0 || toIndex < 0) return;

    const nextOrder = [...orderedProjectSessions];
    const [moved] = nextOrder.splice(fromIndex, 1);
    nextOrder.splice(toIndex, 0, moved);
    await reorderSessions(
      projectId,
      nextOrder.map((item) => ({
        provider: item.provider || "claude",
        providerSessionId: item.providerSessionId || item.sessionId
      }))
    );
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
        if (!nextEnv[index]) return profile;
        if (key === "key" && nextEnv[index].keyEditable === false) return profile;
        if (key === "value" && nextEnv[index].editable === false) return profile;
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
    setProviderTestStateByKey((prev) => ({
      ...prev,
      [`${providerTab}:${editingProfileId}`]: { status: "idle", message: "配置已变更，请重新测试连接" }
    }));
  }

  function addEnvVar() {
    if (!editingProfileId) return;
    setSettingsError("");
    setSettingsSavedAt(0);
    setSettingsModel((prev) => {
      const currentProvider = prev.providers?.[providerTab] || DEFAULT_PROVIDER_SETTINGS;
      const nextProfiles = (currentProvider.profiles || []).map((profile) => {
        if (profile.id !== editingProfileId) return profile;
        return {
          ...profile,
          envVars: [
            ...(profile.envVars || []),
            { key: "", value: "", editable: true, required: false, keyEditable: true, removable: true }
          ]
        };
      });
      return {
        ...prev,
        providers: {
          ...(prev.providers || {}),
          [providerTab]: {
            ...currentProvider,
            profiles: nextProfiles
          }
        }
      };
    });
    setProviderTestStateByKey((prev) => ({
      ...prev,
      [`${providerTab}:${editingProfileId}`]: { status: "idle", message: "配置已变更，请重新测试连接" }
    }));
  }

  function removeEnvVar(index) {
    if (!editingProfileId) return;
    setSettingsError("");
    setSettingsSavedAt(0);
    setSettingsModel((prev) => {
      const currentProvider = prev.providers?.[providerTab] || DEFAULT_PROVIDER_SETTINGS;
      const nextProfiles = (currentProvider.profiles || []).map((profile) => {
        if (profile.id !== editingProfileId) return profile;
        const nextEnv = [...(profile.envVars || [])];
        if (!nextEnv[index] || nextEnv[index].removable === false) return profile;
        nextEnv.splice(index, 1);
        return { ...profile, envVars: nextEnv };
      });
      return {
        ...prev,
        providers: {
          ...(prev.providers || {}),
          [providerTab]: {
            ...currentProvider,
            profiles: nextProfiles
          }
        }
      };
    });
    setProviderTestStateByKey((prev) => ({
      ...prev,
      [`${providerTab}:${editingProfileId}`]: { status: "idle", message: "配置已变更，请重新测试连接" }
    }));
  }

  function addProxyEnvVar(proxyKey) {
    if (!editingProfileId) return;
    const key = String(proxyKey || "").trim().toUpperCase();
    if (!PROXY_ENV_KEYS.includes(key)) return;
    setSettingsError("");
    setSettingsSavedAt(0);
    setSettingsModel((prev) => {
      const currentProvider = prev.providers?.[providerTab] || DEFAULT_PROVIDER_SETTINGS;
      const nextProfiles = (currentProvider.profiles || []).map((profile) => {
        if (profile.id !== editingProfileId) return profile;
        const exists = (profile.envVars || []).some((pair) => String(pair?.key || "").trim().toUpperCase() === key);
        if (exists) return profile;
        return {
          ...profile,
          envVars: [
            ...(profile.envVars || []),
            { key, value: "", editable: true, required: false, keyEditable: false, removable: true }
          ]
        };
      });
      return {
        ...prev,
        providers: {
          ...(prev.providers || {}),
          [providerTab]: {
            ...currentProvider,
            profiles: nextProfiles
          }
        }
      };
    });
    setProviderTestStateByKey((prev) => ({
      ...prev,
      [`${providerTab}:${editingProfileId}`]: { status: "idle", message: "配置已变更，请重新测试连接" }
    }));
  }

  function setProxyConfig({ enabled, url }) {
    if (!editingProfileId) return;
    const normalizedUrl = String(url || "").trim();
    const normalizedEnabled = !!enabled;
    setSettingsError("");
    setSettingsSavedAt(0);
    setSettingsModel((prev) => {
      const currentProvider = prev.providers?.[providerTab] || DEFAULT_PROVIDER_SETTINGS;
      const nextProfiles = (currentProvider.profiles || []).map((profile) => {
        if (profile.id !== editingProfileId) return profile;
        const nextEnv = [...(profile.envVars || [])].filter((pair) => {
          const key = String(pair?.key || "").trim().toUpperCase();
          return key !== "HTTP_PROXY" && key !== "HTTPS_PROXY";
        });
        const upsert = (key, value) => {
          const targetKey = String(key || "").trim();
          const index = nextEnv.findIndex((pair) => String(pair?.key || "").trim().toUpperCase() === targetKey);
          const payload = {
            key: targetKey,
            value: String(value || ""),
            editable: true,
            required: false,
            keyEditable: false,
            removable: false
          };
          if (index >= 0) {
            nextEnv[index] = { ...nextEnv[index], ...payload };
          } else {
            nextEnv.push(payload);
          }
        };
        upsert(INTERNAL_PROXY_ENABLED_KEY, normalizedEnabled ? "true" : "false");
        upsert(INTERNAL_PROXY_URL_KEY, normalizedUrl);
        return { ...profile, envVars: nextEnv };
      });
      return {
        ...prev,
        providers: {
          ...(prev.providers || {}),
          [providerTab]: {
            ...currentProvider,
            profiles: nextProfiles
          }
        }
      };
    });
    setProviderTestStateByKey((prev) => ({
      ...prev,
      [`${providerTab}:${editingProfileId}`]: { status: "idle", message: "配置已变更，请重新测试连接" }
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
            {
              id,
              name: `Provider ${(prev.providers?.[providerTab]?.profiles || []).length + 1}`,
              envVars: presetEnvVars(providerTab, [], id)
            }
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
    setProviderTestStateByKey((prev) => ({
      ...prev,
      [`${providerTab}:${profileId}`]: { status: "idle", message: "配置已变更，请重新测试连接" }
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
      const enabledProfileId = currentProvider.enabledProfileId === profileId ? defaultProfileId : currentProvider.enabledProfileId;
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
            enabledProfileId,
            profiles: next
          }
        }
      };
    });
  }

  function stopOAuthLinkPolling(stateKey) {
    const timer = oauthLinkPollTimerRef.current[stateKey];
    if (timer) {
      window.clearInterval(timer);
      delete oauthLinkPollTimerRef.current[stateKey];
    }
  }

  async function refreshOAuthLinks(providerId, profileId, sessionId) {
    const result = await settingsBridge.getProviderOAuthLinks({
      provider: providerId,
      profileId,
      sessionId: sessionId || undefined
    });
    const stateKey = `${providerId}:${profileId}`;
    setOauthLinksByKey((prev) => ({
      ...prev,
      [stateKey]: {
        sessionId: result.sessionId || "",
        allUrls: Array.isArray(result.allUrls) ? result.allUrls : [],
        authUrls: Array.isArray(result.authUrls) ? result.authUrls : [],
        autoOpenedUrl: result.autoOpenedUrl || ""
      }
    }));
    return result;
  }

  function startOAuthLinkPolling(providerId, profileId, sessionId) {
    const stateKey = `${providerId}:${profileId}`;
    stopOAuthLinkPolling(stateKey);
    let tick = 0;
    const run = async () => {
      tick += 1;
      try {
        const result = await refreshOAuthLinks(providerId, profileId, sessionId);
        const displayUrl = resolveOAuthDisplayUrl(providerId, result);
        if (displayUrl || tick >= 90) {
          stopOAuthLinkPolling(stateKey);
        }
      } catch {
      }
    };
    void run();
    oauthLinkPollTimerRef.current[stateKey] = window.setInterval(run, 1000);
  }

  function openOAuthLink(url) {
    const target = String(url || "").trim();
    if (!target) return;
    window.open(target, "_blank", "noopener,noreferrer");
  }

  function resolveOAuthSessionId(providerId, profileId) {
    const stateKey = `${providerId}:${profileId}`;
    const stored = oauthLinksByKey[stateKey]?.sessionId;
    if (stored) return stored;
    const candidate = sessions
      .filter((session) => normalizeProviderId(session.provider) === normalizeProviderId(providerId))
      .filter((session) => /oauth login/i.test(String(session.name || "")))
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))[0];
    return candidate?.sessionId || "";
  }

  async function submitOAuthCode(providerId, profileId, code) {
    const sessionId = resolveOAuthSessionId(providerId, profileId);
    const normalized = String(code || "").trim();
    if (!sessionId) {
      setProviderTestStateByKey((prev) => ({
        ...prev,
        [`${providerId}:${profileId}`]: { status: "failed", message: "未找到 OAuth 登录终端会话，请先点击获取OAuth登陆链接" }
      }));
      return;
    }
    if (!normalized) {
      setProviderTestStateByKey((prev) => ({
        ...prev,
        [`${providerId}:${profileId}`]: { status: "failed", message: "验证码为空，请先复制验证码" }
      }));
      return;
    }
    ptyBridge.input(sessionId, `${normalized}\r`);
    const stateKey = `${providerId}:${profileId}`;
    if (normalizeProviderId(providerId) === "gemini") {
      setProviderTestStateByKey((prev) => ({
        ...prev,
        [stateKey]: { status: "testing", message: "验证码已回填，正在进行 Gemini OAuth 真实探测..." }
      }));
      try {
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
        const profileFromModel = (settingsModel.providers?.[providerId]?.profiles || []).find((item) => item.id === profileId);
        const envVars = profileFromModel?.envVars || editingProfile?.envVars || [];
        const result = await settingsBridge.probeProviderOAuth({
          provider: providerId,
          profileId,
          envVars
        });
        setProviderTestStateByKey((prev) => ({
          ...prev,
          [stateKey]: {
            status: result.ok ? "success" : "failed",
            message: result.message || (result.ok ? "Gemini OAuth 探测成功，可继续启用" : "Gemini OAuth 探测失败，请重试")
          }
        }));
      } catch (e) {
        setProviderTestStateByKey((prev) => ({
          ...prev,
          [stateKey]: {
            status: "failed",
            message: e?.message || "Gemini OAuth 探测失败，请重试"
          }
        }));
      }
      return;
    }
    setProviderTestStateByKey((prev) => ({
      ...prev,
      [stateKey]: { status: "success", message: "验证码已回填到终端，请等待登录结果" }
    }));
  }

  async function copyOAuthLink(url) {
    const target = String(url || "").trim();
    if (!target) return;
    try {
      await navigator.clipboard.writeText(target);
      setProviderTestStateByKey((prev) => ({
        ...prev,
        [currentProviderTestKey]: { status: "success", message: "已复制登录链接到剪贴板" }
      }));
    } catch {
      setProviderTestStateByKey((prev) => ({
        ...prev,
        [currentProviderTestKey]: { status: "failed", message: "复制链接失败，请手动复制" }
      }));
    }
  }

  async function pasteOAuthCodeFromClipboard(providerId, profileId) {
    try {
      const text = String(await navigator.clipboard.readText()).trim();
      if (!text) {
        setProviderTestStateByKey((prev) => ({
          ...prev,
          [`${providerId}:${profileId}`]: { status: "failed", message: "剪贴板里没有验证码" }
        }));
        return;
      }
      setOauthCodeByKey((prev) => ({ ...prev, [`${providerId}:${profileId}`]: text }));
      void submitOAuthCode(providerId, profileId, text);
    } catch {
      setProviderTestStateByKey((prev) => ({
        ...prev,
        [`${providerId}:${profileId}`]: { status: "failed", message: "读取剪贴板失败，请手动粘贴验证码" }
      }));
    }
  }

  async function onStartOAuthLogin(profileId) {
    if (!editingProfile || !profileId) return;
    const stateKey = `${providerTab}:${profileId}`;
    setProviderTestStateByKey((prev) => ({
      ...prev,
      [stateKey]: { status: "testing", message: "正在打开终端并启动 OAuth 登录..." }
    }));
    try {
      const result = await settingsBridge.startProviderOAuthLogin({
        provider: providerTab,
        profileId,
        projectId: activeProjectId || undefined,
        cwd: activeWorkspaceCwd || activeProject?.path || undefined
      });
      setProviderTestStateByKey((prev) => ({
        ...prev,
        [stateKey]: {
          status: result.ok ? "success" : "failed",
          message: result.message || (result.ok ? "OAuth 登录会话已启动" : "OAuth 登录启动失败")
        }
      }));
      if (!result.ok) return;
      await refreshSessions();
      if (result.session?.sessionId) setActiveSession(result.session.sessionId);
      if (result.session?.projectId) setActiveProjectId(result.session.projectId);
      if (result.session?.sessionId) {
        startOAuthLinkPolling(providerTab, profileId, result.session.sessionId);
      }
    } catch (e) {
      setProviderTestStateByKey((prev) => ({
        ...prev,
        [stateKey]: {
          status: "failed",
          message: e?.message || "OAuth 登录启动失败"
        }
      }));
    }
  }

  async function onToggleProviderProfile(profileId, nextEnabled) {
    if (!editingProfile || !profileId) return;
    const stateKey = `${providerTab}:${profileId}`;
    if (!nextEnabled) {
      setProviderTestStateByKey((prev) => ({
        ...prev,
        [stateKey]: { status: "failed", message: "必须保留一个启用供应商，请先切换并启用其他供应商" }
      }));
      return;
    }

    if (isOAuthProfile(editingProfile)) {
      setProviderTestStateByKey((prev) => ({
        ...prev,
        [stateKey]: { status: "testing", message: "正在进行 OAuth 真实探测..." }
      }));
      try {
        const result = await settingsBridge.probeProviderOAuth({
          provider: providerTab,
          profileId,
          envVars: editingProfile.envVars || []
        });
        setProviderTestStateByKey((prev) => ({
          ...prev,
          [stateKey]: {
            status: result.ok ? "success" : "failed",
            message: result.message || (result.ok ? "OAuth 探测成功，已启用" : "OAuth 探测失败，保持关闭")
          }
        }));
        if (!result.ok) return;
        setSettingsError("");
        setSettingsSavedAt(0);
        setSettingsModel((prev) => ({
          ...prev,
          providers: {
            ...(prev.providers || {}),
            [providerTab]: {
              ...(prev.providers?.[providerTab] || DEFAULT_PROVIDER_SETTINGS),
              enabledProfileId: profileId,
              defaultProfileId: profileId
            }
          }
        }));
      } catch (e) {
        setProviderTestStateByKey((prev) => ({
          ...prev,
          [stateKey]: {
            status: "failed",
            message: e?.message || "OAuth 探测失败，保持关闭"
          }
        }));
      }
      return;
    }

    const missingKeys = getMissingRequiredKeys(editingProfile);
    if (missingKeys.length > 0) {
      setProviderTestStateByKey((prev) => ({
        ...prev,
        [stateKey]: {
          status: "failed",
          message: `请先填写：${missingKeys.join(", ")}`
        }
      }));
      return;
    }
    setProviderTestStateByKey((prev) => ({
      ...prev,
      [stateKey]: { status: "testing", message: "启用校验中..." }
    }));
    try {
      const result = await settingsBridge.testProvider({
        provider: providerTab,
        profileId,
        envVars: editingProfile.envVars || []
      });
      setProviderTestStateByKey((prev) => ({
        ...prev,
        [stateKey]: {
          status: result.ok ? "success" : "failed",
          message: result.message || (result.ok ? "连接成功，已启用" : "连接失败，保持关闭")
        }
      }));
      if (result.ok) {
        setSettingsError("");
        setSettingsSavedAt(0);
        setSettingsModel((prev) => ({
          ...prev,
          providers: {
            ...(prev.providers || {}),
            [providerTab]: {
              ...(prev.providers?.[providerTab] || DEFAULT_PROVIDER_SETTINGS),
              enabledProfileId: profileId,
              defaultProfileId: profileId
            }
          }
        }));
      }
    } catch (e) {
      setProviderTestStateByKey((prev) => ({
        ...prev,
        [stateKey]: {
          status: "failed",
          message: e?.message || "连接测试失败，保持关闭"
        }
      }));
    }
  }

  async function onToggleProxyEnabled(nextEnabled) {
    if (!editingProfile || !editingProfileId) return;
    const stateKey = `${providerTab}:${editingProfileId}:proxy`;
    if (!nextEnabled) {
      setProxyConfig({ enabled: false, url: proxyState.url });
      setProviderTestStateByKey((prev) => ({
        ...prev,
        [stateKey]: { status: "idle", message: "代理已关闭" }
      }));
      return;
    }

    const proxyUrl = String(proxyState.url || "").trim();
    if (!proxyUrl) {
      setProviderTestStateByKey((prev) => ({
        ...prev,
        [stateKey]: { status: "failed", message: "请先填写代理地址" }
      }));
      return;
    }

    setProviderTestStateByKey((prev) => ({
      ...prev,
      [stateKey]: { status: "testing", message: "代理探测中（x.com / google.com / github.com）..." }
    }));

    try {
      const result = await settingsBridge.testProviderProxy({
        provider: providerTab,
        profileId: editingProfile.id,
        envVars: editingProfile.envVars || [],
        proxyUrl
      });
      if (!result.ok) {
        setProviderTestStateByKey((prev) => ({
          ...prev,
          [stateKey]: { status: "failed", message: result.message || "代理测试失败，保持关闭" }
        }));
        return;
      }
      setProxyConfig({ enabled: true, url: proxyUrl });
      setProviderTestStateByKey((prev) => ({
        ...prev,
        [stateKey]: { status: "success", message: result.message || "代理测试成功，已启用" }
      }));
    } catch (e) {
      setProviderTestStateByKey((prev) => ({
        ...prev,
        [stateKey]: { status: "failed", message: e?.message || "代理测试失败，保持关闭" }
      }));
    }
  }

  async function onSaveSettings() {
    const providerKeys = PROVIDER_IDS;
    const providersPayload = {};
    for (const providerKey of providerKeys) {
      const source = settingsModel.providers?.[providerKey] || DEFAULT_PROVIDER_SETTINGS;
      const normalizedSource = normalizeProviderEntry(providerKey, source);
      const profiles = (normalizedSource.profiles || []).map((profile, idx) => ({
        id: String(profile.id || `provider-${idx + 1}`),
        name: String(profile.name || `Provider ${idx + 1}`).trim() || `Provider ${idx + 1}`,
        envVars: stripPresetFixedEnvVarsForPersist(providerKey, String(profile.id || ""), profile.envVars || [])
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

      const defaultProfileId = profiles.some((p) => p.id === normalizedSource.defaultProfileId)
        ? normalizedSource.defaultProfileId
        : (profiles.length > 0 ? profiles[0].id : "");
      let enabledProfileId = normalizedSource.enabledProfileId === "" ? "" : defaultProfileId;
      if (enabledProfileId !== "" && profiles.some((p) => p.id === normalizedSource.enabledProfileId)) {
        enabledProfileId = normalizedSource.enabledProfileId;
      }
      if (enabledProfileId !== "" && !profiles.some((p) => p.id === enabledProfileId)) {
        enabledProfileId = "";
      }
      providersPayload[providerKey] = { defaultProfileId, enabledProfileId, profiles };
    }

    try {
      const saved = await settingsBridge.saveClaude({ providers: providersPayload });
      const normalizedProviders = normalizeProviderSettings(saved?.providers || providersPayload);
      setSettingsModel({ providers: normalizedProviders });
      setEditingProfileByProvider({
        claude: normalizedProviders.claude.enabledProfileId || normalizedProviders.claude.defaultProfileId || normalizedProviders.claude.profiles?.[0]?.id || "",
        codex: normalizedProviders.codex.enabledProfileId || normalizedProviders.codex.defaultProfileId || normalizedProviders.codex.profiles?.[0]?.id || "",
        gemini: normalizedProviders.gemini.enabledProfileId || normalizedProviders.gemini.defaultProfileId || normalizedProviders.gemini.profiles?.[0]?.id || ""
      });
      setSettingsSavedAt(Date.now());
      setSettingsError("");
      if (!providerCheckPassed && isProviderConfigured({ providers: normalizedProviders })) {
        setProviderCheckPassed(true);
        setSettingsOpen(false);
      }
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
  const isEditingOAuthProfile = useMemo(
    () => isOAuthProfile(editingProfile),
    [editingProfile]
  );
  const visibleEnvVars = useMemo(
    () => (editingProfile?.envVars || [])
      .map((pair, index) => ({ pair, index }))
      .filter((item) => !isInternalEnvKey(item.pair?.key)),
    [editingProfile]
  );
  const regularEnvVars = useMemo(
    () => visibleEnvVars.filter((item) => !isProxyEnvKey(item.pair?.key)),
    [visibleEnvVars]
  );
  const proxyState = useMemo(() => {
    const envVars = editingProfile?.envVars || [];
    const getValue = (targetKey) => {
      const pair = envVars.find((item) => String(item?.key || "").trim().toUpperCase() === targetKey);
      return String(pair?.value || "").trim();
    };
    const proxyUrl = getValue(INTERNAL_PROXY_URL_KEY)
      || getValue("HTTPS_PROXY")
      || getValue("HTTP_PROXY")
      || "";
    const enabledRaw = getValue(INTERNAL_PROXY_ENABLED_KEY);
    const enabled = enabledRaw ? parseBooleanText(enabledRaw) : !!proxyUrl;
    return { enabled, url: proxyUrl };
  }, [editingProfile]);
  const onSelectEditingProfile = (nextProfileId) => {
    setEditingProfileByProvider((prev) => ({ ...prev, [providerTab]: nextProfileId }));
    setSettingsError("");
  };
  const onSelectProfileItem = (profileId) => {
    setEditingProfileByProvider((prev) => ({ ...prev, [providerTab]: profileId }));
  };
  const onOauthCodeChange = (value) => {
    setOauthCodeByKey((prev) => ({
      ...prev,
      [currentProviderTestKey]: value
    }));
  };

  useEffect(() => {
    (async () => {
      try {
        const list = await loadProjects();
        const [settings] = await Promise.all([
          loadSettings(),
          loadSessionsByProjects(list.map((p) => p.id))
        ]);
        if (!isProviderConfigured(settings)) {
          setProviderCheckPassed(false);
          setSettingsOpen(true);
        } else {
          setProviderCheckPassed(true);
        }
      } catch {
        setProviderCheckPassed(false);
        setSettingsOpen(true);
      }
    })();
  }, []);

  useEffect(() => () => {
    for (const key of Object.keys(oauthLinkPollTimerRef.current)) {
      window.clearInterval(oauthLinkPollTimerRef.current[key]);
    }
    oauthLinkPollTimerRef.current = {};
  }, []);

  useEffect(() => {
    if (!editingProfileId) return;
    const key = `${providerTab}:${editingProfileId}`;
    setOauthCodeByKey((prev) => (prev[key] !== undefined ? prev : { ...prev, [key]: "" }));
  }, [providerTab, editingProfileId]);

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

  function openRenameModal(sessionId) {
    const target = sessions.find((item) => item.sessionId === sessionId);
    if (!target) return;
    setAppError("");
    setRenameSessionId(target.sessionId);
    setRenameDraft(target.name || "");
    setRenameSubmitting(false);
    setRenameSuggestedTitle("");
    setRenameSuggesting(true);
    setRenameSuggestSource("");
    setRenameModalOpen(true);
    void sessionBridge.suggestTitle({
      sessionId: target.sessionId,
      provider: target.provider,
      providerSessionId: target.providerSessionId
    }).then((result) => {
      if (!result?.ok) return;
      setRenameSuggestedTitle(result.title || "");
      setRenameSuggestSource(result.source || "");
    }).catch(() => {
      setRenameSuggestSource("fallback");
    }).finally(() => {
      setRenameSuggesting(false);
    });
  }

  function closeRenameModal(forceClose = false) {
    if (renameSubmitting && !forceClose) return;
    setRenameModalOpen(false);
    setRenameSessionId("");
    setRenameDraft("");
    setRenameSubmitting(false);
    setRenameSuggestedTitle("");
    setRenameSuggesting(false);
    setRenameSuggestSource("");
  }

  async function submitRenameModal() {
    if (!renameModalOpen || !renameSessionId || renameSubmitting) return;
    const targetSession = sessions.find((item) => item.sessionId === renameSessionId);
    const originalTitle = targetSession?.name || "";
    const nextTitle = String(renameDraft || "").trim();
    if (!nextTitle) {
      setAppError("会话标题不能为空");
      return;
    }

    try {
      setRenameSubmitting(true);
      if (nextTitle !== originalTitle) {
        await renameSession(renameSessionId, nextTitle);
      }
      closeRenameModal(true);
    } catch (e) {
      setAppError(`重命名会话失败：${e?.message || "未知错误"}`);
      setRenameSubmitting(false);
    }
  }

  async function onRunSkillgen() {
    if (!activeProject?.id) {
      setAppError("请先选择一个项目后再生成 Skill");
      return;
    }
    setAppError("");
    setSkillgenModalOpen(true);
    setSkillgenRunning(true);
    setSkillgenResult(null);
    try {
      const result = await skillgenBridge.run({
        projectId: activeProject.id,
        trigger: "manual",
        rebuild: false,
        focusSessionId: activeSessionId || ""
      });
      setSkillgenResult(result);
    } catch (e) {
      const rawMessage = e?.message || "Skill 生成失败";
      const noHandler = /No handler registered for 'skillgen:run'/i.test(rawMessage);
      setSkillgenResult({
        ok: false,
        error: noHandler
          ? "主进程尚未加载 SKILLGEN_RUN 处理器。请重启应用（开发模式请重启 `pnpm run dev`）后重试。"
          : rawMessage
      });
    } finally {
      setSkillgenRunning(false);
    }
  }

  useEffect(() => {
    if (!renameModalOpen) return;
    const input = renameInputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [renameModalOpen]);

  useEffect(() => {
    if (!renameModalOpen || !renameSessionId) return;
    const exists = sessions.some((item) => item.sessionId === renameSessionId);
    if (!exists) {
      closeRenameModal();
    }
  }, [renameModalOpen, renameSessionId, sessions]);

  useEffect(() => {
    const profiles = currentProviderSettings.profiles || [];
    if (profiles.length === 0) return;
    if (!profiles.some((p) => p.id === editingProfileId)) {
      setEditingProfileByProvider((prev) => ({
        ...prev,
        [providerTab]: currentProviderSettings.enabledProfileId || currentProviderSettings.defaultProfileId || profiles[0].id
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

  useEffect(() => {
    if (!isMacOS) return;
    const x = TRAFFIC_LIGHT_X_IN_SIDEBAR;
    void windowBridge.setTrafficLightPosition({ x, y: TRAFFIC_LIGHT_Y }).catch(() => {});
  }, [isMacOS, sidebarCollapsed]);

  const hasProjects = projects.length > 0;

  return (
    <div className={`layout ${isMacOS ? "macos" : ""} ${isWindows ? "windows" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="brand">
            <div className="brand-title-wrap">
              <span className="brand-title">Cli-Switch</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="sidebar-trigger"
              aria-label="收缩会话栏"
              title="收缩会话栏"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
            >
              <ExplorerToggleIcon size={14} />
            </Button>
          </div>
        </div>

        <SidebarProjectsPanel
          projects={projects}
          sessions={sessions}
          expandedProjects={expandedProjects}
          activeProjectId={activeProjectId}
          enabledProviderIds={enabledProviderIds}
          activeSessionId={activeSessionId}
          showAllSessionsByProject={showAllSessionsByProject}
          openCreateMenuProjectId={openCreateMenuProjectId}
          createMenuPlacementByProject={createMenuPlacementByProject}
          primarySessionTool={primarySessionTool}
          enabledSessionToolOptions={enabledSessionToolOptions}
          draggingSessionId={draggingSessionId}
          dragOverSessionId={dragOverSessionId}
          providerLabel={PROVIDER_LABEL}
          runtimeStatusLabel={RUNTIME_STATUS_LABEL}
          onAddProject={onAddProject}
          setActiveProjectId={setActiveProjectId}
          setExpandedProjects={setExpandedProjects}
          setSettingsOpen={setSettingsOpen}
          setOpenCreateMenuProjectId={setOpenCreateMenuProjectId}
          setCreateMenuPlacementByProject={setCreateMenuPlacementByProject}
          createSessionForProject={createSessionForProject}
          onSyncProjectHistory={onSyncProjectHistory}
          setDraggingSessionId={setDraggingSessionId}
          setDragOverSessionId={setDragOverSessionId}
          handleSessionDrop={handleSessionDrop}
          setActiveSession={setActiveSession}
          openRenameModal={openRenameModal}
          destroySession={destroySession}
          setShowAllSessionsByProject={setShowAllSessionsByProject}
        />

        <div className="sidebar-settings">
          <Button
            type="button"
            variant="ghost"
            className={`sidebar-settings-btn ${settingsOpen ? "active" : ""}`}
            onClick={async () => {
              if (!providerCheckPassed) return;
              await loadSettings();
              setSettingsOpen(true);
            }}
          >
            <SettingsIcon className="settings-link-icon" />
            <span>Settings</span>
          </Button>
        </div>
      </aside>

      <main className="main">
        <TopToolbar
          sidebarCollapsed={sidebarCollapsed}
          activeSession={activeSession}
          activeSessionProviderMeta={activeSessionProviderMeta}
          runtimeStatusLabel={RUNTIME_STATUS_LABEL}
          onExpandSidebar={() => setSidebarCollapsed(false)}
          onRenameActiveSession={() => {
            if (!activeSession?.sessionId) return;
            openRenameModal(activeSession.sessionId);
          }}
          skillgenRunning={skillgenRunning}
          onRunSkillgen={() => void onRunSkillgen()}
          canRunSkillgen={Boolean(activeProject?.id)}
          onArchiveActiveSession={() => activeSessionId && destroySession(activeSessionId)}
          canArchiveActiveSession={Boolean(activeSessionId)}
          explorerVisible={explorerVisible}
          onToggleExplorer={() => setExplorerVisible((prev) => !prev)}
          isWindows={isWindows}
          onWindowMinimize={() => {
            void windowBridge.minimize().catch(() => {});
          }}
          onWindowToggleMaximize={() => {
            void windowBridge.toggleMaximize().catch(() => {});
          }}
          onWindowClose={() => {
            void windowBridge.close().catch(() => {});
          }}
        />

        {appError && <div className="banner-error">{appError}</div>}

        <div className={`main-content ${explorerVisible ? "" : "explorer-hidden"}`}>
          <section className="main-panel">
            {!hasProjects ? (
              <WelcomeView
                onCreateProject={() => void onAddProject()}
                onImportProject={() => void onAddProject()}
                onLearnMore={() => windowBridge.openExternal("https://github.com/baiyea/cli-switch")}
              />
            ) : activeProject ? (
              <TerminalPanel projectId={activeProject.id} cwd={activeProject.path} />
            ) : (
              <div className="settings-wrap" style={{ display: "block" }}>
                Select a project from the sidebar to begin your architectural session.
              </div>
            )}
          </section>

          <ExplorerPane
            explorerVisible={explorerVisible}
            activeProject={activeProject}
            activeWorkspaceCwd={activeWorkspaceCwd}
            explorerCwd={explorerCwd}
            explorerTreeWrapRef={explorerTreeWrapRef}
            explorerLoading={explorerLoading}
            explorerTree={explorerTree}
            explorerTreeHeight={explorerTreeHeight}
            explorerIsGitRepo={explorerIsGitRepo}
            onOpenWorkspaceInFileManager={onOpenWorkspaceInFileManager}
            onOpenExplorerFile={onOpenExplorerFile}
          />
        </div>

        <SettingsModal
          forceLock={!providerCheckPassed}
          settingsOpen={settingsOpen}
          onClose={() => {
            if (!providerCheckPassed) return;
            setSettingsOpen(false);
          }}
          settingsSection={settingsSection}
          onSelectProviders={() => setSettingsSection("providers")}
          onSelectArchive={async () => {
            setSettingsSection("archive");
            await loadArchivedSessions();
          }}
          onSelectAbout={() => setSettingsSection("about")}
          providerSectionProps={{
            providerTab,
            setProviderTab,
            currentProviderSettings,
            isFixedProfileProvider,
            addProviderProfile,
            editingProfile,
            onSelectEditingProfile,
            onSelectProfileItem,
            renameProviderProfile,
            setDefaultProviderProfile,
            removeProviderProfile,
            currentProviderTestState,
            isEditingOAuthProfile,
            oauthProviderHint,
            oauthCommandHint: OAUTH_COMMAND_HINT,
            onStartOAuthLogin,
            hasCurrentOauthDisplayUrl,
            currentOauthDisplayUrl,
            openOAuthLink,
            currentOauthCode,
            onOauthCodeChange,
            submitOAuthCode,
            regularEnvVars,
            updateEnvVar,
            removeEnvVar,
            addEnvVar,
            onToggleProviderProfile,
            currentProxyTestState,
            proxyState,
            setProxyConfig,
            onToggleProxyEnabled,
            settingsSavedAt,
            onSaveSettings,
            settingsError
          }}
          archivedSessions={archivedSessions}
          providerLabel={PROVIDER_LABEL}
          onRestoreArchivedSession={onRestoreArchivedSession}
          appVersion={APP_VERSION}
          appLogo={appLogo}
        />
        <RenameSessionDialog
          open={renameModalOpen}
          onClose={closeRenameModal}
          submitting={renameSubmitting}
          inputRef={renameInputRef}
          draft={renameDraft}
          onDraftChange={setRenameDraft}
          onSubmit={() => void submitRenameModal()}
          suggesting={renameSuggesting}
          suggestedTitle={renameSuggestedTitle}
          suggestSource={renameSuggestSource}
          onUseSuggestedTitle={setRenameDraft}
        />
        <SkillgenResultDialog
          open={skillgenModalOpen}
          running={skillgenRunning}
          result={skillgenResult}
          onClose={() => setSkillgenModalOpen(false)}
        />
      </main>
    </div>
  );
}

export default App;
