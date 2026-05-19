const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const docsDir = path.join(projectRoot, 'docs');
const e2eArtifactsRoot = path.join(docsDir, 'test-results');
const e2eSummaryFile = path.join(e2eArtifactsRoot, 'summary.md');
const e2eDetailsDir = path.join(e2eArtifactsRoot, 'details');
const e2eCaseDetailsDir = path.join(e2eDetailsDir, 'cases');
const e2eRawArtifactsDir = path.join(e2eDetailsDir, 'raw');
const uiDebugArtifactsDir = path.join(docsDir, 'debug-artifacts');
const legacyRootTestResultsDir = path.join(projectRoot, 'test-results');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function resetDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function writeFile(filePath, contents) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, contents);
}

function sanitizeSegment(value) {
  return (
    String(value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'artifact'
  );
}

module.exports = {
  ensureDir,
  resetDir,
  sanitizeSegment,
  writeFile,
  docsDir,
  e2eArtifactsRoot,
  e2eSummaryFile,
  e2eDetailsDir,
  e2eCaseDetailsDir,
  e2eRawArtifactsDir,
  uiDebugArtifactsDir,
  legacyRootTestResultsDir,
};
