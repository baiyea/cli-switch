const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function normalizeStatusPath(rawPath) {
  const renamed = rawPath.includes(' -> ') ? rawPath.split(' -> ').pop() : rawPath;
  const trimmed = String(renamed || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\/g, '/');
  }
  return trimmed.replace(/\\/g, '/');
}

function toGitBadgeCode(xy) {
  const code = String(xy || '  ');
  if (code === '??') return 'U';
  if (code.includes('U')) return 'U';
  if (code.includes('D')) return 'D';
  if (code.includes('A')) return 'A';
  return 'M';
}

function gitBadgePriority(code) {
  if (code === 'U') return 4;
  if (code === 'D') return 3;
  if (code === 'A') return 2;
  return 1;
}

function getGitStatusSnapshot(cwd) {
  const repoProbe = spawnSync('git', ['-C', cwd, 'rev-parse', '--is-inside-work-tree'], {
    encoding: 'utf8',
  });
  if (repoProbe.status !== 0) {
    return { isRepo: false, byPath: new Map() };
  }

  const statusProbe = spawnSync(
    'git',
    ['-C', cwd, '-c', 'core.quotepath=false', 'status', '--porcelain=v1', '--untracked-files=all'],
    { encoding: 'utf8' },
  );
  if (statusProbe.status !== 0) {
    return { isRepo: true, byPath: new Map() };
  }

  const byPath = new Map();
  const lines = String(statusProbe.stdout || '')
    .split(/\r?\n/)
    .filter(Boolean);
  for (const line of lines) {
    const xy = line.slice(0, 2);
    const raw = line.slice(3).trim();
    if (!raw) continue;
    const pathname = normalizeStatusPath(raw);
    if (!pathname) continue;
    const code = toGitBadgeCode(xy);
    const previous = byPath.get(pathname);
    if (!previous || gitBadgePriority(code) >= gitBadgePriority(previous)) {
      byPath.set(pathname, code);
    }
  }

  return { isRepo: true, byPath };
}

function buildFileTree(cwd, depth) {
  const IGNORE = new Set(['.git', '.DS_Store', 'node_modules']);
  const gitInfo = getGitStatusSnapshot(cwd);

  function walk(dir, level) {
    if (level > depth) return [];
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }

    const nodes = entries
      .filter((entry) => !IGNORE.has(entry.name))
      .map((entry) => {
        const full = path.join(dir, entry.name);
        const relative = path.relative(cwd, full).replace(/\\/g, '/');
        if (entry.isDirectory()) {
          const children = walk(full, level + 1);
          return {
            name: entry.name,
            path: full,
            type: 'directory',
            hasGitChanges: children.some((child) => child.hasGitChanges || !!child.gitStatus),
            children,
          };
        }
        return {
          name: entry.name,
          path: full,
          type: 'file',
          gitStatus: gitInfo.byPath.get(relative) || '',
        };
      });

    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return nodes;
  }
  return { isGitRepo: gitInfo.isRepo, items: walk(cwd, 1) };
}

module.exports = { buildFileTree };
