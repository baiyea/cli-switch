function createSettingsRepo({ getDatabase, now }) {
  const conn = getDatabase();
  const SETTINGS_KEY = "provider_startup_settings";
  const defaultValue = {
    providers: {
      claude: { defaultProfileId: "", enabledProfileId: "", profiles: [] },
      codex: { defaultProfileId: "", enabledProfileId: "", profiles: [] },
      gemini: { defaultProfileId: "", enabledProfileId: "", profiles: [] }
    }
  };

  function ensureProviderShape(input) {
    const normalized = { ...defaultValue, ...(input || {}) };
    const providers = { ...(normalized.providers || {}) };
    for (const p of ["claude", "codex", "gemini"]) {
      const current = providers[p] || {};
      const profiles = Array.isArray(current.profiles) && current.profiles.length > 0
        ? current.profiles.map((profile, idx) => ({
          id: String(profile?.id || `provider-${idx + 1}`),
          name: String(profile?.name || `Provider ${idx + 1}`),
          envVars: Array.isArray(profile?.envVars) ? profile.envVars : []
        }))
        : [];
      const dpId = profiles.length > 0 && profiles.some((x) => x.id === current.defaultProfileId)
        ? current.defaultProfileId : (profiles.length > 0 ? profiles[0].id : "");
      let epId = current.enabledProfileId === "" ? "" : dpId;
      if (epId !== "" && profiles.some((x) => x.id === current.enabledProfileId)) epId = current.enabledProfileId;
      if (epId !== "" && !profiles.some((x) => x.id === epId)) epId = "";
      providers[p] = { defaultProfileId: dpId, enabledProfileId: epId, profiles };
    }
    return { providers };
  }

  return {
    getProviderStartupSettings() {
      const row = conn.prepare("SELECT value FROM app_settings WHERE key = ?").get(SETTINGS_KEY);
      if (!row) return defaultValue;
      try {
        const parsed = JSON.parse(row.value || "{}");
        if (parsed?.providers && typeof parsed.providers === "object") return ensureProviderShape(parsed);
        if (Array.isArray(parsed?.envVars)) {
          return ensureProviderShape({
            providers: { claude: { defaultProfileId: "default", profiles: [{ id: "default", name: "Default Provider", envVars: parsed.envVars }] } }
          });
        }
        const migrated = [];
        if (parsed?.apiUrl) migrated.push({ key: "ANTHROPIC_BASE_URL", value: parsed.apiUrl });
        if (parsed?.apiKey) migrated.push({ key: parsed?.apiKeyEnvVarName || "ANTHROPIC_API_KEY", value: parsed.apiKey });
        if (parsed?.model) migrated.push({ key: "ANTHROPIC_MODEL", value: parsed.model });
        for (const pair of parsed?.additionalEnvVars || []) { if (!pair?.key) continue; migrated.push({ key: pair.key, value: pair.value || "" }); }
        return ensureProviderShape({
          providers: { claude: { defaultProfileId: "default", profiles: [{ id: "default", name: "Default Provider", envVars: migrated }] } }
        });
      } catch { return defaultValue; }
    },
    setProviderStartupSettings(value) {
      const normalized = ensureProviderShape(value);
      const timestamp = now();
      conn.prepare(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).run(SETTINGS_KEY, JSON.stringify(normalized), timestamp);
      return normalized;
    }
  };
}

module.exports = { createSettingsRepo };
