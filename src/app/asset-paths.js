const fs = require('node:fs');
const path = require('node:path');

function resolveAssetPathFrom(baseDir, ...parts) {
  const primary = path.resolve(baseDir, '..', 'assets', ...parts);
  if (fs.existsSync(primary)) return primary;
  return path.resolve(baseDir, 'assets', ...parts);
}

function pickExistingPath(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return '';
}

module.exports = {
  resolveAssetPathFrom,
  pickExistingPath,
};
