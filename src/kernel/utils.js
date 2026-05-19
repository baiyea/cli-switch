const fs = require('node:fs');
const path = require('node:path');

function ensureDirSafe(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function clearDirectoryContentsSafe(dirPath, report) {
  if (!dirPath || !fs.existsSync(dirPath)) return;
  let entries = [];
  try {
    entries = fs.readdirSync(dirPath);
  } catch (error) {
    report.warnings.push(`读取目录失败: ${dirPath} (${error.message || String(error)})`);
    return;
  }
  for (const entry of entries) {
    const targetPath = path.join(dirPath, entry);
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      report.cleanedFiles.push(targetPath);
    } catch (error) {
      report.warnings.push(`删除失败: ${targetPath} (${error.message || String(error)})`);
    }
  }
  report.cleanedDirectories.push(dirPath);
}

function removeFileSafe(filePath, report) {
  if (!filePath || !fs.existsSync(filePath)) return;
  try {
    fs.rmSync(filePath, { force: true });
    report.cleanedFiles.push(filePath);
  } catch (error) {
    report.warnings.push(`删除失败: ${filePath} (${error.message || String(error)})`);
  }
}

function tryReadJsonFile(filePath, fallback = {}) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return fallback;
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonFileSafe(filePath, value) {
  ensureDirSafe(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function toClaudeProjectKey(cwd) {
  const value = String(cwd || '').trim();
  if (!value) return '';
  return path.resolve(value).replace(/\\/g, '/');
}

function encodeClaudeProjectDir(cwd) {
  return toClaudeProjectKey(cwd).replace(/\//g, '_');
}

function readTailLines(filePath, maxBytes = 256 * 1024, maxLines = 500) {
  try {
    const stats = fs.statSync(filePath);
    const start = Math.max(0, stats.size - maxBytes);
    const buffer = fs.readFileSync(filePath, { start, encoding: 'utf8' });
    const lines = buffer.split('\n');
    if (lines.length > maxLines) return lines.slice(-maxLines);
    return lines;
  } catch {
    return [];
  }
}

function readHeadLines(filePath, maxBytes = 128 * 1024, maxLines = 300) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(maxBytes);
    const bytesRead = fs.readSync(fd, buffer, 0, maxBytes, 0);
    fs.closeSync(fd);
    const text = buffer.toString('utf8', 0, bytesRead);
    const lines = text.split('\n');
    if (lines.length > maxLines) return lines.slice(0, maxLines);
    return lines;
  } catch {
    return [];
  }
}

module.exports = {
  ensureDirSafe,
  clearDirectoryContentsSafe,
  removeFileSafe,
  tryReadJsonFile,
  writeJsonFileSafe,
  toClaudeProjectKey,
  encodeClaudeProjectDir,
  readTailLines,
  readHeadLines,
};
