const fs = require('node:fs');
const path = require('node:path');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonFile(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function isOauthProfile(profile = {}) {
  const authMode = String(profile?.settingsConfig?.env?.ZEELIN_AUTH_MODE || '').trim().toLowerCase();
  if (authMode === 'oauth') return true;
  if (profile?.meta?.authMode === 'oauth') return true;
  if (profile?.meta?.authBinding?.authProvider === 'google_oauth') return true;
  return false;
}

function serializeEnv(env = {}) {
  return Object.keys(env || {})
    .map((key) => String(key || '').trim())
    .filter((key) => key && !key.startsWith('ZEELIN_'))
    .sort((a, b) => a.localeCompare(b))
    .map((key) => `${key}=${String(env[key] ?? '')}`)
    .join('\n');
}

function upsertSelectedType(settings, selectedType) {
  const next = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
  if (!next.security || typeof next.security !== 'object' || Array.isArray(next.security)) {
    next.security = {};
  }
  if (!next.security.auth || typeof next.security.auth !== 'object' || Array.isArray(next.security.auth)) {
    next.security.auth = {};
  }
  next.security.auth.selectedType = selectedType;
  return next;
}

function createGeminiLiveConfigAdapter({ logInfo = () => {}, logWarn = () => {} } = {}) {
  function sync({ profile, env = {}, paths, source = '' } = {}) {
    const envPath = paths?.geminiEnvPath?.();
    const settingsPath = paths?.geminiSettingsPath?.();
    if (!envPath || !settingsPath) {
      throw new Error('missing gemini config paths');
    }

    try {
      ensureDir(path.dirname(envPath));

      const oauth = isOauthProfile(profile);
      const envText = oauth ? '' : serializeEnv(env);
      fs.writeFileSync(envPath, envText ? `${envText}\n` : '', 'utf8');

      const currentSettings = readJsonFile(settingsPath, {});
      const nextSettings = upsertSelectedType(
        currentSettings,
        oauth ? 'oauth-personal' : 'gemini-api-key',
      );
      nextSettings.cliswitch = {
        ...(nextSettings.cliswitch && typeof nextSettings.cliswitch === 'object'
          ? nextSettings.cliswitch
          : {}),
        provider: 'gemini',
        profileId: String(profile?.id || ''),
        source: String(source || ''),
      };
      writeJsonFile(settingsPath, nextSettings);

      logInfo('gemini-live-sync', 'Synced Gemini live config', {
        envPath,
        settingsPath,
        profileId: String(profile?.id || ''),
        source,
        mode: oauth ? 'oauth-personal' : 'gemini-api-key',
      });
      return { ok: true, envPath, settingsPath, authMode: oauth ? 'oauth-personal' : 'gemini-api-key' };
    } catch (error) {
      logWarn('gemini-live-sync', 'Failed to sync Gemini live config', {
        envPath,
        settingsPath,
        profileId: String(profile?.id || ''),
        source,
        reason: error instanceof Error ? error.message : String(error),
      });
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  return {
    sync,
  };
}

module.exports = {
  createGeminiLiveConfigAdapter,
  isOauthProfile,
  serializeEnv,
  upsertSelectedType,
};
