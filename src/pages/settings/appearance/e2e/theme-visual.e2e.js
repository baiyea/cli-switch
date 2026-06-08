const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('@playwright/test');
const { test, expect } = require('../../../../tests/e2e');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../../');
const RENDERER_URL = process.env.THEME_VISUAL_RENDERER_URL || 'http://localhost:5073';
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'docs/theme-visual');
const SETTINGS_TABS = {
  appearance: /Appearance|外观/,
  providers: /Providers|服务商/,
  archive: /Archive|归档/,
  tokenUsage: /Token usage|Token Usage|Token 用量|Token 统计/,
  about: /About|关于/,
};
const TOKEN_USAGE_TEXT = {
  totalTokens: /Total Tokens|总 Token|settings\.tokenUsage\.totalTokens/,
  project: /Project|项目|settings\.tokenUsage\.project/,
};
const THEME_OPTIONS = {
  dark: /暗色系|Dark|settings\.appearance\.theme\.dark\.label/,
  light: /亮色系|Light|settings\.appearance\.theme\.light\.label/,
};

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function resetOutputDir() {
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  ensureOutputDir();
}

function requestUrl(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode && res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForRenderer(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await requestUrl(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function startRendererIfNeeded() {
  let processRef = null;
  return {
    async ensure() {
      if (await waitForRenderer(RENDERER_URL, 1200)) return;
      processRef = spawn('pnpm', ['dev:renderer'], {
        cwd: PROJECT_ROOT,
        env: { ...process.env },
        shell: true,
        stdio: 'inherit',
      });
      const ready = await waitForRenderer(RENDERER_URL, 45000);
      if (!ready) throw new Error(`renderer server not reachable: ${RENDERER_URL}`);
    },
    stop() {
      if (!processRef) return;
      try {
        processRef.kill('SIGTERM');
      } catch {}
    },
  };
}

function resolveBrowserExecutable() {
  const candidates = [
    process.env.THEME_VISUAL_BROWSER,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

function installElectronApiMock(page) {
  return page.addInitScript(() => {
    const now = Date.now();
    let appearanceSettings = { themeMode: 'dark', locale: 'zh-CN' };
    const project = {
      id: 'theme-project',
      name: 'Cli Switch',
      path: '/Users/zeelin/WorkCode/cli-switch',
    };
    const sessions = [
      {
        sessionId: 'theme-session-1',
        projectId: project.id,
        provider: 'claude',
        providerSessionId: 'theme-session-1',
        name: 'theme-review',
        cwd: project.path,
        status: 'running',
        sortOrder: 20,
        createdAt: now - 120000,
        updatedAt: now - 30000,
      },
      {
        sessionId: 'theme-session-2',
        projectId: project.id,
        provider: 'codex',
        providerSessionId: 'theme-session-2',
        name: 'ui-audit',
        cwd: project.path,
        status: 'exited',
        sortOrder: 19,
        createdAt: now - 240000,
        updatedAt: now - 120000,
      },
    ];
    for (let index = 3; index <= 9; index += 1) {
      const providerCycle = ['gemini', 'codex', 'claude'];
      sessions.push({
        sessionId: `theme-session-${index}`,
        projectId: project.id,
        provider: providerCycle[(index - 3) % providerCycle.length],
        providerSessionId: `theme-session-${index}`,
        name: `hover-review-${index}`,
        cwd: project.path,
        status: index % 2 === 0 ? 'exited' : 'running',
        sortOrder: 10 - index,
        createdAt: now - index * 120000,
        updatedAt: now - index * 60000,
      });
    }

    const stats = {
      provider: 'claude',
      providerSessionId: 'theme-session-1',
      startedAt: now - 180000,
      endedAt: null,
      durationMs: 180000,
      rounds: 8,
      tokens: {
        input: 18200,
        output: 9400,
        cached: 4200,
        reasoning: 1200,
        tool: 800,
        total: 33800,
        available: true,
      },
    };

    const providerSettings = {
      providers: {
        claude: {
          defaultProfileId: 'deepseek-api',
          enabledProfileId: 'deepseek-api',
          profiles: [
            {
              id: 'deepseek-api',
              name: 'DeepSeek API',
              envVars: [
                { key: 'ANTHROPIC_AUTH_TOKEN', value: 'visual-token' },
                { key: 'ANTHROPIC_BASE_URL', value: 'https://api.deepseek.com/anthropic' },
                { key: 'ANTHROPIC_MODEL', value: 'deepseek-v4-pro' },
              ],
            },
          ],
        },
        codex: {
          defaultProfileId: 'codex-visual',
          enabledProfileId: 'codex-visual',
          profiles: [{ id: 'codex-visual', name: 'Codex Visual', envVars: [] }],
        },
        gemini: {
          defaultProfileId: 'gemini-visual',
          enabledProfileId: 'gemini-visual',
          profiles: [{ id: 'gemini-visual', name: 'Gemini Visual', envVars: [] }],
        },
      },
    };

    const listeners = new Set();
    window.electronAPI = {
      logs: {
        write: async () => ({ ok: true }),
      },
      appearance: {
        get: async () => appearanceSettings,
        set: async (payload) => {
          appearanceSettings = {
            ...appearanceSettings,
            ...(payload?.themeMode ? { themeMode: payload.themeMode } : {}),
            ...(payload?.locale ? { locale: payload.locale } : {}),
          };
          return appearanceSettings;
        },
      },
      projects: {
        list: async () => [project],
        add: async () => project,
        remove: async () => undefined,
      },
      sessions: {
        list: async () => sessions,
        create: async (payload) => {
          const created = {
            sessionId: `theme-session-${sessions.length + 1}`,
            projectId: payload?.projectId || project.id,
            provider: payload?.provider || 'claude',
            providerSessionId: `theme-session-${sessions.length + 1}`,
            name: payload?.title || 'new-theme-session',
            cwd: payload?.cwd || project.path,
            status: 'running',
            sortOrder: sessions.length + 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          sessions.unshift(created);
          return created;
        },
        start: async (payload) => {
          const found = sessions.find((item) => item.sessionId === payload?.sessionId) || sessions[0];
          return { ...found, status: 'running' };
        },
        rename: async () => ({ ok: true }),
        reorder: async () => ({ ok: true }),
        archive: async () => ({ ok: true }),
        restore: async () => ({ ok: true }),
        listArchived: async () => [
          {
            archiveId: 'claude:archived-theme',
            sessionId: 'archived-theme',
            provider: 'claude',
            projectId: project.id,
            name: 'archived visual review',
            cwd: project.path,
            archivedAt: Date.now() - 86400000,
          },
        ],
        cleanupExpiredArchived: async () => ({
          ok: true,
          retentionDays: 30,
          cutoffIso: new Date(Date.now() - 30 * 86400000).toISOString(),
          scanned: 1,
          deletedRecords: 0,
          deletedFiles: 0,
          missingFiles: 0,
          skipped: 1,
          cleanedFiles: [],
          warnings: [],
        }),
        stats: async () => ({ ok: true, stats }),
        suggestTitle: async () => ({ ok: true, title: 'theme-review', source: 'fallback' }),
        syncProject: async () => ({ ok: true, count: sessions.length }),
      },
      pty: {
        create: async () => ({ sessionId: 'theme-session-1', name: 'theme-review' }),
        snapshot: async () => ({
          sessionId: 'theme-session-1',
          data:
            '$ pnpm dev\\r\\n' +
            'vite renderer ready on 5073\\r\\n' +
            'theme system: dark / light / system\\r\\n' +
            'terminal palette follows effectiveTheme\\r\\n',
        }),
        input: () => undefined,
        resize: () => undefined,
        destroy: () => undefined,
        onData: (listener) => {
          listeners.add(listener);
          window.setTimeout(() => {
            listener({
              sessionId: 'theme-session-1',
              data: 'visual snapshot ready · theme tokens active\\r\\n',
            });
          }, 800);
          return () => listeners.delete(listener);
        },
        onExit: () => () => undefined,
      },
      files: {
        readTree: async () => ({
          cwd: project.path,
          isGitRepo: true,
          items: [
            {
              name: 'src',
              path: `${project.path}/src`,
              type: 'directory',
              children: [
                { name: 'pages', path: `${project.path}/src/pages`, type: 'directory' },
                { name: 'styles.css', path: `${project.path}/src/styles.css`, type: 'file', gitStatus: 'M' },
              ],
            },
            { name: 'docs', path: `${project.path}/docs`, type: 'directory' },
            { name: 'package.json', path: `${project.path}/package.json`, type: 'file' },
          ],
        }),
        openPath: async () => ({ ok: true }),
        open: async () => ({ ok: true }),
        saveAttachmentImage: async () => ({ ok: true, path: '/tmp/theme.png' }),
        saveAttachmentImageBuffer: async () => ({ ok: true, path: '/tmp/theme.png' }),
      },
      settings: {
        getClaude: async () => providerSettings,
        saveClaude: async (payload) => payload,
        testProvider: async () => ({ ok: true, message: 'visual provider ok' }),
        startProviderOAuthLogin: async () => ({ ok: true }),
        probeProviderOAuth: async () => ({ ok: true }),
        getProviderOAuthLinks: async () => ({ ok: true, authUrls: [], allUrls: [] }),
        testProviderProxy: async () => ({ ok: true }),
        cleanRuntimeData: async () => ({ ok: true }),
      },
      tokenUsage: {
        summary: async () => ({
          ok: true,
          summary: {
            filters: {
              range: '30d',
              projectId: '',
              provider: '',
              profileId: '',
              modelName: '',
            },
            projects: [
              {
                projectId: project.id,
                projectName: project.name,
                totalTokens: 33800,
                sessionCount: 2,
              },
            ],
            sessions: [
              {
                sessionId: 'theme-session-1',
                title: 'theme-review',
                projectName: project.name,
                provider: 'claude',
                modelName: 'deepseek-v4-pro',
                totalTokens: 33800,
                lastActiveAt: new Date(now - 30000).toISOString(),
              },
            ],
            models: [
              {
                provider: 'claude',
                profileId: 'deepseek-api',
                modelName: 'deepseek-v4-pro',
                profileName: 'DeepSeek API',
                apiBaseHost: 'api.deepseek.com',
                runCount: 8,
                totalTokens: 33800,
              },
            ],
            daily: [
              { date: '2026-05-12', totalTokens: 4200 },
              { date: '2026-05-13', totalTokens: 6800 },
              { date: '2026-05-14', totalTokens: 5100 },
              { date: '2026-05-15', totalTokens: 7400 },
              { date: '2026-05-16', totalTokens: 10300 },
            ],
            totals: {
              inputTokens: 18200,
              outputTokens: 9400,
              cachedTokens: 4200,
              reasoningTokens: 1200,
              toolTokens: 800,
              totalTokens: 33800,
              rounds: 8,
              runCount: 8,
              sessionCount: 2,
            },
            status: {
              running: false,
              lastStartedAt: '',
              lastFinishedAt: new Date(now - 30000).toISOString(),
              scanned: 2,
              updated: 2,
              skipped: 0,
              failed: 0,
              error: '',
            },
          },
        }),
        refresh: async () => ({ ok: true, scanned: 1, updated: 1, errors: [] }),
        status: async () => ({ running: false }),
      },
      skillgen: {
        run: async () => ({ ok: true, summary: 'visual skill mock' }),
      },
      sessionsDump: {
        run: async () => ({ ok: true, filePath: '/tmp/sessions.md' }),
      },
      windowControls: {
        setTrafficLightPosition: async () => ({ ok: true }),
        openExternal: async () => ({ ok: true }),
        minimize: async () => ({ ok: true }),
        toggleMaximize: async () => ({ ok: true }),
        close: async () => ({ ok: true }),
      },
    };
  });
}

async function openSettings(page, tabName) {
  console.log(`[theme-visual] open settings ${tabName || ''}`);
  await page.getByRole('button', { name: 'Settings' }).click({ timeout: 5000 });
  await expect(page.locator('.settings-modal')).toBeVisible({ timeout: 10000 });
  if (tabName) {
    await page.getByRole('tab', { name: tabName }).click({ timeout: 5000 });
    await expect(page.getByRole('tabpanel', { name: tabName })).toBeVisible({ timeout: 5000 });
  }
}

async function closeSettings(page) {
  const closeButton = page.locator('.settings-modal-close-btn');
  if (await closeButton.count()) {
    await closeButton.click();
    await expect(page.locator('.settings-modal')).toHaveCount(0);
  }
}

function parseRgbColor(color) {
  const match = String(color).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([.\d]+))?/);
  if (!match) return null;

  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    alpha: match[4] === undefined ? 1 : Number(match[4]),
  };
}

function relativeLuminance({ r, g, b }) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function expectColorNotDark(locator, cssProperty, label) {
  await expect(locator, `${label} should be visible before color assertion`).toBeVisible({
    timeout: 2500,
  });

  const color = await locator.evaluate(
    (node, property) => getComputedStyle(node).getPropertyValue(property),
    cssProperty,
  );
  const rgb = parseRgbColor(color);

  expect(rgb, `parse ${cssProperty} for ${label}: ${color}`).not.toBeNull();
  expect(
    !(rgb.alpha > 0.01 && relativeLuminance(rgb) < 120),
    `${label} ${cssProperty} should not be dark in light theme: ${color}`,
  ).toBe(true);
}

async function expectColorNotLight(locator, cssProperty, label) {
  await expect(locator, `${label} should be visible before color assertion`).toBeVisible({
    timeout: 2500,
  });

  const color = await locator.evaluate(
    (node, property) => getComputedStyle(node).getPropertyValue(property),
    cssProperty,
  );
  const rgb = parseRgbColor(color);

  expect(rgb, `parse ${cssProperty} for ${label}: ${color}`).not.toBeNull();
  expect(
    !(rgb.alpha > 0.01 && relativeLuminance(rgb) > 190),
    `${label} ${cssProperty} should not be light in light theme: ${color}`,
  ).toBe(true);
}

async function expectBorderVisible(locator, label) {
  await expect(locator, `${label} should be visible before border assertion`).toBeVisible({
    timeout: 2500,
  });

  const border = await locator.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      color: style.borderTopColor,
      width: Number.parseFloat(style.borderTopWidth || '0'),
    };
  });
  const rgb = parseRgbColor(border.color);

  expect(border.width, `${label} border should have width`).toBeGreaterThan(0);
  expect(rgb, `parse border color for ${label}: ${border.color}`).not.toBeNull();
  expect(rgb.alpha, `${label} border should not be transparent: ${border.color}`).toBeGreaterThan(
    0.05,
  );
}

