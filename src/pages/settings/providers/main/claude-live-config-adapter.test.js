const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createLiveSyncPaths } = require('./live-sync-paths');
const { createClaudeLiveConfigAdapter } = require('./claude-live-config-adapter');

function setupClaudeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-switch-claude-live-'));
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  return { home, paths: createLiveSyncPaths({ homedir: () => home }) };
}

test('claude live sync merges env and preserves existing settings fields', () => {
  const { paths } = setupClaudeHome();
  const settingsPath = paths.claudeSettingsPath();
  fs.writeFileSync(
    settingsPath,
    JSON.stringify(
      {
        permissions: { allow: ['Bash(git status)'] },
        env: {
          EXISTING: '1',
          CLAUDE_CODE_ENABLE_TELEMETRY: '1',
        },
        cliswitch: {
          liveSync: {
            provider: 'claude',
            profileId: 'old-profile',
          },
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  const adapter = createClaudeLiveConfigAdapter({
    now: () => Date.UTC(2026, 5, 11, 12, 0, 0),
  });
  const result = adapter.sync({
    profile: { id: 'deepseek-api', name: 'DeepSeek API' },
    env: {
      ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
      CLAUDE_CODE_ENABLE_TELEMETRY: '0',
    },
    paths,
    source: 'provider-test',
  });

  assert.deepEqual(result, { ok: true, configPath: settingsPath, changed: true });
  const next = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  assert.deepEqual(next.permissions, { allow: ['Bash(git status)'] });
  assert.equal(next.env.EXISTING, '1');
  assert.equal(next.env.ANTHROPIC_BASE_URL, 'https://api.deepseek.com/anthropic');
  assert.equal(next.env.CLAUDE_CODE_ENABLE_TELEMETRY, '0');
  assert.equal(next.cliswitch.liveSync.provider, 'claude');
  assert.equal(next.cliswitch.liveSync.profileId, 'deepseek-api');
  assert.equal(next.cliswitch.liveSync.source, 'provider-test');
  assert.match(next.cliswitch.liveSync.updatedAt, /^2026-06-11T12:00:00\.000Z$/);

  const backupDir = path.join(path.dirname(settingsPath), 'backups');
  const backups = fs.readdirSync(backupDir);
  assert.equal(backups.length, 1);
  assert.match(backups[0], /^settings\.before-cliswitch-live-sync\./);
  assert.equal(fs.existsSync(path.join(path.dirname(settingsPath), 'backups')), true);
});

test('claude live sync returns changed false when the serialized file already matches', () => {
  const { paths } = setupClaudeHome();
  const settingsPath = paths.claudeSettingsPath();
  const adapter = createClaudeLiveConfigAdapter({
    now: () => Date.UTC(2026, 5, 11, 12, 0, 0),
  });

  const first = adapter.sync({
    profile: { id: 'deepseek-api' },
    env: {
      ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
    },
    paths,
    source: 'provider-test',
  });
  const second = adapter.sync({
    profile: { id: 'deepseek-api' },
    env: {
      ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
    },
    paths,
    source: 'provider-test',
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.changed, false);
  assert.equal(fs.existsSync(path.join(path.dirname(settingsPath), 'backups')), false);
});
