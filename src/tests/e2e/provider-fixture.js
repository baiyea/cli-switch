const providerEnvPresets = require("../../pages/settings/providers/shared/provider-env-presets.json");

function buildProviderSettings(overrides = {}) {
  const defaults = {
    claude: {
      defaultProfileId: "deepseek-api",
      enabledProfileId: "deepseek-api",
      profiles: (providerEnvPresets.claude?.profiles || []).map((p) => ({
        ...p,
        envVars: p.envVars.map((e) => ({
          ...e,
          value: e.key === "ANTHROPIC_AUTH_TOKEN" && e.value === null
            ? (overrides.anthropicAuthToken || "e2e-dummy-token")
            : (e.value ?? "")
        }))
      }))
    },
    codex: {
      defaultProfileId: "oauth-login",
      enabledProfileId: "",
      profiles: (providerEnvPresets.codex?.profiles || []).map((p) => ({
        ...p,
        envVars: p.envVars.map((e) => ({ ...e, value: e.value ?? "" }))
      }))
    },
    gemini: {
      defaultProfileId: "oauth-login",
      enabledProfileId: "",
      profiles: (providerEnvPresets.gemini?.profiles || []).map((p) => ({
        ...p,
        envVars: p.envVars.map((e) => ({ ...e, value: e.value ?? "" }))
      }))
    }
  };

  if (overrides.claude) {
    defaults.claude = { ...defaults.claude, ...overrides.claude };
  }

  return { providers: defaults };
}

module.exports = { buildProviderSettings };