function expectHoverColorMatchesTheme(color, mode, label) {
  const rgb = parseRgbColor(color);

  expect(rgb, `parse hover background color for ${label}: ${color}`).not.toBeNull();

  const luminance = relativeLuminance(rgb);
  if (mode === 'light') {
    expect(
      !(rgb.alpha > 0.01 && luminance < 90),
      `${label} light hover background should not be dark: ${color}`,
    ).toBe(true);
    return;
  }

  expect(
    !(rgb.alpha > 0.01 && luminance > 190),
    `${label} dark hover background should not be light: ${color}`,
  ).toBe(true);
}

async function expectHoverBackgroundTheme(locator, mode, label) {
  console.log(`[theme-visual:hover] ${mode} ${label}`);
  await expect(locator, `${label} should be visible before hover`).toBeVisible({ timeout: 2500 });
  await locator.scrollIntoViewIfNeeded({ timeout: 2500 });
  await locator.hover({ timeout: 2500 });
  await locator.page().waitForTimeout(120);
  await expect(locator, `${label} should expose computed hover background`).toHaveCSS(
    'background-color',
    /rgba?/,
    { timeout: 2500 },
  );

  const backgroundColor = await locator.evaluate(
    (node) => getComputedStyle(node).backgroundColor,
  );

  expectHoverColorMatchesTheme(backgroundColor, mode, label);
}

