const path = require('node:path');
const fs = require('node:fs');
const { test, expect, launchApp, closeApp } = require('../../../tests/e2e');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function seedClaudeSession(homeDir, projectDir, sid, title) {
  const sessionPath = path.join(homeDir, '.claude', 'projects', 'sync-demo', `${sid}.jsonl`);
  ensureDir(path.dirname(sessionPath));
  fs.writeFileSync(
    sessionPath,
    `${JSON.stringify({ cwd: projectDir, message: { role: 'user', content: title } })}\n`,
    'utf8',
  );
}

async function launchWorkspaceSyncApp() {
  const sidA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const sidB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const launched = await launchApp({
    cwd: path.resolve(__dirname, '../../../../'),
    rootPrefix: 'cliswitch-project-sync-',
    projectDirName: 'project-a',
    projectId: 'p1',
    projectName: 'ProjectA',
    prepareFs: ({ root, projectDir }) => {
      const projectBPath = path.join(root, 'project-b');
      ensureDir(projectBPath);
      fs.writeFileSync(path.join(projectDir, 'a.txt'), 'a', 'utf8');
      fs.writeFileSync(path.join(projectBPath, 'b.txt'), 'b', 'utf8');
      seedClaudeSession(root, projectDir, sidA, 'session-project-a');
      seedClaudeSession(root, projectBPath, sidB, 'session-project-b');
    },
    seedDb: ({ db, now, root }) => {
      const projectBPath = path.join(root, 'project-b');
      db.prepare(
        `INSERT INTO projects (id, name, path, default_provider, created_at, updated_at)
         VALUES (?, ?, ?, 'claude', ?, ?)`,
      ).run('p2', 'ProjectB', projectBPath, now, now);
    },
  });

  return {
    ...launched,
    sidA,
    sidB,
  };
}

async function syncProjectHistory(win, projectId, expectedSessionId) {
  await win.evaluate(
    async ({ pid }) => {
      await window.electronAPI.sessions.syncProject({ projectId: pid });
    },
    { pid: projectId },
  );
  await expect
    .poll(
      async () =>
        win.evaluate(
          async ({ projectId: pid, targetSessionId }) => {
            const rows = await window.electronAPI.sessions.list({ projectIds: [pid] });
            return rows.some(
              (item) => String(item?.sessionId || '') === String(targetSessionId || ''),
            );
          },
          { projectId, targetSessionId: expectedSessionId },
        ),
      { timeout: 60000, intervals: [300, 600, 1000] },
    )
    .toBe(true);
}

async function syncAllProjectHistory(win, sidA, sidB) {
  await syncProjectHistory(win, 'p1', sidA);
  await syncProjectHistory(win, 'p2', sidB);
  await win.reload();
  await win.waitForLoadState('domcontentloaded');
}

async function ensureExplorerVisible(win) {
  const expandBtn = win.getByRole('button', { name: '展开文件树' });
  if ((await expandBtn.count()) > 0) {
    await expandBtn.first().click({ force: true });
  }
}

test('switching project session updates explorer cwd and active terminal', async () => {
  const launched = await launchWorkspaceSyncApp();
  const { electronApp, window: win, sidA, sidB, root } = launched;
  try {
    await syncAllProjectHistory(win, sidA, sidB);
    await ensureExplorerVisible(win);

    await expect(win.getByTestId(`session-item-${sidA}`)).toBeVisible();
    await expect(win.getByTestId(`session-item-${sidB}`)).toBeVisible();

    await win.getByTestId(`session-item-${sidA}`).click();
    await expect(win.locator(`[data-session-id="${sidA}"]`)).toBeVisible();
    await expect(win.getByRole('treeitem', { name: 'a.txt' })).toBeVisible();

    await win.getByTestId(`session-item-${sidB}`).click();
    await expect(win.locator(`[data-session-id="${sidB}"]`)).toBeVisible();
    await expect(win.getByRole('treeitem', { name: 'b.txt' })).toBeVisible();
  } finally {
    await closeApp({ electronApp, root });
  }
});
