const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { APP_ID } = require('./app-config');
const {
  resolveProjectAppDataDir,
  resolveProjectAppDataPath,
  resolveProjectAppRelativePath,
} = require('./project-app-data');

test('project app data resolver uses the APP_ID hidden directory', () => {
  const projectPath = path.join(path.sep, 'tmp', 'demo-project');

  assert.equal(resolveProjectAppDataDir(projectPath), path.join(projectPath, `.${APP_ID}`));
  assert.equal(
    resolveProjectAppDataPath(projectPath, 'attachments', 'a.png'),
    path.join(projectPath, `.${APP_ID}`, 'attachments', 'a.png'),
  );
  assert.equal(
    resolveProjectAppRelativePath('attachments', 'a.png'),
    path.join(`.${APP_ID}`, 'attachments', 'a.png'),
  );
});