async function prepareProjectIconButtons(page) {
  const projectNode = page.getByTestId('project-theme-project');
  const projectHead = projectNode.locator('.project-head');

  await projectHead.hover();
  return projectNode;
}

async function expectHomeIconHoverTheme(page, mode) {
  const projectNode = await prepareProjectIconButtons(page);

  const hoverTargets = [
    {
      label: 'sidebar add project icon',
      locator: page.getByRole('button', { name: '添加项目' }),
    },
    {
      label: 'sidebar collapse icon',
      locator: page.getByRole('button', { name: '收缩会话栏' }),
    },
    {
      label: 'project create primary icon',
      locator: projectNode.getByRole('button', { name: /新建会话/ }),
    },
    {
      label: 'project create type icon',
      locator: projectNode.getByRole('button', { name: '选择会话类型' }),
    },
    {
      label: 'active session archive icon',
      locator: page.getByTestId('session-item-theme-session-1').locator('.session-archive-btn'),
    },
    {
      label: 'hidden sessions expand button',
      locator: page.getByRole('button', { name: /展开显示/ }),
    },
    {
      label: 'sidebar settings icon button',
      locator: page.getByRole('button', { name: 'Settings' }),
    },
    {
      label: 'toolbar skill icon',
      locator: page.getByRole('button', { name: '生成Skill' }),
    },
    {
      label: 'toolbar dump icon',
      locator: page.getByRole('button', { name: '导出会话内容' }),
    },
    {
      label: 'toolbar archive icon',
      locator: page.getByRole('button', { name: '归档当前会话' }),
    },
    {
      label: 'toolbar explorer icon',
      locator: page.getByRole('button', { name: /展开文件树|关闭文件树/ }),
    },
  ];

  for (const target of hoverTargets) {
    await expectHoverBackgroundTheme(target.locator, mode, target.label);
  }

  await prepareProjectIconButtons(page);
  await projectNode.getByRole('button', { name: '选择会话类型' }).click({ timeout: 2500 });
  await expectHoverBackgroundTheme(
    projectNode.locator('.project-create-item').first(),
    mode,
    'project create menu item',
  );

  await page.getByRole('button', { name: '收缩会话栏' }).click({ timeout: 2500 });
  const expandSidebarButton = page.getByRole('button', { name: '展开会话栏' });
  await expectHoverBackgroundTheme(expandSidebarButton, mode, 'toolbar expand sidebar icon');
  await expandSidebarButton.click({ timeout: 2500 });
  await expect(page.getByRole('button', { name: '收缩会话栏' })).toBeVisible();
}

