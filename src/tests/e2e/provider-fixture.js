const providerEnvPresets = require('../../pages/settings/providers/shared/provider-env-presets.json');
const fs = require('node:fs');
const path = require('node:path');

function buildProviderSettings(overrides = {}) {
  const defaults = {
    claude: {
      defaultProfileId: 'deepseek-api',
      enabledProfileId: 'deepseek-api',
      profiles: (providerEnvPresets.claude?.profiles || []).map((p) => ({
        ...p,
        envVars: p.envVars.map((e) => ({
          ...e,
          value:
            e.key === 'ANTHROPIC_AUTH_TOKEN' && e.value === null
              ? overrides.anthropicAuthToken || 'e2e-dummy-token'
              : (e.value ?? ''),
        })),
      })),
    },
    codex: {
      defaultProfileId: 'oauth-login',
      enabledProfileId: '',
      profiles: (providerEnvPresets.codex?.profiles || []).map((p) => ({
        ...p,
        envVars: p.envVars.map((e) => ({ ...e, value: e.value ?? '' })),
      })),
    },
    gemini: {
      defaultProfileId: 'oauth-login',
      enabledProfileId: '',
      profiles: (providerEnvPresets.gemini?.profiles || []).map((p) => ({
        ...p,
        envVars: p.envVars.map((e) => ({ ...e, value: e.value ?? '' })),
      })),
    },
  };

  if (overrides.claude) {
    defaults.claude = { ...defaults.claude, ...overrides.claude };
  }

  return { providers: defaults };
}

function prepareClaudeCodeFirstRunState({ root, projectDir }) {
  if (!root || !projectDir) return;
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.claude', 'settings.json'),
    `${JSON.stringify({ skipDangerousModePermissionPrompt: true }, null, 2)}\n`,
  );

  const now = new Date().toISOString();
  const projectState = {
    allowedTools: [],
    disabledMcpjsonServers: [],
    enabledMcpjsonServers: [],
    exampleFiles: [],
    hasClaudeMdExternalIncludesApproved: false,
    hasClaudeMdExternalIncludesWarningShown: false,
    hasCompletedProjectOnboarding: true,
    hasTrustDialogAccepted: true,
    lastAPIDuration: 0,
    lastAPIDurationWithoutRetries: 0,
    lastCost: 0,
    lastDuration: 0,
    lastLinesAdded: 0,
    lastLinesRemoved: 0,
    lastModelUsage: {},
    mcpContextUris: [],
    mcpServers: {},
    projectOnboardingSeenCount: 1,
  };

  const realProjectDir = fs.realpathSync.native?.(projectDir) || fs.realpathSync(projectDir);
  const projects = {
    [projectDir]: projectState,
  };
  if (realProjectDir !== projectDir) {
    projects[realProjectDir] = projectState;
  }

  fs.writeFileSync(
    path.join(root, '.claude.json'),
    `${JSON.stringify(
      {
        firstStartTime: now,
        hasCompletedOnboarding: true,
        customApiKeyResponses: { approved: [], rejected: [] },
        projects,
      },
      null,
      2,
    )}\n`,
  );
}

module.exports = { buildProviderSettings, prepareClaudeCodeFirstRunState };
