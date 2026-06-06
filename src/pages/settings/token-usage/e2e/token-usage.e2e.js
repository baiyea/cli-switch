const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { test, expect, launchApp, closeApp } = require('../../../../tests/e2e');

function writeClaudeSession(filePath, cwd) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [
    JSON.stringify({
      type: 'user',
      timestamp: '2026-06-04T01:00:00.000Z',
      cwd,
      message: { role: 'user', content: 'hello' },
    }),
    JSON.stringify({
      type: 'assistant',
      timestamp: '2026-06-04T01:01:00.000Z',
      cwd,
      uuid: 'm1',
      message: {
        id: 'm1',
        role: 'assistant',
        content: 'world',
        usage: {
          input_tokens: 100,
          output_tokens: 40,
          cache_read_input_tokens: 10,
          reasoning_output_tokens: 5,
          total_tokens: 140,
        },
      },
    }),
  ];
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

test.describe('@token-usage', () => {
  test('shows token usage settings from registered session files', async () => {
    const sid = 'token-session-1';
    let sessionPath = '';
    const launched = await launchApp({
      cwd: path.resolve(__dirname, '../../../../../'),
      rootPrefix: 'cliswitch-token-usage-',
      projectDirName: 'token-project',
      projectId: 'p-token',
      projectName: 'TokenProject',
      defaultProvider: 'claude',
      prepareFs: ({ root, projectDir }) => {
        sessionPath = path.join(root, '.claude', 'projects', 'token-project', `${sid}.jsonl`);
        writeClaudeSession(sessionPath, projectDir);
      },
      seedDb: ({ db, projectId, projectDir, root, now }) => {
        sessionPath = path.join(root, '.claude', 'projects', 'token-project', `${sid}.jsonl`);
        db.prepare(`
          INSERT INTO sessions (
            id, project_id, title, provider, provider_session_id, cwd, session_file_path,
            status, sort_order, title_source, last_active_at, created_at, updated_at,
            is_archived, archived_at
          ) VALUES (
            's-token-1', ?, 'Token fixture', 'claude', ?, ?, ?, 'exited',
            1, 'manual', '2026-06-04T01:02:00.000Z', ?, ?, 0, NULL
          )
        `).run(projectId, sid, projectDir, sessionPath, now, now);

        db.prepare(`
          INSERT INTO token_usage_runs (
            id, project_id, session_id, provider, provider_session_id,
            profile_id, profile_name, model_name, api_base_host, env_fingerprint,
            session_file_path, run_started_at, run_ended_at, created_at, updated_at
          ) VALUES (
            'run-token-1', ?, 's-token-1', 'claude', ?,
            'kimi', 'Kimi', 'kimi-for-coding', 'api.moonshot.cn/anthropic', 'fingerprint',
            ?, '2026-06-04T01:00:00.000Z', NULL, ?, ?
          )
        `).run(projectId, sid, sessionPath, now, now);
      },
    });

    try {
      const { window: win } = launched;
      await win.getByRole('button', { name: 'Settings' }).click();
      const tokenTab = await win.evaluate(() =>
        window.__ZEELIN_TEST__?.t('settings.sideNav.tokenUsage'),
      );
      if (!tokenTab) throw new Error('i18n not initialized — __ZEELIN_TEST__ is unavailable');
      await win.getByRole('tab', { name: tokenTab }).click();
      const panel = win.getByRole('tabpanel', { name: tokenTab });
      await expect(panel).toBeVisible();
      const scanButton = panel.getByRole('button', { name: /重新扫描|扫描中/ });
      await expect(scanButton).toBeVisible();
      if (await scanButton.isEnabled()) {
        await scanButton.click();
      }
      const modelSummary = panel.locator('section').filter({ hasText: '模型汇总' });
      await expect(modelSummary.getByText('kimi-for-coding')).toBeVisible({ timeout: 30000 });
      await expect(modelSummary.getByText('0.00M')).toBeVisible();
      await expect(panel.locator('[title^="06/04"]').first()).toHaveAttribute('title', /0\.00M/);
      const filterBar = panel.getByRole('group', { name: 'Token 使用筛选' });
      await expect(filterBar).toContainText(/项目[\s\S]*Provider[\s\S]*Profile[\s\S]*时间/);
      await expect(panel.getByRole('combobox', { name: '项目' })).toHaveValue('p-token');
      await expect(panel.getByRole('combobox', { name: 'Provider' })).toHaveValue('claude');
      const profileSelect = panel.getByRole('combobox', { name: 'Profile' });
      await expect(profileSelect).toHaveValue('kimi');
      await expect(profileSelect.getByRole('option', { name: 'Kimi' })).toHaveCount(1);
      await expect(panel.getByRole('option', { name: 'TokenProject' })).toHaveCount(1);
      await expect(panel.getByText('1 个会话')).toBeVisible();

      const db = new DatabaseSync(launched.dbPath);
      try {
        const runCount = db.prepare('SELECT COUNT(*) AS count FROM token_usage_runs').get();
        expect(Number(runCount.count)).toBe(1);
        const snapshot = db
          .prepare('SELECT total_tokens, input_tokens, output_tokens FROM token_usage_snapshots WHERE run_id = ?')
          .get('run-token-1');
        expect(Number(snapshot.total_tokens)).toBe(140);
        expect(Number(snapshot.input_tokens)).toBe(100);
        expect(Number(snapshot.output_tokens)).toBe(40);
      } finally {
        db.close();
      }
    } finally {
      await closeApp(launched);
    }
  });
});
