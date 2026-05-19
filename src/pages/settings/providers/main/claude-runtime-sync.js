const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createClaudeRuntimeSyncService({
  normalizeProviderId,
  maskEnvForLog,
  logInfo,
  logWarn,
  tryReadJsonFile,
  writeJsonFileSafe,
  ensureDirSafe,
  toClaudeProjectKey,
}) {
  function syncClaudeProjectTrust(cwd) {
    const projectKey = toClaudeProjectKey(cwd);
    if (!projectKey) return;
    const configPath = path.join(os.homedir(), '.claude.json');
    const currentConfig = tryReadJsonFile(configPath, {});
    const currentProjects =
      currentConfig.projects && typeof currentConfig.projects === 'object'
        ? currentConfig.projects
        : {};
    const currentProject =
      currentProjects[projectKey] && typeof currentProjects[projectKey] === 'object'
        ? currentProjects[projectKey]
        : {};
    if (
      currentProject.hasTrustDialogAccepted === true &&
      currentProject.projectOnboardingSeenCount === 0
    )
      return;

    const nextConfig = {
      ...currentConfig,
      projects: {
        ...currentProjects,
        [projectKey]: {
          ...currentProject,
          allowedTools: Array.isArray(currentProject.allowedTools) ? currentProject.allowedTools : [],
          disabledMcpjsonServers: Array.isArray(currentProject.disabledMcpjsonServers)
            ? currentProject.disabledMcpjsonServers
            : [],
          enabledMcpjsonServers: Array.isArray(currentProject.enabledMcpjsonServers)
            ? currentProject.enabledMcpjsonServers
            : [],
          hasClaudeMdExternalIncludesApproved:
            currentProject.hasClaudeMdExternalIncludesApproved === true,
          hasClaudeMdExternalIncludesWarningShown:
            currentProject.hasClaudeMdExternalIncludesWarningShown === true,
          hasTrustDialogAccepted: true,
          mcpContextUris: Array.isArray(currentProject.mcpContextUris)
            ? currentProject.mcpContextUris
            : [],
          mcpServers:
            currentProject.mcpServers && typeof currentProject.mcpServers === 'object'
              ? currentProject.mcpServers
              : {},
          projectOnboardingSeenCount: 0,
        },
      },
    };
    const currentText = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
    const nextText = `${JSON.stringify(nextConfig, null, 2)}\n`;
    if (currentText === nextText) return;
    try {
      if (currentText) {
        const backupDir = path.join(os.homedir(), '.claude', 'backups');
        ensureDirSafe(backupDir);
        const backupPath = path.join(
          backupDir,
          `claude-json.before-cliswitch-trust.${Date.now()}.json`,
        );
        fs.writeFileSync(backupPath, currentText, 'utf8');
      }
      writeJsonFileSafe(configPath, nextConfig);
      logInfo('claude-runtime', 'Synced Claude project trust from active workspace', {
        configPath,
        projectKey,
      });
    } catch (error) {
      logWarn('claude-runtime', 'Failed to sync Claude project trust', {
        configPath,
        projectKey,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function syncClaudeSettingsEnv(provider, startupEnv = {}, cwd = '') {
    const id = normalizeProviderId(provider);
    if (id !== 'claude') return startupEnv;
    syncClaudeProjectTrust(cwd);

    const userClaudeDir = path.join(os.homedir(), '.claude');
    const userSettingsPath = path.join(userClaudeDir, 'settings.json');
    const currentSettings = tryReadJsonFile(userSettingsPath, {});
    const nextSettings = {
      ...currentSettings,
      env: { ...(startupEnv || {}) },
    };
    const currentText = fs.existsSync(userSettingsPath)
      ? fs.readFileSync(userSettingsPath, 'utf8')
      : '';
    const nextText = `${JSON.stringify(nextSettings, null, 2)}\n`;
    if (currentText === nextText) return startupEnv;
    try {
      if (currentText) {
        const backupDir = path.join(userClaudeDir, 'backups');
        ensureDirSafe(backupDir);
        const backupPath = path.join(
          backupDir,
          `settings.before-cliswitch-env.${Date.now()}.json`,
        );
        fs.writeFileSync(backupPath, currentText, 'utf8');
      }
      writeJsonFileSafe(userSettingsPath, nextSettings);
      logInfo('claude-runtime', 'Synced Claude settings env from active provider profile', {
        settingsPath: userSettingsPath,
        env: maskEnvForLog(nextSettings.env || {}),
      });
    } catch (error) {
      logWarn('claude-runtime', 'Failed to sync Claude settings env', {
        settingsPath: userSettingsPath,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    return startupEnv;
  }

  return {
    syncClaudeSettingsEnv,
  };
}

module.exports = {
  createClaudeRuntimeSyncService,
};
