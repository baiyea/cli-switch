const path = require('node:path');
const fs = require('node:fs');
const { test, expect, launchApp, closeApp } = require('../../../../tests/e2e');

test.describe('@file-tree', () => {
  async function ensureExplorerVisible(win) {
    const expandBtn = win.getByRole('button', { name: '展开文件树' });
    if ((await expandBtn.count()) > 0) {
      await expandBtn.first().click({ force: true });
    }
  }

  test('file tree expands, collapses, and opens files', async () => {
    const launched = await launchApp({
      cwd: path.resolve(__dirname, '../../../../../'),
      rootPrefix: 'cliswitch-file-tree-',
      prepareFs: ({ projectDir }) => {
        fs.mkdirSync(path.join(projectDir, 'docs'), { recursive: true });
        fs.writeFileSync(path.join(projectDir, 'README.md'), '# root\n', 'utf8');
        fs.writeFileSync(path.join(projectDir, 'docs', 'guide.md'), '# guide\n', 'utf8');
      },
    });
    const { electronApp, window: win, root, projectDir } = launched;

    try {
      await ensureExplorerVisible(win);
      await expect(win.getByRole('treeitem', { name: /README\.md/ })).toBeVisible();
      await expect(win.getByRole('treeitem', { name: /docs/ })).toBeVisible();
      await expect(win.getByRole('treeitem', { name: /guide\.md/ })).toHaveCount(0);

      const docsRow = win.getByRole('treeitem', { name: /docs/ });
      await docsRow.click();
      await expect(win.getByRole('treeitem', { name: /guide\.md/ })).toBeVisible();

      await docsRow.click();
      await expect(win.getByRole('treeitem', { name: /guide\.md/ })).toHaveCount(0);

      await electronApp.evaluate(({ shell }) => {
        globalThis.__openedExplorerPaths = [];
        shell.openPath = async (target) => {
          globalThis.__openedExplorerPaths.push(target);
          return '';
        };
      });

      await docsRow.click();
      await win.getByRole('treeitem', { name: /guide\.md/ }).dblclick();

      await expect
        .poll(() => electronApp.evaluate(() => globalThis.__openedExplorerPaths || []))
        .toContain(path.join(projectDir, 'docs', 'guide.md'));
    } finally {
      await closeApp({ electronApp, root });
    }
  });
});
