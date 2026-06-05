const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  buildReleasePayload,
  confirmUpload,
  createGitHubApiPath,
  createUploadAssetUrl,
  fileNameHasVersion,
  parseDotEnv,
  parseGitHubRemoteUrl,
  resolveGitHubRepository,
  runCli,
  selectReleaseArtifacts,
  shouldAutoConfirm,
  versionToTagName,
} = require('./github-release');

test('versionToTagName prefixes semantic version with v', () => {
  assert.equal(versionToTagName('0.1.8'), 'v0.1.8');
});

test('parseGitHubRemoteUrl supports SSH GitHub remote', () => {
  assert.deepEqual(parseGitHubRemoteUrl('git@github.com:baiyea/cli-switch.git'), {
    owner: 'baiyea',
    repo: 'cli-switch',
  });
});

test('parseGitHubRemoteUrl supports HTTPS GitHub remote', () => {
  assert.deepEqual(parseGitHubRemoteUrl('https://github.com/baiyea/cli-switch.git'), {
    owner: 'baiyea',
    repo: 'cli-switch',
  });
});

test('parseGitHubRemoteUrl rejects non-repository GitHub paths', () => {
  assert.throws(
    () => parseGitHubRemoteUrl('https://github.com/baiyea/cli-switch/issues'),
    /Unsupported GitHub remote URL/,
  );
});

test('resolveGitHubRepository prefers GITHUB_REPOSITORY over remote URLs', () => {
  assert.deepEqual(
    resolveGitHubRepository(
      {
        GITHUB_REMOTE_URL: 'https://github.com/other/ignored.git',
        GITHUB_REPOSITORY: 'degao/cli-switch',
      },
      () => 'https://github.com/origin/ignored.git',
    ),
    {
      owner: 'degao',
      repo: 'cli-switch',
    },
  );
});

test('resolveGitHubRepository falls back to GITHUB_REMOTE_URL before git origin', () => {
  assert.deepEqual(
    resolveGitHubRepository(
      {
        GITHUB_REMOTE_URL: 'https://github.com/degao/cli-switch.git',
      },
      () => 'https://github.com/origin/ignored.git',
    ),
    {
      owner: 'degao',
      repo: 'cli-switch',
    },
  );
});

test('resolveGitHubRepository fails clearly when only origin is non-GitHub', () => {
  assert.throws(
    () => resolveGitHubRepository({}, () => 'https://gitee.com/degao/cli-switch.git'),
    /GITHUB_REPOSITORY=owner\/repo/,
  );
});

test('selectReleaseArtifacts selects only current version installers and matching latest yml files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-switch-release-'));

  try {
    const files = {
      'cli-switch-0.1.8-arm64.dmg': '',
      'cli-switch-0.1.8-x64.dmg': '',
      'cli-switch Setup 0.1.8.exe': '',
      'cli-switch-0.1.7-arm64.dmg': '',
      'cli-switch-0.1.80-arm64.dmg': '',
      'cli-switch-10.1.8-arm64.dmg': '',
      'cli-switch Setup 0.1.7.exe': '',
      'latest-mac.yml': 'version: 0.1.8\npath: cli-switch-0.1.8-arm64.dmg\n',
      'latest.yml': 'version: 0.1.8\npath: cli-switch Setup 0.1.8.exe\n',
      'latest-old.yml': 'version: 0.1.7\npath: cli-switch-0.1.7-arm64.dmg\n',
      'latest-next.yml': 'version: 0.1.80\npath: cli-switch-0.1.80-arm64.dmg\n',
      'builder-debug.yml': 'version: 0.1.8\n',
    };

    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), content);
    }

    assert.deepEqual(selectReleaseArtifacts(dir, '0.1.8'), [
      path.join(dir, 'cli-switch Setup 0.1.8.exe'),
      path.join(dir, 'cli-switch-0.1.8-arm64.dmg'),
      path.join(dir, 'cli-switch-0.1.8-x64.dmg'),
      path.join(dir, 'latest-mac.yml'),
      path.join(dir, 'latest.yml'),
    ]);
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

