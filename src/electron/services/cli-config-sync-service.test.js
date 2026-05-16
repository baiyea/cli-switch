const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createCliConfigSyncService, getProviderUpdateDisableEnv } = require("./cli-config-sync-service");

function makeService(home) {
  return createCliConfigSyncService({
    normalizeProviderId: (value) => String(value || "claude").toLowerCase(),
    logInfo: () => {},
    logWarn: () => {},
    now: () => Date.UTC(2026, 4, 16, 12, 0, 0),
    homedir: () => home
  });
}

test("syncProviderCliConfig merges Claude settings env and preserves existing settings", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cli-config-sync-"));
  const settingsPath = path.join(home, ".claude", "settings.json");
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify({
    permissions: { allow: ["Bash(git status)"] },
    env: { EXISTING: "1" }
  }), "utf8");

  const result = makeService(home).syncProviderCliConfig({
    provider: "claude",
    profileId: "deepseek-api",
    env: { ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic" },
    source: "provider-test"
  });

  assert.equal(result.ok, true);
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  assert.deepEqual(settings.permissions, { allow: ["Bash(git status)"] });
  assert.equal(settings.env.EXISTING, "1");
  assert.equal(settings.env.ANTHROPIC_BASE_URL, "https://api.deepseek.com/anthropic");
  assert.equal(settings.env.CLAUDE_CODE_DISABLE_AUTOUPDATER, "1");
  assert.equal(settings.env.NO_UPDATE_NOTIFIER, "1");
  assert.equal(settings.cliswitch.updatePreferences.disableAutoUpdate, true);
});

test("syncProviderCliConfig updates Codex toml without dropping existing sections", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cli-config-sync-"));
  const configPath = path.join(home, ".codex", "config.toml");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, "model = \"gpt-5.2\"\n\n[projects.'d:\\\\code']\ntrust_level = \"trusted\"\n", "utf8");

  const result = makeService(home).syncProviderCliConfig({
    provider: "codex",
    profileId: "oauth-login",
    source: "oauth-probe"
  });

  assert.equal(result.ok, true);
  const text = fs.readFileSync(configPath, "utf8");
  assert.match(text, /^disable_update_check = true/m);
  assert.match(text, /^hide_upgrade_notification = true/m);
  assert.match(text, /^auto_update = false/m);
  assert.match(text, /^\[cli_switch\]$/m);
  assert.match(text, /^\[projects\.'d:\\\\code'\]$/m);
});

test("syncProviderCliConfig merges Gemini settings update preferences", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cli-config-sync-"));
  const settingsPath = path.join(home, ".gemini", "settings.json");
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify({ general: { sessionRetention: 30 } }), "utf8");

  const result = makeService(home).syncProviderCliConfig({
    provider: "gemini",
    profileId: "oauth-login",
    source: "oauth-probe"
  });

  assert.equal(result.ok, true);
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  assert.equal(settings.general.sessionRetention, 30);
  assert.equal(settings.updates.disabled, true);
  assert.equal(settings.updates.showNotifications, false);
  assert.equal(settings.ui.hideUpdateNotifications, true);
});

test("getProviderUpdateDisableEnv returns provider-specific update env", () => {
  assert.equal(getProviderUpdateDisableEnv("claude").CLAUDE_CODE_DISABLE_UPDATE_CHECK, "1");
  assert.equal(getProviderUpdateDisableEnv("codex").CODEX_DISABLE_UPDATE_CHECK, "1");
  assert.equal(getProviderUpdateDisableEnv("gemini").GEMINI_CLI_DISABLE_UPDATE_CHECK, "1");
  assert.equal(getProviderUpdateDisableEnv("gemini").npm_config_update_notifier, "false");
});