async function selectTheme(page, mode) {
  console.log(`[theme-visual] select theme ${mode}`);
  await openSettings(page, SETTINGS_TABS.appearance);
  const label = THEME_OPTIONS[mode];
  const option = page
    .getByRole('tabpanel', { name: SETTINGS_TABS.appearance })
    .locator('.appearance-option')
    .filter({ hasText: label });

  await option.click({ timeout: 5000 });
  await expect(option).toHaveAttribute('aria-checked', 'true', { timeout: 5000 });
  await expect(page.locator('html')).toHaveAttribute('data-theme', mode, { timeout: 5000 });
  await page.waitForFunction((expectedTheme) => {
    const root = document.documentElement;
    if (root.dataset.theme !== expectedTheme) return false;

    const modal = document.querySelector('.settings-modal');
    const card = document.querySelector('.appearance-card');
    if (!modal || !card) return false;

    const modalBg = getComputedStyle(modal).backgroundColor;
    const cardBg = getComputedStyle(card).backgroundColor;

    if (expectedTheme === 'dark') {
      return modalBg !== cardBg && !modalBg.includes('248, 242, 232');
    }

    return modalBg !== cardBg && !modalBg.includes('10, 10, 11');
  }, mode, { timeout: 5000 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function screenshot(page, fileName) {
  console.log(`[theme-visual] screenshot ${fileName}`);
  ensureOutputDir();
  const outputPath = path.join(OUTPUT_DIR, fileName);
  await page.screenshot({
    path: outputPath,
    fullPage: false,
  });
  const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
  const previous = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    : [];
  const stat = fs.statSync(outputPath);
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(
      [
        ...previous,
        {
          fileName,
          path: outputPath,
          size: stat.size,
          createdAt: new Date().toISOString(),
        },
      ],
      null,
      2,
    )}\n`,
  );
}

async function openSettingsTab(page, tabName) {
  console.log(`[theme-visual] switch settings tab ${tabName}`);
  await page.getByRole('tab', { name: tabName }).click({ timeout: 5000 });
  await expect(page.getByRole('tabpanel', { name: tabName })).toBeVisible({ timeout: 5000 });
}

async function expectLightTokenUsageTheme(page) {
  const panel = page.getByRole('tabpanel', { name: SETTINGS_TABS.tokenUsage });
  const metricCard = panel
    .getByText(TOKEN_USAGE_TEXT.totalTokens)
    .locator('xpath=ancestor::div[contains(@class, "rounded-lg") and contains(@class, "border")][1]');
  const projectSelect = panel.getByRole('combobox', { name: TOKEN_USAGE_TEXT.project });
  const modelRow = panel.locator('.token-usage-model-row').filter({ hasText: 'deepseek-v4-pro' }).first();
  const dailyBars = panel.locator('.token-usage-panel').first().locator('[aria-label]');

  await expectBorderVisible(metricCard, 'token usage metric card');
  await expectBorderVisible(projectSelect, 'token usage project select');
  await expectColorNotDark(projectSelect, 'background-color', 'token usage project select');
  await expect(modelRow).toBeVisible();
  await expect(dailyBars).toHaveCount(5);
}

async function expectLightAboutTheme(page) {
  const panel = page.getByRole('tabpanel', { name: SETTINGS_TABS.about });
  const title = panel.getByText('Cli-Switch');
  const platformValue = panel.getByText('Electron + React + TypeScript');

  await expectColorNotLight(title, 'color', 'about title');
  await expectColorNotLight(platformValue, 'color', 'about platform value');
}

async function expectLightProviderIconPalette(page) {
  const providers = ['claude', 'codex', 'gemini'];

  for (const provider of providers) {
    const icon = page
      .locator(`.session-item:visible .session-provider-icon.provider-icon-${provider}`)
      .first();

    await expect(icon, `${provider} session provider icon should be visible`).toBeVisible({
      timeout: 2500,
    });
    await expect(icon, `${provider} session provider icon should use a light-theme filter`).toHaveCSS(
      'filter',
      /sepia|saturate|brightness|contrast/,
      { timeout: 2500 },
    );
  }
}

test.describe('@appearance @theme-visual', () => {
  test('captures key screens for dark and light theme review', async () => {
    const server = startRendererIfNeeded();
    let browser;

    await server.ensure();
    resetOutputDir();
    console.log(`[theme-visual] output directory: ${OUTPUT_DIR}`);

    try {
      const executablePath = resolveBrowserExecutable();
      browser = await chromium.launch({
        headless: true,
        ...(executablePath ? { executablePath } : {}),
      });
      const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
      await installElectronApiMock(page);

      await page.goto(RENDERER_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await expect(page.getByTestId('terminal-viewport')).toBeVisible({ timeout: 30000 });
      await page.waitForTimeout(800);

      await selectTheme(page, 'dark');
      await screenshot(page, 'theme-dark-settings-appearance.png');
      await openSettingsTab(page, SETTINGS_TABS.providers);
      await screenshot(page, 'theme-dark-settings-providers.png');
      await closeSettings(page);
      await screenshot(page, 'theme-dark-home.png');
      await expectHomeIconHoverTheme(page, 'dark');
      await screenshot(page, 'theme-dark-home-hover-icons.png');

      await selectTheme(page, 'light');
      await screenshot(page, 'theme-light-settings-appearance.png');
      await openSettingsTab(page, SETTINGS_TABS.providers);
      await screenshot(page, 'theme-light-settings-providers.png');
      await openSettingsTab(page, SETTINGS_TABS.tokenUsage);
      await expectLightTokenUsageTheme(page);
      await screenshot(page, 'theme-light-settings-token-usage.png');
      await openSettingsTab(page, SETTINGS_TABS.about);
      await expectLightAboutTheme(page);
      await screenshot(page, 'theme-light-settings-about.png');
      await closeSettings(page);
      await screenshot(page, 'theme-light-home.png');
      await expectLightProviderIconPalette(page);
      await expectHomeIconHoverTheme(page, 'light');
      await screenshot(page, 'theme-light-home-hover-icons.png');

      await openSettings(page, SETTINGS_TABS.archive);
      await screenshot(page, 'theme-light-settings-archive.png');
    } finally {
      if (browser) await browser.close();
      server.stop();
    }
  });
});
