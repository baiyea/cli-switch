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

function buildLiveSyncMarker({ provider, profileId, source, now }) {
  return {
    provider,
    profileId: String(profileId || ''),
    source: String(source || ''),
    liveSync: true,
    updatedAt: new Date(now()).toISOString(),
  };
}

function createClaudeLiveConfigAdapter({ now = () => Date.now(), logInfo = () => {}, logWarn = () => {} } = {}) {
  function sync({ profile, env = {}, paths, source = '' } = {}) {
    const settingsPath = paths?.claudeSettingsPath?.();
    if (!settingsPath) {
      throw new Error('missing claude settings path');
    }

    const currentSettings = readJsonFile(settingsPath, {});
    const currentEnv =
      currentSettings.env && typeof currentSettings.env === 'object' && !Array.isArray(currentSettings.env)
        ? currentSettings.env
        : {};
    const nextSettings = {
      ...currentSettings,
      env: {
        ...currentEnv,
        ...(env || {}),
      },
      cliswitch: {
        ...(currentSettings.cliswitch && typeof currentSettings.cliswitch === 'object'
          ? currentSettings.cliswitch
          : {}),
        liveSync: buildLiveSyncMarker({
          provider: 'claude',
          profileId: profile?.id || '',
          source,
          now,
        }),
      },
    };

    const currentText = fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, 'utf8') : '';
    const nextText = `${JSON.stringify(nextSettings, null, 2)}\n`;
    if (currentText === nextText) {
      return { ok: true, configPath: settingsPath, changed: false };
    }

    try {
      if (currentText) {
        const backupDir = path.join(path.dirname(settingsPath), 'backups');
        ensureDir(backupDir);
        const backupPath = path.join(
          backupDir,
          `settings.before-cliswitch-live-sync.${Date.now()}.json`,
        );
        fs.writeFileSync(backupPath, currentText, 'utf8');
      }
      writeJsonFile(settingsPath, nextSettings);
      logInfo('claude-live-sync', 'Synced Claude live config from active provider profile', {
        settingsPath,
        profileId: String(profile?.id || ''),
        source,
      });
      return { ok: true, configPath: settingsPath, changed: true };
    } catch (error) {
      logWarn('claude-live-sync', 'Failed to sync Claude live config', {
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
  createClaudeLiveConfigAdapter,
};
