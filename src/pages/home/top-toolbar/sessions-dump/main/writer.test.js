const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { APP_ID } = require('../../../../../shared/app-config');
const { resolveSessionsRoot } = require('./writer');

test('resolveSessionsRoot uses the shared project APP_ID directory', () => {
  const projectPath = path.join(path.sep, 'tmp', 'demo-project');

  assert.equal(resolveSessionsRoot(projectPath), path.join(projectPath, `.${APP_ID}`, 'sessions'));
});
