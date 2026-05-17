import { useEffect, useMemo, useRef, useState } from "react";
import { ptyBridge, settingsBridge } from "./providers.bridge";
import {
  OAUTH_COMMAND_HINT,
  PROVIDER_IDS,
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
  resolveOAuthDisplayUrl,
  presetEnvVars
} from "./provider-config";

export const DEFAULT_PROVIDER_SETTINGS = {
  defaultProfileId: "",
  enabledProfileId: "",
  profiles: []
};

export const DEFAULT_SETTINGS = {
  providers: {
    claude: { ...DEFAULT_PROVIDER_SETTINGS },
    codex: { ...DEFAULT_PROVIDER_SETTINGS },
    gemini: { ...DEFAULT_PROVIDER_SETTINGS }
  }
};

export function isProviderConfigured(settingsModel) {
  const providers = settingsModel?.providers;
  if (!providers) return false;
  return Object.values(providers).some((provider) => provider?.enabledProfileId);
}

function getInitialEditingProfiles(providers) {
  return {
    claude: providers.claude.enabledProfileId || providers.claude.defaultProfileId || providers.claude.profiles?.[0]?.id || "",
    codex: providers.codex.enabledProfileId || providers.codex.defaultProfileId || providers.codex.profiles?.[0]?.id || "",
    gemini: providers.gemini.enabledProfileId || providers.gemini.defaultProfileId || providers.gemini.profiles?.[0]?.id || ""
  };
}

export function useProviderSettings({
  sessions = [],
  activeProjectId,
  activeProject,
  activeWorkspaceCwd,
  refreshSessions,
  setActiveSession,
  setActiveProjectId,
  onFirstProviderConfigured,
  activeSession,
  providerLabel = {}
} = {}) {
  const [providerCheckPassed, setProviderCheckPassed] = useState(false);
  const [providerTab, setProviderTab] = useState("claude");
  const [editingProfileByProvider, setEditingProfileByProvider] = useState({
    claude: "",
    codex: "",
    gemini: ""
  });
  const [settingsModel, setSettingsModel] = useState(DEFAULT_SETTINGS);
  const [settingsError, setSettingsError] = useState("");
  const [settingsSavedAt, setSettingsSavedAt] = useState(0);
  const [providerTestStateByKey, setProviderTestStateByKey] = useState({});
  const [oauthLinksByKey, setOauthLinksByKey] = useState({});
  const [oauthCodeByKey, setOauthCodeByKey] = useState({});
  const oauthLinkPollTimerRef = useRef({});

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
  const activeSessionProviderMeta = useMemo(() => {
    if (!activeSession) return "";
    const providerId = normalizeProviderId(activeSession.provider);
    const label = providerLabel[providerId] || String(activeSession.provider || providerId);
    const providerSettings = settingsModel.providers?.[providerId] || DEFAULT_PROVIDER_SETTINGS;
    const activeProfileId = providerSettings.enabledProfileId || providerSettings.defaultProfileId;
    const activeProfile = (providerSettings.profiles || []).find((profile) => profile.id === activeProfileId)
      || providerSettings.profiles?.[0]
      || null;
    const model = resolveProviderModel(providerId, activeProfile?.envVars || []);
    return `${label} · ${model}`;
  }, [activeSession, providerLabel, settingsModel]);

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

  async function loadSettings() {
    const value = await settingsBridge.getClaude();
    const merged = { providers: normalizeProviderSettings(value?.providers || {}) };
    setSettingsModel(merged);
    setEditingProfileByProvider(getInitialEditingProfiles(merged.providers));
    return merged;
  }

  function markProviderDirty(profileId = editingProfileId) {
    setProviderTestStateByKey((prev) => ({
      ...prev,
      [`${providerTab}:${profileId}`]: { status: "idle", message: "配置已变更，请重新测试连接" }
    }));
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
    markProviderDirty();
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
    markProviderDirty();
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
    markProviderDirty();
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
          if (index >= 0) nextEnv[index] = { ...nextEnv[index], ...payload };
          else nextEnv.push(payload);
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
    markProviderDirty();
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
    markProviderDirty(profileId);
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
        if (displayUrl || tick >= 90) stopOAuthLinkPolling(stateKey);
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
    const stateKey = `${providerId}:${profileId}`;
    if (!sessionId) {
      setProviderTestStateByKey((prev) => ({
        ...prev,
        [stateKey]: { status: "failed", message: "未找到 OAuth 登录终端会话，请先点击获取OAuth登陆链接" }
      }));
      return;
    }
    if (!normalized) {
      setProviderTestStateByKey((prev) => ({
        ...prev,
        [stateKey]: { status: "failed", message: "验证码为空，请先复制验证码" }
      }));
      return;
    }
    ptyBridge.input(sessionId, `${normalized}\r`);
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
      await refreshSessions?.();
      if (result.session?.sessionId) setActiveSession?.(result.session.sessionId);
      if (result.session?.projectId) setActiveProjectId?.(result.session.projectId);
      if (result.session?.sessionId) startOAuthLinkPolling(providerTab, profileId, result.session.sessionId);
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
    const providersPayload = {};
    for (const providerKey of PROVIDER_IDS) {
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

      const defaultProfileId = profiles.some((profile) => profile.id === normalizedSource.defaultProfileId)
        ? normalizedSource.defaultProfileId
        : (profiles.length > 0 ? profiles[0].id : "");
      let enabledProfileId = normalizedSource.enabledProfileId === "" ? "" : defaultProfileId;
      if (enabledProfileId !== "" && profiles.some((profile) => profile.id === normalizedSource.enabledProfileId)) {
        enabledProfileId = normalizedSource.enabledProfileId;
      }
      if (enabledProfileId !== "" && !profiles.some((profile) => profile.id === enabledProfileId)) {
        enabledProfileId = "";
      }
      providersPayload[providerKey] = { defaultProfileId, enabledProfileId, profiles };
    }

    try {
      const saved = await settingsBridge.saveClaude({ providers: providersPayload });
      const normalizedProviders = normalizeProviderSettings(saved?.providers || providersPayload);
      setSettingsModel({ providers: normalizedProviders });
      setEditingProfileByProvider(getInitialEditingProfiles(normalizedProviders));
      setSettingsSavedAt(Date.now());
      setSettingsError("");
      if (!providerCheckPassed && isProviderConfigured({ providers: normalizedProviders })) {
        setProviderCheckPassed(true);
        onFirstProviderConfigured?.();
      }
    } catch (e) {
      setSettingsError(e?.message || "保存失败");
    }
  }

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
    const profiles = currentProviderSettings.profiles || [];
    if (profiles.length === 0) return;
    if (!profiles.some((profile) => profile.id === editingProfileId)) {
      setEditingProfileByProvider((prev) => ({
        ...prev,
        [providerTab]: currentProviderSettings.enabledProfileId || currentProviderSettings.defaultProfileId || profiles[0].id
      }));
    }
  }, [currentProviderSettings, editingProfileId, providerTab]);

  return {
    settingsModel,
    enabledProviderIds,
    activeSessionProviderMeta,
    settingsError,
    settingsSavedAt,
    providerCheckPassed,
    setProviderCheckPassed,
    providerTab,
    setProviderTab,
    currentProviderSettings,
    isFixedProfileProvider,
    editingProfile,
    currentProviderTestState,
    isEditingOAuthProfile,
    hasCurrentOauthDisplayUrl,
    currentOauthDisplayUrl,
    currentOauthCode,
    regularEnvVars,
    currentProxyTestState,
    proxyState,
    loadSettings,
    providerSectionProps: {
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
    }
  };
}