test('fileNameHasVersion requires non-alphanumeric version boundaries', () => {
  assert.equal(fileNameHasVersion('Cli-Switch-mac-arm64-0.1.8.dmg', '0.1.8'), true);
  assert.equal(fileNameHasVersion('Cli-Switch-mac-arm64-0.1.80.dmg', '0.1.8'), false);
  assert.equal(fileNameHasVersion('Cli-Switch-mac-arm64-10.1.8.dmg', '0.1.8'), false);
});

test('parseDotEnv reads GITHUB_TOKEN without exposing comments or quotes', () => {
  assert.equal(
    parseDotEnv('OTHER=value\nGITHUB_TOKEN="ghp_example#not-comment"\n# GITHUB_TOKEN=ignored\n')
      .GITHUB_TOKEN,
    'ghp_example#not-comment',
  );
});

test('buildReleasePayload creates a normal release payload for the current HEAD', () => {
  assert.deepEqual(buildReleasePayload('v0.1.8', 'abc123'), {
    tag_name: 'v0.1.8',
    target_commitish: 'abc123',
    name: 'v0.1.8',
    draft: false,
    prerelease: false,
  });
});

test('createUploadAssetUrl strips upload template and encodes asset name', () => {
  assert.equal(
    createUploadAssetUrl(
      'https://uploads.github.com/repos/baiyea/cli-switch/releases/1/assets{?name,label}',
      'cli-switch Setup 0.1.8.exe',
    ),
    'https://uploads.github.com/repos/baiyea/cli-switch/releases/1/assets?name=cli-switch%20Setup%200.1.8.exe',
  );
});

test('createGitHubApiPath accepts only GitHub API asset URLs', () => {
  assert.equal(
    createGitHubApiPath('https://api.github.com/repos/baiyea/cli-switch/releases/assets/9'),
    '/repos/baiyea/cli-switch/releases/assets/9',
  );
  assert.throws(
    () => createGitHubApiPath('https://example.com/repos/baiyea/cli-switch/releases/assets/9'),
    /Unexpected GitHub API host/,
  );
});

test('shouldAutoConfirm requires explicit yes flag or env', () => {
  assert.equal(shouldAutoConfirm({}, []), false);
  assert.equal(shouldAutoConfirm({}, ['--yes']), true);
  assert.equal(shouldAutoConfirm({ GITHUB_RELEASE_YES: '1' }, []), true);
});

test('confirmUpload fails fast on non-interactive stdin without explicit yes', async () => {
  const stdout = createOutputSink();

  await assert.rejects(
    () =>
      confirmUpload({
        askYesNo: async () => true,
        stdin: { isTTY: false },
        stdout,
      }),
    /non-interactive stdin/,
  );
});

