const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const { test, expect, launchApp, closeApp } = require('../../../../tests/e2e');

function readAppearanceSettings(dbPath) {
  const db = new DatabaseSync(dbPath);
  try {
    const row = db
      .prepare("SELECT value FROM app_settings WHERE key = 'appearance_settings'")
      .get();
    if (!row?.value) return {};

    try {
      return JSON.parse(String(row.value)) || {};
    } catch {
      return {};
    }
  } finally {
    db.close();
  }
}

function readAppearanceThemeMode(dbPath) {
  return readAppearanceSettings(dbPath).themeMode || '';
}

function readAppearanceLocale(dbPath) {
  return readAppearanceSettings(dbPath).locale || '';
}

async function launchAppearanceApp() {
  return launchApp({
    cwd: path.resolve(__dirname, '../../../../../'),
    rootPrefix: 'cliswitch-appearance-',
    projectDirName: 'appearance-project',
    projectId: 'p-appearance',
    projectName: 'AppearanceProject',
    unsetEnvKeys: ['VITE_DEV_SERVER_URL'],
  });
}

async function openAppearanceSettings(win) {
  await win
    .getByRole('button', { name: /Settings|设置/i })
    .first()
    .click();
  await expect(win.locator('.settings-modal')).toBeVisible({ timeout: 90000 });
  await win.getByRole('tab', { name: /Appearance|外观/i }).click();

  const panel = win.getByRole('tabpanel', { name: /Appearance|外观/i });
  await expect(panel).toBeVisible();
  return panel;
}

test.describe('@appearance', () => {
  test('updates document theme when selecting light and dark modes', async () => {
    const launched = await launchAppearanceApp();

    try {
      const { window: win } = launched;
      const panel = await openAppearanceSettings(win);

      await panel.getByRole('radio', { name: /亮色系|Light/i }).click();
      await expect(win.locator('html')).toHaveAttribute('data-theme', 'light');
      await expect
        .poll(() => readAppearanceThemeMode(launched.dbPath), {
          message: 'appearance settings persist light theme mode',
          timeout: 30000,
        })
        .toBe('light');
      await expect(panel.getByText(/保存失败|Save failed|Failed/i)).toHaveCount(0);

      await panel.getByRole('radio', { name: /暗色系|Dark/i }).click();
      await expect(win.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect
        .poll(() => readAppearanceThemeMode(launched.dbPath), {
          message: 'appearance settings persist dark theme mode',
          timeout: 30000,
        })
        .toBe('dark');
      await expect(panel.getByText(/保存失败|Save failed|Failed/i)).toHaveCount(0);
    } finally {
      await closeApp(launched);
    }
  });

  test('switches settings language', async () => {
    const launched = await launchAppearanceApp();

    try {
      const { window: win } = launched;
      const panel = await openAppearanceSettings(win);
      const localeSelect = panel.getByTestId('appearance-locale-select');

      await localeSelect.selectOption('en-US');
      await expect
        .poll(() => readAppearanceLocale(launched.dbPath), {
          message: 'appearance settings persist en-US locale',
          timeout: 30000,
        })
        .toBe('en-US');
      await expect(win.getByRole('tab', { name: 'Token Usage' })).toBeVisible();

      await localeSelect.selectOption('zh-CN');
      await expect
        .poll(() => readAppearanceLocale(launched.dbPath), {
          message: 'appearance settings persist zh-CN locale',
          timeout: 30000,
        })
        .toBe('zh-CN');
      await expect(win.getByRole('tab', { name: 'Token 统计' })).toBeVisible();
    } finally {
      await closeApp(launched);
    }
  });
});
