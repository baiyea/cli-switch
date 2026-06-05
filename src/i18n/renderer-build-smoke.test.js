const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('renderer entry can be built as a Vite client input', async () => {
  const { build } = await import('vite');
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-switch-i18n-renderer-'));

  try {
    await build({
      configFile: false,
      logLevel: 'silent',
      root: process.cwd(),
      build: {
        outDir,
        emptyOutDir: true,
        rollupOptions: {
          input: path.resolve(__dirname, 'renderer.js'),
        },
      },
    });

    const files = await fs.readdir(path.join(outDir, 'assets'));
    assert.ok(files.some((file) => file.endsWith('.js')));
  } finally {
    await fs.rm(outDir, { force: true, recursive: true });
  }
});
