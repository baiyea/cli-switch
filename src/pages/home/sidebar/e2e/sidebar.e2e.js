const path = require('node:path');
const { test, expect, launchApp, closeApp } = require('../../../../tests/e2e');

function seedSessions({ db, now, projectId, projectDir }) {
  const insert = db.prepare(`
    INSERT INTO sessions (
      id, project_id, title, provider, provider_session_id, cwd, session_file_path,
      status, sort_order, title_source, last_active_at, created_at, updated_at,
      is_archived, archived_at
    ) VALUES (?, ?, ?, 'claude', ?, ?, NULL, 'exited', ?, 'manual', ?, ?, ?, 0, NULL)
  `);
  for (let index = 1; index <= 7; index += 1) {
    const sid = `sidebar-session-${index}`;
    insert.run(
      sid,
      projectId,
      `sidebar session ${index}`,
      sid,
      projectDir,
      8 - index,
      now,
      now,
      now,
    );
  }
}

async function getVisibleSessionNames(project) {
  return project.locator('.session-item-name').evaluateAll((nodes) =>
    nodes.map((node) => node.textContent?.trim() || ''),
  );
}

test.describe('@sidebar', () => {
  test('project create menu toggles long session lists without scrolling to the bottom toggle', async () => {
    const launched = await launchApp({
      cwd: path.resolve(__dirname, '../../../../../'),
      rootPrefix: 'cliswitch-sidebar-',
      projectId: 'p1',
      projectName: 'SidebarProject',
      seedDb: seedSessions,
    });

    try {
      const project = launched.window.getByTestId('project-p1');
      await expect(project.getByTestId('session-item-sidebar-session-1')).toBeVisible();
      await expect(project.getByTestId('session-item-sidebar-session-5')).toBeVisible();
      await expect(project.getByTestId('session-item-sidebar-session-6')).toHaveCount(0);
      await expect(project.locator('.project-session-toggle')).toHaveCount(0);

      await project.locator('.project-head').hover();
      await project.getByRole('button', { name: '选择会话类型' }).click();
      await project.locator('.project-create-menu').getByRole('button', { name: '展开全部会话' }).click();

      await expect(project.getByTestId('session-item-sidebar-session-6')).toBeVisible();
      await expect(project.getByTestId('session-item-sidebar-session-7')).toBeVisible();

      await project.locator('.project-head').hover();
      await project.getByRole('button', { name: '选择会话类型' }).click();
      await project.locator('.project-create-menu').getByRole('button', { name: '收起会话列表' }).click();

      await expect(project.getByTestId('session-item-sidebar-session-6')).toHaveCount(0);
      await expect(project.getByTestId('session-item-sidebar-session-1')).toBeVisible();
    } finally {
      await closeApp(launched);
    }
  });

  test('session drag order is persisted in DB and survives session switching', async () => {
    const launched = await launchApp({
      cwd: path.resolve(__dirname, '../../../../../'),
      rootPrefix: 'cliswitch-sidebar-reorder-',
      projectId: 'p1',
      projectName: 'SidebarProject',
      seedDb: seedSessions,
    });

    try {
      const { window: win } = launched;
      const project = win.getByTestId('project-p1');
      await expect(project.getByTestId('session-item-sidebar-session-1')).toBeVisible();

      await win
        .getByTestId('session-item-sidebar-session-5')
        .dragTo(win.getByTestId('session-item-sidebar-session-1'));

      await expect
        .poll(() => getVisibleSessionNames(project))
        .toEqual([
          'sidebar session 5',
          'sidebar session 1',
          'sidebar session 2',
          'sidebar session 3',
          'sidebar session 4',
        ]);

      await expect
        .poll(() =>
          win.evaluate(async () => {
            const rows = await window.electronAPI.sessions.list({ projectIds: ['p1'] });
            return rows.slice(0, 5).map((row) => row.sessionId);
          }),
        )
        .toEqual([
          'sidebar-session-5',
          'sidebar-session-1',
          'sidebar-session-2',
          'sidebar-session-3',
          'sidebar-session-4',
        ]);

      await project.getByTestId('session-item-sidebar-session-2').click();
      await expect(project.getByTestId('session-item-sidebar-session-2')).toHaveClass(/active/);
      await expect
        .poll(() => getVisibleSessionNames(project))
        .toEqual([
          'sidebar session 5',
          'sidebar session 1',
          'sidebar session 2',
          'sidebar session 3',
          'sidebar session 4',
        ]);
    } finally {
      await closeApp(launched);
    }
  });
});