test('runCli updates an existing release and replaces same-name assets', async () => {
  const fixture = createReleaseFixture();
  const calls = [];
  const client = createMockClient({
    requestJson: async (method, requestPath, body) => {
      calls.push({ body, method, path: requestPath, type: 'json' });

      if (method === 'GET' && requestPath.endsWith('/commits/head123')) {
        return { sha: 'head123' };
      }

      if (method === 'GET' && requestPath.endsWith('/releases/tags/v0.1.8')) {
        return {
          assets: [
            {
              name: 'Cli-Switch-mac-arm64-0.1.8.dmg',
              url: 'https://api.github.com/repos/baiyea/cli-switch/releases/assets/9',
            },
          ],
          id: 1,
          upload_url:
            'https://uploads.github.com/repos/baiyea/cli-switch/releases/1/assets{?name,label}',
        };
      }

      if (method === 'GET' && requestPath.endsWith('/git/ref/tags/v0.1.8')) {
        return { object: { sha: 'head123', type: 'commit' } };
      }

      if (method === 'PATCH' && requestPath.endsWith('/releases/1')) {
        return {
          assets: [
            {
              name: 'Cli-Switch-mac-arm64-0.1.8.dmg',
              url: 'https://api.github.com/repos/baiyea/cli-switch/releases/assets/9',
            },
          ],
          id: 1,
          upload_url:
            'https://uploads.github.com/repos/baiyea/cli-switch/releases/1/assets{?name,label}',
        };
      }

      if (method === 'DELETE' && requestPath.endsWith('/releases/assets/9')) {
        return null;
      }

      throw new Error(`Unexpected requestJson ${method} ${requestPath}`);
    },
    requestBuffer: async (method, uploadUrl, buffer, contentType) => {
      calls.push({ buffer, contentType, method, type: 'buffer', uploadUrl });
      return null;
    },
  });

  try {
    const result = await runCli({
      argv: ['--yes'],
      client,
      cwd: fixture.cwd,
      getGitHeadSha: () => 'head123',
      stdout: createOutputSink(),
    });

    assert.equal(result.cancelled, false);
    assert.deepEqual(
      calls.map((call) => `${call.type}:${call.method}:${call.path || call.uploadUrl}`),
      [
        'json:GET:/repos/baiyea/cli-switch/commits/head123',
        'json:GET:/repos/baiyea/cli-switch/releases/tags/v0.1.8',
        'json:GET:/repos/baiyea/cli-switch/git/ref/tags/v0.1.8',
        'json:PATCH:/repos/baiyea/cli-switch/releases/1',
        'json:DELETE:/repos/baiyea/cli-switch/releases/assets/9',
        'buffer:POST:https://uploads.github.com/repos/baiyea/cli-switch/releases/1/assets?name=Cli-Switch-mac-arm64-0.1.8.dmg',
      ],
    );
    assert.equal(calls.at(-1).contentType, 'application/x-apple-diskimage');
  } finally {
    fixture.cleanup();
  }
});

test('runCli creates a release only after the local HEAD exists on GitHub', async () => {
  const fixture = createReleaseFixture();
  const calls = [];
  const client = createMockClient({
    requestJson: async (method, requestPath, body) => {
      calls.push({ body, method, path: requestPath, type: 'json' });

      if (method === 'GET' && requestPath.endsWith('/commits/head123')) {
        return { sha: 'head123' };
      }

      if (method === 'GET' && requestPath.endsWith('/releases/tags/v0.1.8')) {
        throw new Error(`GitHub API ${method} ${requestPath} failed: 404 Not Found`);
      }

      if (method === 'POST' && requestPath.endsWith('/releases')) {
        assert.deepEqual(body, {
          draft: false,
          name: 'v0.1.8',
          prerelease: false,
          tag_name: 'v0.1.8',
          target_commitish: 'head123',
        });
        return {
          assets: [],
          id: 2,
          upload_url:
            'https://uploads.github.com/repos/baiyea/cli-switch/releases/2/assets{?name,label}',
        };
      }

      throw new Error(`Unexpected requestJson ${method} ${requestPath}`);
    },
    requestBuffer: async (method, uploadUrl) => {
      calls.push({ method, type: 'buffer', uploadUrl });
      return null;
    },
  });

  try {
    await runCli({
      argv: ['--yes'],
      client,
      cwd: fixture.cwd,
      getGitHeadSha: () => 'head123',
      stdout: createOutputSink(),
    });

    assert.deepEqual(
      calls.map((call) => `${call.type}:${call.method}:${call.path || call.uploadUrl}`),
      [
        'json:GET:/repos/baiyea/cli-switch/commits/head123',
        'json:GET:/repos/baiyea/cli-switch/releases/tags/v0.1.8',
        'json:POST:/repos/baiyea/cli-switch/releases',
        'buffer:POST:https://uploads.github.com/repos/baiyea/cli-switch/releases/2/assets?name=Cli-Switch-mac-arm64-0.1.8.dmg',
      ],
    );
  } finally {
    fixture.cleanup();
  }
});

