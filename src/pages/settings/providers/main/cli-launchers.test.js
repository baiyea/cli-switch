const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  getLaunchCommandForProvider,
  getResumeCommandForProvider,
} = require('./cli-launchers');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function touch(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '');
}

function codexRuntimeShape() {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === 'darwin' && arch === 'arm64') {
    return {
      packageName: '@openai/codex-darwin-arm64',
      triple: 'aarch64-apple-darwin',
      binaryName: 'codex',
    };
  }
  if (platform === 'darwin') {
    return {
      packageName: '@openai/codex-darwin-x64',
      triple: 'x86_64-apple-darwin',
      binaryName: 'codex',
    };
  }
  if (platform === 'win32' && arch === 'arm64') {
    return {
      packageName: '@openai/codex-win32-arm64',
      triple: 'aarch64-pc-windows-msvc',
      binaryName: 'codex.exe',
    };
  }
  if (platform === 'win32') {
    return {
      packageName: '@openai/codex-win32-x64',
      triple: 'x86_64-pc-windows-msvc',
      binaryName: 'codex.exe',
    };
  }
  if (platform === 'linux' && arch === 'arm64') {
    return {
      packageName: '@openai/codex-linux-arm64',
      triple: 'aarch64-unknown-linux-musl',
      binaryName: 'codex',
    };
  }
  return {
    packageName: '@openai/codex-linux-x64',
    triple: 'x86_64-unknown-linux-musl',
    binaryName: 'codex',
  };
}

function setupRuntime(t) {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-switch-launchers-'));
  const previousRuntimeDir = process.env.ZEELIN_CLI_RUNTIME_DIR;
  process.env.ZEELIN_CLI_RUNTIME_DIR = runtimeDir;
  t.after(() => {
    if (previousRuntimeDir == null) delete process.env.ZEELIN_CLI_RUNTIME_DIR;
    else process.env.ZEELIN_CLI_RUNTIME_DIR = previousRuntimeDir;
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  });

  writeJson(path.join(runtimeDir, 'node_modules', '@anthropic-ai', 'claude-code', 'package.json'), {
    name: '@anthropic-ai/claude-code',
    version: '2.1.185',
    bin: { claude: 'bin/claude.exe' },
  });
  touch(path.join(runtimeDir, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'));

  const codex = codexRuntimeShape();
  writeJson(path.join(runtimeDir, 'node_modules', ...codex.packageName.split('/'), 'package.json'), {
    name: codex.packageName,
    version: '0.141.0',
  });
  touch(
    path.join(
      runtimeDir,
      'node_modules',
      ...codex.packageName.split('/'),
      'vendor',
      codex.triple,
      'bin',
      codex.binaryName,
    ),
  );
  touch(
    path.join(
      runtimeDir,
      'node_modules',
      ...codex.packageName.split('/'),
      'vendor',
      codex.triple,
      'codex-path',
      'rg',
    ),
  );

  writeJson(path.join(runtimeDir, 'node_modules', '@google', 'gemini-cli', 'package.json'), {
    name: '@google/gemini-cli',
    version: '0.47.0',
    bin: { gemini: 'bundle/gemini.js' },
  });
  touch(path.join(runtimeDir, 'node_modules', '@google', 'gemini-cli', 'bundle', 'gemini.js'));

  return { runtimeDir, codex };
}

test('claude launch command uses the npm package native binary from latest runtime', (t) => {
  const { runtimeDir } = setupRuntime(t);
  const command = getLaunchCommandForProvider('claude');

  assert.match(command, /claude-code/);
  assert.match(command, /bin[\\/]claude\.exe/);
  assert.match(command, /--dangerously-skip-permissions/);
  assert.doesNotMatch(command, /cli\.js/);
  assert.match(command, new RegExp(runtimeDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('codex resume command supports latest native vendor bin layout', (t) => {
  const { codex } = setupRuntime(t);
  const command = getResumeCommandForProvider('codex', '019ecf93-b092-7d43-883a-ca8e81bf2e80');

  assert.match(command, new RegExp(`vendor[\\\\/]${codex.triple}[\\\\/]bin[\\\\/]${codex.binaryName}`));
  assert.match(command, /codex-path/);
  assert.match(command, /resume/);
  assert.match(command, /--dangerously-bypass-approvals-and-sandbox/);
});

test('gemini launch command reads package bin instead of the removed dist entrypoint', (t) => {
  setupRuntime(t);
  const command = getLaunchCommandForProvider('gemini');

  assert.match(command, /bundle[\\/]gemini\.js/);
  assert.match(command, /--approval-mode/);
  assert.match(command, /yolo/);
  assert.doesNotMatch(command, /dist[\\/]index\.js/);
});
