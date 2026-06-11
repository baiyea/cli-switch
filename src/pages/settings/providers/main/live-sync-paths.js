const path = require('node:path');
const os = require('node:os');

function createLiveSyncPaths({ homedir } = {}) {
  const resolveHome =
    typeof homedir === 'function'
      ? () => {
          try {
            const value = String(homedir() || '').trim();
            return value || os.homedir();
          } catch {
            return os.homedir();
          }
        }
      : () => os.homedir();

  function joinHome(...segments) {
    return path.join(resolveHome(), ...segments);
  }

  return {
    claudeDir: () => joinHome('.claude'),
    claudeSettingsPath: () => joinHome('.claude', 'settings.json'),
    codexDir: () => joinHome('.codex'),
    codexAuthPath: () => joinHome('.codex', 'auth.json'),
    codexConfigPath: () => joinHome('.codex', 'config.toml'),
    geminiDir: () => joinHome('.gemini'),
    geminiEnvPath: () => joinHome('.gemini', '.env'),
    geminiSettingsPath: () => joinHome('.gemini', 'settings.json'),
  };
}

module.exports = {
  createLiveSyncPaths,
};
