const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const UPDATE_DISABLE_ENV = Object.freeze({
  NO_UPDATE_NOTIFIER: "1",
  npm_config_update_notifier: "false",
  DISABLE_AUTOUPDATER: "1"
});

const PROVIDER_UPDATE_DISABLE_ENV = Object.freeze({
  claude: {
    CLAUDE_CODE_DISABLE_AUTOUPDATER: "1",
    CLAUDE_CODE_DISABLE_UPDATE_CHECK: "1"
  },
  codex: {
    CODEX_DISABLE_UPDATE_CHECK: "1",
    CODEX_NO_UPDATE_NOTIFIER: "1"
  },
  gemini: {
    GEMINI_CLI_DISABLE_UPDATE_CHECK: "1",
    GEMINI_CLI_NO_UPDATE_NOTIFIER: "1"
  }
});

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonFile(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildManagedMarker({ provider, profileId, source, now }) {
  return {
    ...(source ? { source } : {}),
    provider,
    profileId: String(profileId || ""),
    disableAutoUpdate: true,
    disableUpdateNotifications: true,
    updatedAt: new Date(now()).toISOString()
  };
}

function getProviderUpdateDisableEnv(provider) {
  return {
    ...UPDATE_DISABLE_ENV,
    ...(PROVIDER_UPDATE_DISABLE_ENV[provider] || {})
  };
}

function setTopLevelTomlValue(text, key, value) {
  const normalized = String(text || "");
  const line = `${key} = ${value}`;
  const pattern = new RegExp(`(^|\\n)${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=.*(?=\\n|$)`);
  if (pattern.test(normalized)) {
    return normalized.replace(pattern, (match, prefix) => `${prefix || ""}${line}`);
  }
  const sectionIndex = normalized.search(/^\s*\[[^\]]+\]\s*$/m);
  if (sectionIndex >= 0) {
    const before = normalized.slice(0, sectionIndex).replace(/\s*$/, "");
    const after = normalized.slice(sectionIndex).replace(/^\s*/, "");
    return `${before ? `${before}\n` : ""}${line}\n${after}`;
  }
  return `${normalized.replace(/\s*$/, "")}${normalized.trim() ? "\n" : ""}${line}\n`;
}

function upsertTomlSection(text, section, values) {
  let next = String(text || "");
  const lines = Object.entries(values).map(([key, value]) => {
    if (typeof value === "boolean") return `${key} = ${value ? "true" : "false"}`;
    return `${key} = ${JSON.stringify(String(value || ""))}`;
  });
  const sectionHeader = `[${section}]`;
  const sectionPattern = new RegExp(`(^|\\n)\\[${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\s*\\n[\\s\\S]*?(?=\\n\\s*\\[[^\\]]+\\]|$)`);
  if (sectionPattern.test(next)) {
    return next.replace(sectionPattern, (match, prefix) => `${prefix || ""}${sectionHeader}\n${lines.join("\n")}`);
  }
  return `${next.replace(/\s*$/, "")}${next.trim() ? "\n\n" : ""}${sectionHeader}\n${lines.join("\n")}\n`;
}

function writeCodexToml(filePath, marker) {
  ensureDir(path.dirname(filePath));
  let next = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  next = setTopLevelTomlValue(next, "disable_update_check", "true");
  next = setTopLevelTomlValue(next, "hide_upgrade_notification", "true");
  next = setTopLevelTomlValue(next, "auto_update", "false");
  next = upsertTomlSection(next, "cli_switch", marker);
  fs.writeFileSync(filePath, next.endsWith("\n") ? next : `${next}\n`, "utf8");
}

function createCliConfigSyncService({
  normalizeProviderId,
  logInfo = () => {},
  logWarn = () => {},
  now = () => Date.now(),
  homedir = () => os.homedir()
}) {
  function syncClaude({ env, marker }) {
    const settingsPath = path.join(homedir(), ".claude", "settings.json");
    const current = readJsonFile(settingsPath, {});
    const next = {
      ...current,
      env: {
        ...(current.env && typeof current.env === "object" ? current.env : {}),
        ...(env || {})
      },
      cliswitch: {
        ...(current.cliswitch && typeof current.cliswitch === "object" ? current.cliswitch : {}),
        updatePreferences: marker
      }
    };
    writeJsonFile(settingsPath, next);
    return settingsPath;
  }

  function syncCodex({ marker }) {
    const configPath = path.join(homedir(), ".codex", "config.toml");
    writeCodexToml(configPath, marker);
    return configPath;
  }

  function syncGemini({ marker }) {
    const settingsPath = path.join(homedir(), ".gemini", "settings.json");
    const current = readJsonFile(settingsPath, {});
    const next = {
      ...current,
      updates: {
        ...(current.updates && typeof current.updates === "object" ? current.updates : {}),
        disabled: true,
        showNotifications: false
      },
      ui: {
        ...(current.ui && typeof current.ui === "object" ? current.ui : {}),
        hideUpdateNotifications: true
      },
      cliswitch: {
        ...(current.cliswitch && typeof current.cliswitch === "object" ? current.cliswitch : {}),
        updatePreferences: marker
      }
    };
    writeJsonFile(settingsPath, next);
    return settingsPath;
  }

  function syncProviderCliConfig({ provider, profileId, env = {}, source = "" } = {}) {
    const id = normalizeProviderId(provider);
    if (!["claude", "codex", "gemini"].includes(id)) return { ok: true, skipped: true };
    const updateEnv = getProviderUpdateDisableEnv(id);
    const marker = buildManagedMarker({ provider: id, profileId, source, now });
    try {
      const configPath = id === "claude"
        ? syncClaude({ env: { ...(env || {}), ...updateEnv }, marker })
        : id === "codex"
          ? syncCodex({ marker })
          : syncGemini({ marker });
      logInfo("cli-config-sync", "Disabled CLI update checks after successful provider test", {
        provider: id,
        profileId: String(profileId || ""),
        configPath,
        source
      });
      return { ok: true, configPath };
    } catch (error) {
      logWarn("cli-config-sync", "Failed to disable CLI update checks", {
        provider: id,
        profileId: String(profileId || ""),
        source,
        reason: error instanceof Error ? error.message : String(error)
      });
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  return {
    syncProviderCliConfig
  };
}

module.exports = {
  createCliConfigSyncService,
  getProviderUpdateDisableEnv
};
