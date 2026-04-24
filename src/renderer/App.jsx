import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Tree } from "react-arborist";
import { SuspendedFileIcon, SuspendedFolderIcon, SuspendedOpenFolderIcon } from "react-files-icons/suspended";
import { fileBridge, logBridge, projectBridge, sessionBridge, settingsBridge, skillgenBridge } from "../bridge";
import { TerminalPanel } from "../features/terminal/components/TerminalPanel";
import { ArchiveIcon, ExplorerToggleIcon, ProviderIcon, SettingsIcon, SkillExtractIcon } from "./icons/icon-registry";
import { useSessionStore } from "../store/session.store";
import appLogo from "./assets/brand/app-logo.png";
import providerEnvPresets from "./assets/provider-env-presets.json";

const DEFAULT_PROVIDER_SETTINGS = {
  defaultProfileId: "default",
  enabledProfileId: "default",
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
const PROVIDER_IDS = ["claude", "codex", "gemini"];

function normalizeProviderId(provider) {
  const value = String(provider || "").toLowerCase();
  if (value === "claude" || value === "codex" || value === "gemini") return value;
  return "claude";
}

function getProviderPresetConfig(providerId) {
  const raw = providerEnvPresets?.[providerId];
  if (providerId === "claude" && raw && Array.isArray(raw.profiles)) {
    return {
      type: "fixedProfiles",
      profiles: raw.profiles.map((profile) => ({
        id: String(profile?.id || ""),
        name: String(profile?.name || ""),
        envVars: Array.isArray(profile?.envVars)
          ? profile.envVars.map((item) => ({
            key: String(item?.key || "").trim(),
            value: item?.value === null ? null : String(item?.value || "")
          }))
          : []
      }))
    };
  }
  return {
    type: "keyList",
    keys: Array.isArray(raw) ? raw.map((key) => String(key || "").trim()).filter(Boolean) : []
  };
}

const PROVIDER_PRESET_CONFIG = {
  claude: getProviderPresetConfig("claude"),
  codex: getProviderPresetConfig("codex"),
  gemini: getProviderPresetConfig("gemini")
};

function mergeEnvVarsWithPreset(presetVars = [], envVars = []) {
  const presetMap = new Map();
  for (const preset of (presetVars || [])) {
    const key = String(preset?.key || "").trim();
    if (!key) continue;
    presetMap.set(key, preset?.value === null ? null : String(preset?.value || ""));
  }

  const dbMap = new Map();
  for (const pair of (envVars || [])) {
    const key = String(pair?.key || "").trim();
    if (!key) continue;
    dbMap.set(key, String(pair?.value || ""));
  }

  const orderedKeys = [...presetMap.keys()];
  for (const key of dbMap.keys()) {
    if (!presetMap.has(key)) orderedKeys.push(key);
  }

  return orderedKeys.map((key) => {
    const hasPreset = presetMap.has(key);
    const presetValue = hasPreset ? presetMap.get(key) : null;
    const editable = hasPreset ? presetValue === null : true;
    const required = hasPreset ? presetValue === null : false;
    const keyEditable = !hasPreset;
    const removable = !hasPreset;
    const dbValue = dbMap.has(key) ? dbMap.get(key) : undefined;
    return {
      key,
      value: dbValue !== undefined ? dbValue : (presetValue === null ? "" : presetValue),
      editable,
      required,
      keyEditable,
      removable
    };
  });
}

function presetEnvVars(providerId, envVars = [], profileId = "") {
  const config = PROVIDER_PRESET_CONFIG[providerId] || { type: "keyList", keys: [] };
  if (config.type === "fixedProfiles") {
    const presetProfile = (config.profiles || []).find((item) => item.id === profileId) || config.profiles?.[0];
    return mergeEnvVarsWithPreset(presetProfile?.envVars || [], envVars);
  }
  return mergeEnvVarsWithPreset(
    (config.keys || []).map((key) => ({ key, value: null })),
    envVars
  );
}

function normalizeProviderEntry(providerId, entry = {}) {
  const config = PROVIDER_PRESET_CONFIG[providerId] || { type: "keyList", keys: [] };
  let profiles = [];

  if (config.type === "fixedProfiles") {
    const savedProfiles = Array.isArray(entry.profiles) ? entry.profiles : [];
    const savedProfileById = new Map(savedProfiles.map((profile) => [String(profile?.id || ""), profile]));
    profiles = (config.profiles || []).map((presetProfile) => ({
      id: presetProfile.id,
      name: presetProfile.name || presetProfile.id,
      envVars: presetEnvVars(
        providerId,
        savedProfileById.get(presetProfile.id)?.envVars || [],
        presetProfile.id
      )
    }));
    const presetIds = new Set((config.profiles || []).map((item) => item.id));
    const dbOnlyProfiles = savedProfiles
      .filter((profile) => {
        const id = String(profile?.id || "");
        return id && !presetIds.has(id);
      })
      .map((profile, idx) => ({
        id: String(profile?.id || `provider-${idx + 1}`),
        name: String(profile?.name || profile?.id || `Provider ${idx + 1}`),
        envVars: mergeEnvVarsWithPreset([], profile?.envVars || [])
      }));
    profiles = [...profiles, ...dbOnlyProfiles];
  } else {
    const sourceProfiles = Array.isArray(entry.profiles) && entry.profiles.length > 0
      ? entry.profiles
      : [{ id: "default", name: "Default Provider", envVars: [] }];
    profiles = sourceProfiles.map((profile, idx) => ({
      id: String(profile?.id || `provider-${idx + 1}`),
      name: String(profile?.name || `Provider ${idx + 1}`),
      envVars: presetEnvVars(providerId, profile?.envVars || [])
    }));
  }
  if (profiles.length === 0) {
    profiles = [{ id: "default", name: "Default Provider", envVars: [] }];
  }

  const defaultProfileId = profiles.some((item) => item.id === entry.defaultProfileId)
    ? entry.defaultProfileId
    : profiles[0].id;
  let enabledProfileId = defaultProfileId;
  if (entry.enabledProfileId === "") {
    enabledProfileId = "";
  } else if (profiles.some((item) => item.id === entry.enabledProfileId)) {
    enabledProfileId = entry.enabledProfileId;
  }
  return { defaultProfileId, enabledProfileId, profiles };
}

function normalizeProviderSettings(inputProviders = {}) {
  return {
    claude: normalizeProviderEntry("claude", inputProviders.claude || {}),
    codex: normalizeProviderEntry("codex", inputProviders.codex || {}),
    gemini: normalizeProviderEntry("gemini", inputProviders.gemini || {})
  };
}

function getMissingRequiredKeys(profile) {
  return (profile?.envVars || [])
    .filter((pair) => pair?.required && !String(pair?.value || "").trim())
    .map((pair) => pair.key);
}

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
  const [showAllSessionsByProject, setShowAllSessionsByProject] = useState({});
  const [providerTestStateByKey, setProviderTestStateByKey] = useState({});
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitleSessionId, setEditingTitleSessionId] = useState("");
  const [editingTitleValue, setEditingTitleValue] = useState("");
  const explorerTreeWrapRef = useRef(null);
  const titleInputRef = useRef(null);
  const titleEditSubmittingRef = useRef(false);
  const titleEditSkipCommitRef = useRef(false);

  const sessions = useSessionStore((state) => state.sessions);
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const createSession = useSessionStore((state) => state.createSession);
  const loadSessionsByProjects = useSessionStore((state) => state.loadSessionsByProjects);
  const ensureSessionRunning = useSessionStore((state) => state.ensureSessionRunning);
  const renameSession = useSessionStore((state) => state.renameSession);
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
  const currentProviderPresetConfig = PROVIDER_PRESET_CONFIG[providerTab] || { type: "keyList", keys: [] };
  const isFixedProfileProvider = currentProviderPresetConfig.type === "fixedProfiles";
  const currentProviderTestKey = `${providerTab}:${editingProfileId}`;
  const currentProviderTestState = providerTestStateByKey[currentProviderTestKey] || { status: "idle", message: "" };
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

  async function onToggleProviderProfile(profileId, nextEnabled) {
    if (!editingProfile || !profileId) return;
    const stateKey = `${providerTab}:${profileId}`;
    if (!nextEnabled) {
      setSettingsError("");
      setSettingsSavedAt(0);
      setSettingsModel((prev) => ({
        ...prev,
        providers: {
          ...(prev.providers || {}),
          [providerTab]: {
            ...(prev.providers?.[providerTab] || DEFAULT_PROVIDER_SETTINGS),
            enabledProfileId: prev.providers?.[providerTab]?.enabledProfileId === profileId
              ? ""
              : (prev.providers?.[providerTab]?.enabledProfileId || "")
          }
        }
      }));
      setProviderTestStateByKey((prev) => ({
        ...prev,
        [stateKey]: { status: "idle", message: "已关闭启用状态" }
      }));
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

  async function onSaveSettings() {
    const providerKeys = PROVIDER_IDS;
    const providersPayload = {};
    for (const providerKey of providerKeys) {
      const source = settingsModel.providers?.[providerKey] || DEFAULT_PROVIDER_SETTINGS;
      const normalizedSource = normalizeProviderEntry(providerKey, source);
      const profiles = (normalizedSource.profiles || []).map((profile, idx) => ({
        id: String(profile.id || `provider-${idx + 1}`),
        name: String(profile.name || `Provider ${idx + 1}`).trim() || `Provider ${idx + 1}`,
        envVars: (profile.envVars || [])
          .map((pair) => ({ key: pair.key, value: pair.value || "" }))
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
        : profiles[0].id;
      let enabledProfileId = defaultProfileId;
      if (normalizedSource.enabledProfileId === "") {
        enabledProfileId = "";
      } else if (profiles.some((p) => p.id === normalizedSource.enabledProfileId)) {
        enabledProfileId = normalizedSource.enabledProfileId;
      }
      providersPayload[providerKey] = { defaultProfileId, enabledProfileId, profiles };
    }

    try {
      const saved = await settingsBridge.saveClaude({ providers: providersPayload });
      setSettingsModel({
        providers: normalizeProviderSettings(saved?.providers || providersPayload)
      });
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

  function startTitleEdit() {
    if (!activeSession?.sessionId) return;
    setAppError("");
    titleEditSkipCommitRef.current = false;
    setIsEditingTitle(true);
    setEditingTitleSessionId(activeSession.sessionId);
    setEditingTitleValue(activeSession.name || "");
  }

  function cancelTitleEdit(skipCommit = false) {
    titleEditSkipCommitRef.current = skipCommit;
    setIsEditingTitle(false);
    setEditingTitleSessionId("");
    setEditingTitleValue("");
    titleEditSubmittingRef.current = false;
  }

  async function commitTitleEdit() {
    if (titleEditSkipCommitRef.current) {
      titleEditSkipCommitRef.current = false;
      return;
    }
    if (!isEditingTitle || !editingTitleSessionId || titleEditSubmittingRef.current) return;
    titleEditSubmittingRef.current = true;
    const targetSession = sessions.find((item) => item.sessionId === editingTitleSessionId);
    const originalTitle = targetSession?.name || "";
    const nextTitle = String(editingTitleValue || "").trim();

    try {
      if (!nextTitle) {
        setAppError("会话标题不能为空");
        cancelTitleEdit();
        return;
      }
      if (nextTitle !== originalTitle) {
        await renameSession(editingTitleSessionId, nextTitle);
      }
      cancelTitleEdit();
    } catch (e) {
      setAppError(`重命名会话失败：${e?.message || "未知错误"}`);
      cancelTitleEdit();
    } finally {
      titleEditSubmittingRef.current = false;
    }
  }

  useEffect(() => {
    if (!isEditingTitle) return;
    const input = titleInputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [isEditingTitle]);

  useEffect(() => {
    if (!isEditingTitle) return;
    if (!activeSession?.sessionId) {
      cancelTitleEdit();
      return;
    }
    if (activeSession.sessionId !== editingTitleSessionId) {
      cancelTitleEdit();
    }
  }, [activeSession?.sessionId, editingTitleSessionId, isEditingTitle]);

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
          <img className="brand-icon" src={appLogo} alt="ZeeLinCode logo" />
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
                  (s.projectId === p.id
                    || s.cwd === p.path
                    || s.cwd.startsWith(`${p.path}${p.path.endsWith("/") ? "" : "/"}`))
                  && enabledProviderIds.includes(normalizeProviderId(s.provider))
              );
              const sortedProjectSessions = [...projectSessions].sort(
                (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
              );
              const hiddenSessionCount = Math.max(0, sortedProjectSessions.length - 5);
              const activeSessionInHidden = hiddenSessionCount > 0
                && sortedProjectSessions.slice(5).some((item) => item.sessionId === activeSessionId);
              const showAllSessions = Boolean(showAllSessionsByProject[p.id]) || activeSessionInHidden;
              const visibleProjectSessions = showAllSessions
                ? sortedProjectSessions
                : sortedProjectSessions.slice(0, 5);
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
                    {primarySessionTool && (
                      <div className={`project-create-wrap ${openCreateMenuProjectId === p.id ? "open" : ""}`}>
                        <button
                          className="project-create-main"
                          title={`新建会话（${primarySessionTool.label}）`}
                          aria-label={`为项目 ${p.name} 新建会话`}
                          onClick={async (e) => {
                            e.stopPropagation();
                            setOpenCreateMenuProjectId(null);
                            setActiveProjectId(p.id);
                            await createSessionForProject(p, primarySessionTool.id);
                          }}
                        >
                          <ProviderIcon provider={primarySessionTool.id} className="project-tool-icon" />
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
                            {enabledSessionToolOptions.map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                className={`project-create-item ${primarySessionTool.id === option.id ? "active" : ""}`}
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
                    )}
                  </div>

                  {expanded && (
                    <div className="project-content">
                      {sortedProjectSessions.length === 0 ? (
                        <div className="session-empty">暂无会话</div>
                      ) : (
                        visibleProjectSessions.map((session) => {
                          const sessionStatus = session.runtimeStatus || session.status || "";
                          const hasVisualStatus = Boolean(sessionStatus) && sessionStatus !== "idle";
                          return (
                          <div
                            key={session.sessionId}
                            className={`session-item ${session.sessionId === activeSessionId ? "active" : ""}`}
                            data-testid={`session-item-${session.sessionId}`}
                            onClick={() => {
                              setSettingsOpen(false);
                              setActiveProjectId(p.id);
                              setActiveSession(session.sessionId);
                            }}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key !== "Enter" && e.key !== " ") return;
                              e.preventDefault();
                              setSettingsOpen(false);
                              setActiveProjectId(p.id);
                              setActiveSession(session.sessionId);
                            }}
                          >
                            <span
                              className={`session-provider-ring ${sessionStatus} ${hasVisualStatus ? "" : "no-status"}`}
                              title={
                                hasVisualStatus
                                  ? `${PROVIDER_LABEL[session.provider] || session.provider || "Claude Code"} · ${RUNTIME_STATUS_LABEL[sessionStatus] || sessionStatus}`
                                  : (PROVIDER_LABEL[session.provider] || session.provider || "Claude Code")
                              }
                            >
                              <ProviderIcon
                                provider={session.provider || "claude"}
                                className="project-tool-icon session-provider-icon"
                                variant="muted"
                                size={12}
                                title={PROVIDER_LABEL[session.provider] || session.provider || "Claude Code"}
                              />
                            </span>
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
                          );
                        })
                      )}
                      {hiddenSessionCount > 0 && (
                        <button
                          type="button"
                          className="session-collapse-toggle"
                          onClick={() => {
                            setShowAllSessionsByProject((prev) => ({
                              ...prev,
                              [p.id]: !showAllSessions
                            }));
                          }}
                        >
                          {showAllSessions ? "收起" : `展开显示（+${hiddenSessionCount}）`}
                        </button>
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
            {activeSession && (
              <ProviderIcon
                provider={activeSession.provider || "claude"}
                className="toolbar-provider-icon"
                size={20}
              />
            )}
            {activeSession && isEditingTitle && editingTitleSessionId === activeSession.sessionId ? (
              <input
                ref={titleInputRef}
                className="toolbar-title-input"
                value={editingTitleValue}
                maxLength={64}
                onChange={(e) => setEditingTitleValue(e.target.value)}
                onBlur={() => {
                  void commitTitleEdit();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commitTitleEdit();
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    cancelTitleEdit(true);
                  }
                }}
              />
            ) : (
              <span
                className={`toolbar-title ${activeSession ? "editable" : ""}`}
                onDoubleClick={startTitleEdit}
                title={activeSession ? "双击可重命名会话" : ""}
              >
                {activeSession ? activeSession.name : "ready"}
              </span>
            )}
            {activeSession && (
              <span className={`status-chip ${activeSession.runtimeStatus || activeSession.status}`}>
                {RUNTIME_STATUS_LABEL[activeSession.runtimeStatus || activeSession.status] || activeSession.runtimeStatus || activeSession.status}
              </span>
            )}
          </div>

          <div className="toolbar-actions">
            <button
              className="toolbar-icon-btn"
              type="button"
              onClick={onExtractSkill}
              disabled={!activeSessionId || skillgenDialog.status === "running"}
              title="从当前会话提取并生成项目 Skill"
              aria-label="提取技能"
            >
              <SkillExtractIcon size={14} />
            </button>
            <button
              className="toolbar-icon-btn"
              type="button"
              onClick={() => activeSessionId && destroySession(activeSessionId)}
              title="归档当前会话"
              aria-label="归档当前会话"
              disabled={!activeSessionId}
            >
              <ArchiveIcon size={14} />
            </button>
            <button
              className={`toolbar-icon-btn ${explorerVisible ? "active" : ""}`}
              type="button"
              title={explorerVisible ? "关闭文件树" : "展开文件树"}
              aria-label={explorerVisible ? "关闭文件树" : "展开文件树"}
              onClick={() => setExplorerVisible((prev) => !prev)}
            >
              <ExplorerToggleIcon size={14} />
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
                            if (node.data.type !== "file") return;
                            e.preventDefault();
                            e.stopPropagation();
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
                          <Suspense fallback={<span className="explorer-node-icon explorer-node-icon-fallback" aria-hidden="true" />}>
                            {node.isInternal ? (
                              node.isOpen ? (
                                <SuspendedOpenFolderIcon name={node.data.name} className="explorer-node-icon folder" aria-hidden="true" />
                              ) : (
                                <SuspendedFolderIcon name={node.data.name} className="explorer-node-icon folder" aria-hidden="true" />
                              )
                            ) : (
                              <SuspendedFileIcon name={node.data.name} className="explorer-node-icon file" aria-hidden="true" />
                            )}
                          </Suspense>
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
                              <span>{isFixedProfileProvider ? "供应商预设" : "供应商配置组"}</span>
                              {!isFixedProfileProvider && (
                                <button type="button" onClick={addProviderProfile}>+ 新增供应商</button>
                              )}
                            </div>
                            {isFixedProfileProvider ? (
                              <div className="provider-profile-select-row">
                                <select
                                  value={editingProfile?.id || ""}
                                  onChange={(e) => {
                                    const nextProfileId = e.target.value;
                                    setEditingProfileByProvider((prev) => ({ ...prev, [providerTab]: nextProfileId }));
                                    setSettingsError("");
                                  }}
                                >
                                  {(currentProviderSettings.profiles || []).map((profile) => (
                                    <option key={profile.id} value={profile.id}>{profile.name}</option>
                                  ))}
                                </select>
                                {editingProfile && currentProviderSettings.enabledProfileId === editingProfile.id && (
                                  <span className="provider-enabled-tag">已启用</span>
                                )}
                              </div>
                            ) : (
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
                                    {currentProviderSettings.enabledProfileId === profile.id && (
                                      <span className="provider-enabled-tag">已启用</span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {editingProfile && (
                            <div className="provider-profile-editor">
                              <div className={`provider-profile-controls ${isFixedProfileProvider ? "compact" : ""}`}>
                                {!isFixedProfileProvider && (
                                  <input
                                    type="text"
                                    value={editingProfile.name}
                                    onChange={(e) => renameProviderProfile(editingProfile.id, e.target.value)}
                                    placeholder="供应商名称"
                                  />
                                )}
                                <label className="provider-enable-row">
                                  <span className="provider-enable-text">启用（开启时自动测试）</span>
                                  <button
                                    type="button"
                                    className={`provider-switch ${currentProviderSettings.enabledProfileId === editingProfile.id ? "on" : ""}`}
                                    aria-label="启用配置开关"
                                    aria-pressed={currentProviderSettings.enabledProfileId === editingProfile.id}
                                    onClick={() => onToggleProviderProfile(editingProfile.id, currentProviderSettings.enabledProfileId !== editingProfile.id)}
                                    disabled={currentProviderTestState.status === "testing"}
                                  >
                                    <span className="provider-switch-thumb" />
                                  </button>
                                </label>
                                {!isFixedProfileProvider && (
                                  <>
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
                                  </>
                                )}
                              </div>
                              {currentProviderTestState.message && (
                                <div className={`provider-test-message ${currentProviderTestState.status}`}>
                                  {currentProviderTestState.message}
                                </div>
                              )}

                              <div className="env-list">
                                <div className="env-list-header">
                                  <span>环境变量（预设值只读；支持新增自定义 Key/Value）</span>
                                  <button type="button" onClick={addEnvVar}>+ 新增变量</button>
                                </div>

                                {(editingProfile.envVars || []).length === 0 ? (
                                  <div className="settings-coming-soon">当前 Provider 暂无预设键名。</div>
                                ) : (
                                  (editingProfile.envVars || []).map((pair, index) => (
                                    <div className="env-row" key={`${editingProfile.id}-env-${index}`}>
                                      <input
                                        type="text"
                                        placeholder="KEY"
                                        value={pair.key}
                                        className="env-key"
                                        readOnly={!pair.keyEditable}
                                        onChange={pair.keyEditable ? (e) => updateEnvVar(index, "key", e.target.value) : undefined}
                                      />
                                      <input
                                        type="text"
                                        placeholder="输入值"
                                        value={pair.value}
                                        className={`env-value ${pair.editable ? "" : "env-value-fixed"}`}
                                        readOnly={!pair.editable}
                                        onChange={pair.editable ? (e) => updateEnvVar(index, "value", e.target.value) : undefined}
                                      />
                                      <button
                                        type="button"
                                        className="env-remove-btn"
                                        onClick={() => removeEnvVar(index)}
                                        disabled={!pair.removable}
                                      >
                                        删除
                                      </button>
                                    </div>
                                  ))
                                )}
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
