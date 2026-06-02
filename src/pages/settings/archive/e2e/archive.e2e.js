const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { test, expect, launchApp, closeApp } = require('../../../../tests/e2e');

test.describe('@archive', () => {
  test('one-click cleanup removes expired archived provider session files and rows', async () => {
    let expiredFile = '';
    let recentFile = '';
    const launched = await launchApp({
      cwd: path.resolve(__dirname, '../../../../../'),
      rootPrefix: 'cliswitch-archive-cleanup-',
      projectId: 'p1',
      projectName: 'ArchiveProject',
      seedDb: ({ db, projectId, projectDir, root }) => {
        const providerRoot = path.join(root, '.claude', 'projects', 'archive');
        fs.mkdirSync(providerRoot, { recursive: true });
        expiredFile = path.join(providerRoot, 'expired.jsonl');
        recentFile = path.join(providerRoot, 'recent.jsonl');
        fs.writeFileSync(expiredFile, '{}\n', 'utf8');
        fs.writeFileSync(recentFile, '{}\n', 'utf8');
        const expiredAt = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
        const recentAt = new Date().toISOString();
        const insert = db.prepare(`
          INSERT INTO sessions (
            id, project_id, title, provider, provider_session_id, cwd, session_file_path,
            status, sort_order, title_source, last_active_at, created_at, updated_at,
            is_archived, archived_at
          ) VALUES (?, ?, ?, 'claude', ?, ?, ?, 'exited', ?, 'manual', ?, ?, ?, 1, ?)
        `);
        insert.run(
          'expired-archived',
          projectId,
          'expired archived',
          'expired-archived',
          projectDir,
          expiredFile,
          2,
          expiredAt,
          expiredAt,
          expiredAt,
          expiredAt,
        );
        insert.run(
          'recent-archived',
          projectId,
          'recent archived',
          'recent-archived',
          projectDir,
          recentFile,
          1,
          recentAt,
          recentAt,
          recentAt,
          recentAt,
        );
      },
    });

    try {
      await launched.window.getByRole('button', { name: 'Settings' }).click();
      await launched.window.getByRole('tab', { name: 'Archive' }).click();
      await launched.window.getByRole('button', { name: '一键清理' }).click();
      await expect(launched.window.getByText(/已清理 1 条过期归档/)).toBeVisible();
      expect(fs.existsSync(expiredFile)).toBe(false);
      expect(fs.existsSync(recentFile)).toBe(true);

      const db = new DatabaseSync(launched.dbPath);
      try {
        const rows = db.prepare('SELECT id FROM sessions ORDER BY id').all();
        expect(rows.map((row) => row.id)).toEqual(['recent-archived']);
      } finally {
        db.close();
      }
    } finally {
      await closeApp(launched);
    }
  });
});
