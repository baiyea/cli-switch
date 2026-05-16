const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const env = { ...process.env };

if (process.platform === 'win32' && /pnpm\.cjs$/i.test(env.npm_execpath || '')) {
  const pnpmCmd = path.join(path.dirname(process.execPath), 'pnpm.cmd');

  if (fs.existsSync(pnpmCmd)) {
    env.npm_execpath = pnpmCmd;
  }
}

const electronBuilderCli = require.resolve('electron-builder/out/cli/cli.js');
const result = spawnSync(process.execPath, [electronBuilderCli, 'install-app-deps'], {
  env,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status || 0);
