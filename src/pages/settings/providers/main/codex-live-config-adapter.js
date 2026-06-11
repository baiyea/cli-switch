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

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeTomlString(value) {
  return JSON.stringify(String(value ?? ''));
}

function getActiveCodexModelProviderId(configText = '') {
  const match = String(configText).match(/^\s*model_provider\s*=\s*["']([^"']+)["']\s*$/m);
  return match ? String(match[1] || '').trim() : '';
}

function upsertLine(blockText, lineKey, lineValue) {
  const text = String(blockText || '');
  const pattern = new RegExp(`(^|\\n)${escapeRegex(lineKey)}\\s*=.*(?=\\n|$)`);
  const line = `${lineKey} = ${lineValue}`;
  if (pattern.test(text)) {
    return text.replace(pattern, (match, prefix) => `${prefix || ''}${line}`);
  }
  return `${text.replace(/\s*$/, '')}${text.trim() ? '\n' : ''}${line}\n`;
}

function upsertProviderSectionToken(configText, providerId, token) {
  const text = String(configText || '');
  const providerSectionHeader = `[model_providers.${providerId}]`;
  const tokenLine = `experimental_bearer_token = ${escapeTomlString(token)}`;
  const sectionHeaderIndex = text.indexOf(providerSectionHeader);

  if (sectionHeaderIndex < 0) {
    const topLevelTokenPattern = /(^|\n)experimental_bearer_token\s*=.*(?=\n|$)/;
    if (topLevelTokenPattern.test(text)) {
      return text.replace(topLevelTokenPattern, (match, prefix) => `${prefix || ''}${tokenLine}`);
    }
    return `${text.replace(/\s*$/, '')}${text.trim() ? '\n\n' : ''}${tokenLine}\n`;
  }

  const sectionBodyStart = text.indexOf('\n', sectionHeaderIndex);
  if (sectionBodyStart < 0) {
    return `${text.replace(/\s*$/, '')}\n${tokenLine}\n`;
  }

  const nextSectionMatch = text.slice(sectionBodyStart + 1).match(/\n\s*\[[^\]]+\]\s*\n/);
  const sectionBodyEnd = nextSectionMatch
    ? sectionBodyStart + 1 + nextSectionMatch.index
    : text.length;
  const before = text.slice(0, sectionBodyStart + 1);
  const body = text.slice(sectionBodyStart + 1, sectionBodyEnd);
  const after = text.slice(sectionBodyEnd);
  const nextBody = upsertLine(body, 'experimental_bearer_token', escapeTomlString(token)).replace(
    /\s*$/,
    '',
  );

  return `${before}${nextBody}\n${after.replace(/^\s*/, '')}`;
}

function isOfficialCodexProfile(profile = {}) {
  if (profile?.meta?.codexOfficial === false) return false;
  if (profile?.meta?.codexOfficial === true) return true;
  return true;
}

function extractCodexApiKey(profile = {}) {
  const env = profile?.settingsConfig?.env || {};
  const apiKey = String(env.OPENAI_API_KEY || '').trim();
  return apiKey;
}

function createCodexLiveConfigAdapter({ logInfo = () => {}, logWarn = () => {} } = {}) {
  function sync({ profile, env = {}, paths, source = '' } = {}) {
    const configPath = paths?.codexConfigPath?.();
    const authPath = paths?.codexAuthPath?.();
    if (!configPath || !authPath) {
      throw new Error('missing codex config paths');
    }

    ensureDir(path.dirname(configPath));

    const currentConfig = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
    const nextConfigBase =
      String(profile?.settingsConfig?.config || '').trim().length > 0
        ? String(profile.settingsConfig.config)
        : currentConfig;

    try {
      if (isOfficialCodexProfile(profile)) {
        const auth = profile?.settingsConfig?.auth;
        const nextConfig =
          String(profile?.settingsConfig?.config || '').trim().length > 0
            ? String(profile.settingsConfig.config)
            : currentConfig;
        if (auth && typeof auth === 'object' && !Array.isArray(auth) && Object.keys(auth).length > 0) {
          writeJsonFile(authPath, auth);
        }
        fs.writeFileSync(configPath, nextConfig.endsWith('\n') ? nextConfig : `${nextConfig}\n`, 'utf8');
        logInfo('codex-live-sync', 'Synced official Codex live config', {
          configPath,
          authPath,
          profileId: String(profile?.id || ''),
          source,
        });
        return { ok: true, configPath, authPath };
      }

      const token = extractCodexApiKey(profile) || String(env.OPENAI_API_KEY || '').trim();
      const nextConfig = upsertProviderSectionToken(nextConfigBase, String(profile?.id || ''), token);
      fs.writeFileSync(configPath, nextConfig.endsWith('\n') ? nextConfig : `${nextConfig}\n`, 'utf8');
      logInfo('codex-live-sync', 'Synced third-party Codex live config', {
        configPath,
        authPath,
        profileId: String(profile?.id || ''),
        source,
      });
      return { ok: true, configPath, authPath, authPreserved: true };
    } catch (error) {
      logWarn('codex-live-sync', 'Failed to sync Codex live config', {
        configPath,
        authPath,
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
  createCodexLiveConfigAdapter,
  getActiveCodexModelProviderId,
  upsertProviderSectionToken,
};