test('runCli refuses to update an existing release when tag points to a different commit', async () => {
  const fixture = createReleaseFixture();
  const client = createMockClient({
    requestJson: async (method, requestPath) => {
      if (method === 'GET' && requestPath.endsWith('/commits/head123')) {
        return { sha: 'head123' };
      }

      if (method === 'GET' && requestPath.endsWith('/releases/tags/v0.1.8')) {
        return {
          assets: [],
          id: 1,
          upload_url:
            'https://uploads.github.com/repos/baiyea/cli-switch/releases/1/assets{?name,label}',
        };
      }

      if (method === 'GET' && requestPath.endsWith('/git/ref/tags/v0.1.8')) {
        return { object: { sha: 'other-head', type: 'commit' } };
      }

      throw new Error(`Unexpected requestJson ${method} ${requestPath}`);
    },
    requestBuffer: async () => {
      throw new Error('requestBuffer should not be called');
    },
  });

  try {
    await assert.rejects(
      () =>
        runCli({
          argv: ['--yes'],
          client,
          cwd: fixture.cwd,
          getGitHeadSha: () => 'head123',
          stdout: createOutputSink(),
        }),
      /release target resolves to head123/,
    );
  } finally {
    fixture.cleanup();
  }
});

test('runCli can target an existing GitHub branch without using local HEAD', async () => {
  const fixture = createReleaseFixture({
    env: 'GITHUB_TOKEN=ghp_test\nGITHUB_REPOSITORY=baiyea/cli-switch\nGITHUB_RELEASE_TARGET=main\n',
  });
  const calls = [];
  const client = createMockClient({
    requestJson: async (method, requestPath, body) => {
      calls.push({ body, method, path: requestPath, type: 'json' });

      if (method === 'GET' && requestPath.endsWith('/commits/main')) {
        return { sha: 'remote-main-sha' };
      }

      if (method === 'GET' && requestPath.endsWith('/releases/tags/v0.1.8')) {
        throw new Error(`GitHub API ${method} ${requestPath} failed: 404 Not Found`);
      }

      if (method === 'POST' && requestPath.endsWith('/releases')) {
        assert.equal(body.target_commitish, 'remote-main-sha');
        return {
          assets: [],
          id: 3,
          upload_url:
            'https://uploads.github.com/repos/baiyea/cli-switch/releases/3/assets{?name,label}',
        };
      }

      throw new Error(`Unexpected requestJson ${method} ${requestPath}`);
    },
    requestBuffer: async (method, uploadUrl) => {
      calls.push({ method, type: 'buffer', uploadUrl });
      return null;
    },
  });

  try {
    await runCli({
      argv: ['--yes'],
      client,
      cwd: fixture.cwd,
      getGitHeadSha: () => {
        throw new Error('local HEAD should not be used');
      },
      stdout: createOutputSink(),
    });

    assert.deepEqual(
      calls.map((call) => `${call.type}:${call.method}:${call.path || call.uploadUrl}`),
      [
        'json:GET:/repos/baiyea/cli-switch/commits/main',
        'json:GET:/repos/baiyea/cli-switch/releases/tags/v0.1.8',
        'json:POST:/repos/baiyea/cli-switch/releases',
        'buffer:POST:https://uploads.github.com/repos/baiyea/cli-switch/releases/3/assets?name=Cli-Switch-mac-arm64-0.1.8.dmg',
      ],
    );
  } finally {
    fixture.cleanup();
  }
});

function createReleaseFixture(options = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-switch-release-fixture-'));
  const releaseDir = path.join(cwd, 'release');
  fs.mkdirSync(releaseDir);
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ version: '0.1.8' }));
  fs.writeFileSync(
    path.join(cwd, '.env'),
    options.env || 'GITHUB_TOKEN=ghp_test\nGITHUB_REPOSITORY=baiyea/cli-switch\n',
  );
  fs.writeFileSync(path.join(releaseDir, 'Cli-Switch-mac-arm64-0.1.8.dmg'), 'dmg');
  fs.writeFileSync(path.join(releaseDir, 'Cli-Switch-mac-arm64-0.1.7.dmg'), 'old');

  return {
    cleanup: () => fs.rmSync(cwd, { force: true, recursive: true }),
    cwd,
  };
}

function createOutputSink() {
  return {
    chunks: [],
    write(chunk) {
      this.chunks.push(String(chunk));
    },
  };
}

function createMockClient(handlers) {
  return {
    requestBuffer: handlers.requestBuffer,
    requestJson: handlers.requestJson,
  };
}
