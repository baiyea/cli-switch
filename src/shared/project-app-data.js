const path = require('node:path');

const { APP_ID } = require('./app-config');

function resolveProjectAppDataDir(projectPath, appId = APP_ID) {
  return path.join(path.resolve(projectPath), `.${appId}`);
}

function resolveProjectAppDataPath(projectPath, ...segments) {
  return path.join(resolveProjectAppDataDir(projectPath), ...segments);
}

function resolveProjectAppRelativePath(...segments) {
  return path.posix.join(`.${APP_ID}`, ...segments.map((segment) => String(segment || '')));
}

module.exports = {
  resolveProjectAppDataDir,
  resolveProjectAppDataPath,
  resolveProjectAppRelativePath,
};
