const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { APP_ID } = require('../../../../../shared/app-config');
const { openStateDb } = require('./index');

test('openStateDb stores skillgen state under the project APP_ID directory', () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cliswitch-skillgen-index-'));
  const state = openStateDb(projectPath);

  try {
    assert.equal(state.dbPath, path.join(projectPath, `.${APP_ID}`, 'skillgen', 'state.db'));
    assert.equal(state.runLogsDir, path.join(projectPath, `.${APP_ID}`, 'skillgen', 'run_logs'));
    assert.equal(
      state.candidatesDir,
      path.join(projectPath, `.${APP_ID}`, 'skillgen', 'candidates'),
    );
    assert.equal(fs.existsSync(state.dbPath), true);
  } finally {
    state.close();
    fs.rmSync(projectPath, { recursive: true, force: true });
  }
});
