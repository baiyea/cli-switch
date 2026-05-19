const { spawnSync } = require('node:child_process');

function runElectronRequireCheck() {
  const electron = require('electron');
  const script = `
    require("better-sqlite3");
    require("node-pty");
  `;
  return spawnSync(electron, ['-e', script], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
    },
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

const check = runElectronRequireCheck();
if (check.status === 0) {
  console.log('[app-deps] Native dependencies are loadable; skip rebuild.');
  process.exit(0);
}

const reason = `${check.stderr || check.stdout || ''}`.trim();
if (reason) {
  console.warn(`[app-deps] Native dependency check failed, rebuilding...\n${reason}`);
} else {
  console.warn('[app-deps] Native dependency check failed, rebuilding...');
}

const rebuild = spawnSync(process.execPath, ['scripts/install-app-deps.js'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

process.exit(rebuild.status || 1);
