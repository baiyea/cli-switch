const { test, expect, launchApp, closeApp } = require('../../../../tests/e2e');
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

function buildOauthOnlyProviderSettings() {
  return {
    providers: {
      claude: {
        defaultProfileId: 'oauth-login',
        enabledProfileId: '',
        profiles: [{ id: 'oauth-login', name: 'OAuth 登录', envVars: [] }],
      },
      codex: {
        defaultProfileId: 'oauth-login',
        enabledProfileId: '',
        profiles: [{ id: 'oauth-login', name: 'OAuth 登录', envVars: [] }],
      },
      gemini: {
        defaultProfileId: 'oauth-login',
        enabledProfileId: '',
        profiles: [{ id: 'oauth-login', name: 'OAuth 登录', envVars: [] }],
      },
    },
  };
}

function queryProviderSessionRows(dbPath, providerId) {
  const db = new DatabaseSync(dbPath);
  try {
    const fixedSessionId = `${providerId}-tests`;
    const activeRows = db
      .prepare(
        `SELECT id, provider, provider_session_id, title, status, is_archived
         FROM sessions
         WHERE provider = ? AND is_archived = 0
         ORDER BY created_at ASC`,
      )
      .all(providerId);
    const fixedRows = activeRows.filter(
      (row) => String(row.provider_session_id || '') === fixedSessionId,
    );
    return {
      allActiveRows: activeRows,
      fixedRows,
      fixedSessionId,
    };
  } finally {
    db.close();
  }
}

async function launchAppWithFixtures() {
  const launched = await launchApp({
    cwd: path.resolve(__dirname, '../../../../../'),
    rootPrefix: 'cliswitch-provider-oauth-reuse-',
    projectDirName: 'project-a',
    projectId: 'p1',
    projectName: 'ProviderOAuthReuseProject',
    providerSettings: buildOauthOnlyProviderSettings(),
  });
  return {
    app: launched.electronApp,
    win: launched.window,
    root: launched.root,
    dbPath: launched.dbPath,
  };
}

async function openProviderSettings(win) {
  const settingsModal = win.locator('.settings-modal');
  const settingsTitle = win.locator('.settings-modal-title');
  await expect
    .poll(
      async () => {
        if (await settingsModal.isVisible().catch(() => false)) return 'modal';
        if ((await win.locator('.sidebar-settings-btn').count()) > 0) return 'button';
        return 'none';
      },
      { timeout: 60000, intervals: [200, 500, 1000] },
    )
    .not.toBe('none');

  if (!(await settingsModal.isVisible().catch(() => false))) {
    const settingsButton = win.locator('.sidebar-settings-btn').first();
    await expect(settingsButton).toBeVisible({ timeout: 60000 });
    await settingsButton.click();
  }

  await expect(settingsModal).toBeVisible({ timeout: 60000 });
  await expect(settingsTitle).toHaveText(/providers/i, { timeout: 60000 });
}

async function startProviderOAuthLogin(win, provider) {
  await win.getByRole('button', { name: provider.label }).click();

  const profileSelect = win.locator('select').first();
  await expect(profileSelect).toBeVisible({ timeout: 30000 });
  await profileSelect.selectOption('oauth-login');

  await expect(win.getByText('使用 CLI OAuth 登录')).toBeVisible({ timeout: 30000 });
  await win.getByRole('button', { name: '获取OAuth登陆链接' }).click();
}

async function expectSingleFixedSession(win, dbPath, providerId) {
  const fixedSessionId = `${providerId}-tests`;

  await expect
    .poll(async () => win.locator(`[data-session-id="${fixedSessionId}"]`).count(), {
      timeout: 60000,
      intervals: [500, 1000, 2000],
    })
    .toBe(1);

  await expect
    .poll(
      async () => {
        const rows = queryProviderSessionRows(dbPath, providerId);
        return {
          fixedCount: rows.fixedRows.length,
          activeCount: rows.allActiveRows.length,
          title: rows.fixedRows[0]?.title || '',
        };
      },
      { timeout: 60000, intervals: [500, 1000, 2000] },
    )
    .toMatchObject({
      fixedCount: 1,
      activeCount: 1,
      title: fixedSessionId,
    });

  const rows = queryProviderSessionRows(dbPath, providerId);
  return rows.fixedRows[0] || null;
}

const PROVIDERS = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex CLI' },
  { id: 'gemini', label: 'Gemini CLI' },
];

test.describe('Provider OAuth test session reuse', () => {
  test.describe.configure({ mode: 'serial' });

  for (const provider of PROVIDERS) {
    test(`${provider.id} oauth login reuses fixed singleton session record`, async () => {
      const { app, win, root, dbPath } = await launchAppWithFixtures();

      try {
        await openProviderSettings(win);

        await startProviderOAuthLogin(win, provider);
        const firstRow = await expectSingleFixedSession(win, dbPath, provider.id);
        expect(firstRow).toBeTruthy();

        await startProviderOAuthLogin(win, provider);
        const secondRow = await expectSingleFixedSession(win, dbPath, provider.id);
        expect(secondRow).toBeTruthy();

        expect(secondRow.id).toBe(firstRow.id);
        expect(secondRow.provider_session_id).toBe(`${provider.id}-tests`);
      } finally {
        await closeApp({ electronApp: app, root });
      }
    });
  }
});
