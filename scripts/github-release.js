const childProcess = require('node:child_process');
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const readline = require('node:readline');

const INSTALLER_EXTENSIONS = new Set(['.appimage', '.deb', '.dmg', '.exe', '.rpm', '.zip']);
const GITHUB_API_HOST = 'api.github.com';
const REPOSITORY_HINT =
  'Unable to determine GitHub owner/repo. Configure .env with GITHUB_REPOSITORY=owner/repo or GITHUB_REMOTE_URL=https://github.com/owner/repo.git';

function versionToTagName(version) {
  return `v${version}`;
}

function parseGitHubRemoteUrl(remoteUrl) {
  const sshMatch = remoteUrl.match(/^git@github\.com:([^/\s]+)\/([^/\s]+)$/);
  if (sshMatch) {
    return {
      owner: sshMatch[1],
      repo: normalizeRepositoryName(sshMatch[2]),
    };
  }

  const httpsMatch = remoteUrl.match(/^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)$/);
  if (httpsMatch) {
    return {
      owner: httpsMatch[1],
      repo: normalizeRepositoryName(httpsMatch[2]),
    };
  }

  throw new Error(`Unsupported GitHub remote URL: ${remoteUrl}`);
}

function parseGitHubRepository(value) {
  const match = value && value.trim().match(/^([^/\s]+)\/([^/\s]+)$/);
  if (!match) {
    throw new Error(`Invalid GITHUB_REPOSITORY: ${value}. Expected owner/repo.`);
  }

  return {
    owner: match[1],
    repo: normalizeRepositoryName(match[2]),
  };
}

function normalizeRepositoryName(repo) {
  return repo.replace(/\.git$/, '');
}

function resolveGitHubRepository(env, getOriginRemoteUrl = getGitOriginRemoteUrl) {
  if (env.GITHUB_REPOSITORY) {
    return parseGitHubRepository(env.GITHUB_REPOSITORY);
  }

  if (env.GITHUB_REMOTE_URL) {
    return parseGitHubRemoteUrl(env.GITHUB_REMOTE_URL);
  }

  let originUrl;
  try {
    originUrl = getOriginRemoteUrl();
  } catch {
    originUrl = '';
  }

  if (originUrl && isGitHubRemoteUrl(originUrl)) {
    return parseGitHubRemoteUrl(originUrl);
  }

  throw new Error(REPOSITORY_HINT);
}

function isGitHubRemoteUrl(remoteUrl) {
  return /^git@github\.com:/.test(remoteUrl) || /^https:\/\/github\.com\//.test(remoteUrl);
}

function parseDotEnv(content) {
  const env = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }

    env[key] = unquoteDotEnvValue(rawValue);
  }

  return env;
}

function unquoteDotEnvValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  const commentIndex = value.indexOf('#');
  if (commentIndex === -1) {
    return value;
  }

  return value.slice(0, commentIndex).trimEnd();
}

function readDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return parseDotEnv(fs.readFileSync(filePath, 'utf8'));
}

function loadReleaseEnv(cwd, overrides = {}) {
  return {
    ...process.env,
    ...readDotEnv(path.join(cwd, '.env')),
    ...overrides,
  };
}

function isCurrentVersionLatestYml(filePath, version) {
  const content = fs.readFileSync(filePath, 'utf8');
  return new RegExp(`^version:\\s*${escapeRegExp(version)}\\s*$`, 'm').test(content);
}

function fileNameHasVersion(fileName, version) {
  return new RegExp(`(^|[^0-9A-Za-z])${escapeRegExp(version)}(?=$|[^0-9A-Za-z])`).test(fileName);
}

function isInstallerArtifact(fileName, version) {
  const extension = path.extname(fileName).toLowerCase();
  return INSTALLER_EXTENSIONS.has(extension) && fileNameHasVersion(fileName, version);
}

function isBlockmapArtifact(fileName, version) {
  return /\.blockmap$/i.test(fileName) && fileNameHasVersion(fileName, version);
}

function selectReleaseArtifacts(distDir, version) {
  return fs
    .readdirSync(distDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => {
      const filePath = path.join(distDir, fileName);

      if (/^latest.*\.yml$/.test(fileName)) {
        return isCurrentVersionLatestYml(filePath, version);
      }

      return isInstallerArtifact(fileName, version) || isBlockmapArtifact(fileName, version);
    })
    .sort()
    .map((fileName) => path.join(distDir, fileName));
}

function buildReleasePayload(tagName, headSha) {
  return {
    tag_name: tagName,
    target_commitish: headSha,
    name: tagName,
    draft: false,
    prerelease: false,
  };
}

function createUploadAssetUrl(uploadUrlTemplate, assetName) {
  const baseUrl = uploadUrlTemplate.replace(/\{.*$/, '');
  return `${baseUrl}?name=${encodeURIComponent(assetName)}`;
}

function createGitHubApiPath(apiUrl) {
  const parsedUrl = new URL(apiUrl);
  if (parsedUrl.host !== GITHUB_API_HOST) {
    throw new Error(`Unexpected GitHub API host for asset URL: ${apiUrl}`);
  }

  return `${parsedUrl.pathname}${parsedUrl.search}`;
}

function getGitOriginRemoteUrl(cwd = process.cwd()) {
  return runGit(['remote', 'get-url', 'origin'], cwd);
}

function getGitHeadSha(cwd = process.cwd()) {
  return runGit(['rev-parse', 'HEAD'], cwd);
}

function runGit(args, cwd) {
  return childProcess
    .execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    .trim();
}

function createGitHubClient(token) {
  async function requestJson(method, requestPath, body) {
    const response = await requestGitHub({
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'cli-switch-release-script',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      host: GITHUB_API_HOST,
      method,
      path: requestPath,
    });

    if (response.statusCode === 204 || !response.body) {
      return null;
    }

    return JSON.parse(response.body);
  }

  async function requestBuffer(method, url, buffer, contentType) {
    const parsedUrl = new URL(url);
    return requestGitHub({
      body: buffer,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Length': buffer.length,
        'Content-Type': contentType,
        'User-Agent': 'cli-switch-release-script',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      host: parsedUrl.host,
      method,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
    });
  }

  return {
    requestBuffer,
    requestJson,
  };
}

function requestGitHub(options) {
  return new Promise((resolve, reject) => {
    const request = https.request(options, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve({ body, statusCode: response.statusCode });
          return;
        }

        const message = extractGitHubErrorMessage(body);
        reject(
          new Error(
            `GitHub API ${options.method} ${options.path} failed: ${response.statusCode} ${message}`,
          ),
        );
      });
    });

    request.on('error', reject);
    if (options.body) {
      request.write(options.body);
    }
    request.end();
  });
}

function extractGitHubErrorMessage(body) {
  if (!body) {
    return '';
  }

  try {
    const parsed = JSON.parse(body);
    return parsed.message || body;
  } catch {
    return body;
  }
}

async function getReleaseByTag(client, repository, tagName) {
  const requestPath = `/repos/${repository.owner}/${repository.repo}/releases/tags/${encodeURIComponent(tagName)}`;

  try {
    return await client.requestJson('GET', requestPath);
  } catch (error) {
    if (/failed: 404\b/.test(error.message)) {
      return null;
    }
    throw error;
  }
}

async function updateRelease(client, repository, releaseId, tagName) {
  return client.requestJson(
    'PATCH',
    `/repos/${repository.owner}/${repository.repo}/releases/${releaseId}`,
    {
      draft: false,
      name: tagName,
      prerelease: false,
    },
  );
}

async function createRelease(client, repository, tagName, headSha) {
  return client.requestJson(
    'POST',
    `/repos/${repository.owner}/${repository.repo}/releases`,
    buildReleasePayload(tagName, headSha),
  );
}

function getReleaseTargetCommitish(cwd, env, getGitHeadShaFn = getGitHeadSha) {
  return env.GITHUB_RELEASE_TARGET || getGitHeadShaFn(cwd);
}

async function getGitHubCommitSha(client, repository, commitish) {
  try {
    const commit = await client.requestJson(
      'GET',
      `/repos/${repository.owner}/${repository.repo}/commits/${encodeURIComponent(commitish)}`,
    );
    return commit && commit.sha ? commit.sha : null;
  } catch (error) {
    if (/failed: 404\b/.test(error.message)) {
      return null;
    }
    throw error;
  }
}

async function githubCommitExists(client, repository, headSha) {
  return Boolean(await getGitHubCommitSha(client, repository, headSha));
}

async function getGitHubTagCommitSha(client, repository, tagName) {
  const ref = await getGitHubTagRef(client, repository, tagName);
  if (!ref || !ref.object) {
    return null;
  }

  if (ref.object.type === 'commit') {
    return ref.object.sha;
  }

  if (ref.object.type === 'tag') {
    const tag = await client.requestJson(
      'GET',
      `/repos/${repository.owner}/${repository.repo}/git/tags/${encodeURIComponent(ref.object.sha)}`,
    );
    return tag && tag.object ? tag.object.sha : null;
  }

  return ref.object.sha || null;
}

async function getGitHubTagRef(client, repository, tagName) {
  try {
    return await client.requestJson(
      'GET',
      `/repos/${repository.owner}/${repository.repo}/git/ref/tags/${encodeURIComponent(tagName)}`,
    );
  } catch (error) {
    if (/failed: 404\b/.test(error.message)) {
      return null;
    }
    throw error;
  }
}

async function assertReleaseTagMatchesTarget(client, repository, tagName, targetSha) {
  const tagCommitSha = await getGitHubTagCommitSha(client, repository, tagName);
  if (!tagCommitSha) {
    throw new Error(`GitHub release ${tagName} exists, but tag ${tagName} was not found.`);
  }

  if (tagCommitSha !== targetSha) {
    throw new Error(
      `GitHub tag ${tagName} points to ${tagCommitSha}, but release target resolves to ${targetSha}. Refusing to replace release assets for a different commit.`,
    );
  }
}

const assertReleaseTagMatchesHead = assertReleaseTagMatchesTarget;

async function uploadReleaseArtifacts(client, release, artifactPaths) {
  const existingAssets = new Map((release.assets || []).map((asset) => [asset.name, asset]));

  for (const artifactPath of artifactPaths) {
    const assetName = path.basename(artifactPath);
    const existingAsset = existingAssets.get(assetName);
    const buffer = fs.readFileSync(artifactPath);
    const uploadUrl = createUploadAssetUrl(release.upload_url, assetName);
    const contentType = getContentType(assetName);

    if (existingAsset) {
      await client.requestJson('DELETE', createGitHubApiPath(existingAsset.url));
    }

    await client.requestBuffer('POST', uploadUrl, buffer, contentType);
  }
}

function getContentType(fileName) {
  switch (path.extname(fileName).toLowerCase()) {
    case '.yml':
    case '.yaml':
      return 'application/x-yaml';
    case '.exe':
      return 'application/vnd.microsoft.portable-executable';
    case '.dmg':
      return 'application/x-apple-diskimage';
    case '.zip':
      return 'application/zip';
    default:
      return 'application/octet-stream';
  }
}

function formatArtifactList(artifactPaths) {
  return artifactPaths.map((artifactPath) => {
    const stat = fs.statSync(artifactPath);
    return `- ${path.basename(artifactPath)} (${formatBytes(stat.size)})`;
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function askYesNo(question, input = process.stdin, output = process.stdout) {
  const rl = readline.createInterface({ input, output });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^(y|yes)$/i.test(answer.trim()));
    });
  });
}

function shouldAutoConfirm(env, argv = []) {
  return (
    argv.includes('--yes') || /^(1|true|yes)$/i.test(String(env.GITHUB_RELEASE_YES || '').trim())
  );
}

async function confirmUpload(options = {}) {
  const stdout = options.stdout || process.stdout;

  if (options.autoConfirm) {
    stdout.write('Auto-confirmed by --yes/GITHUB_RELEASE_YES.\n');
    return true;
  }

  const input = options.stdin || process.stdin;
  if (input.isTTY === false) {
    throw new Error(
      'Refusing to wait for confirmation on non-interactive stdin. Re-run with --yes or GITHUB_RELEASE_YES=1.',
    );
  }

  return (options.askYesNo || askYesNo)(
    'Upload these files to GitHub Release? Type yes to continue: ',
    input,
    stdout,
  );
}

async function runCli(options = {}) {
  const cwd = options.cwd || process.cwd();
  const stdout = options.stdout || process.stdout;
  const argv = options.argv || process.argv.slice(2);
  const env = loadReleaseEnv(cwd, options.env || {});
  const token = env.GITHUB_TOKEN;

  if (!token) {
    throw new Error('Missing GITHUB_TOKEN. Configure .env with GITHUB_TOKEN=...');
  }

  const packageJson = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  const version = packageJson.version;
  const tagName = versionToTagName(version);
  const repository = resolveGitHubRepository(env, () => getGitOriginRemoteUrl(cwd));
  const releaseDir = path.join(cwd, 'release');
  const artifactPaths = selectReleaseArtifacts(releaseDir, version);

  if (artifactPaths.length === 0) {
    throw new Error(`No release artifacts found for version ${version} in ${releaseDir}`);
  }

  stdout.write(`GitHub repository: ${repository.owner}/${repository.repo}\n`);
  stdout.write(`Release tag: ${tagName}\n`);
  stdout.write('Artifacts to upload:\n');
  stdout.write(`${formatArtifactList(artifactPaths).join('\n')}\n`);

  const confirmed = await confirmUpload({
    askYesNo: options.askYesNo || askYesNo,
    autoConfirm: options.yes === true || shouldAutoConfirm(env, argv),
    stdin: options.stdin,
    stdout,
  });
  if (!confirmed) {
    stdout.write('Cancelled.\n');
    return { cancelled: true };
  }

  const client = options.client || createGitHubClient(token);
  const targetCommitish = getReleaseTargetCommitish(
    cwd,
    env,
    options.getGitHeadSha || getGitHeadSha,
  );
  const targetSha = await getGitHubCommitSha(client, repository, targetCommitish);
  if (!targetSha) {
    throw new Error(
      `Release target ${targetCommitish} was not found in GitHub repository ${repository.owner}/${repository.repo}. Push commits to GitHub or set GITHUB_RELEASE_TARGET to an existing GitHub branch/SHA.`,
    );
  }

  stdout.write(`Release target: ${targetCommitish} (${targetSha})\n`);

  let release = await getReleaseByTag(client, repository, tagName);

  if (release) {
    await assertReleaseTagMatchesTarget(client, repository, tagName, targetSha);
    const updatedRelease = await updateRelease(client, repository, release.id, tagName);
    release = {
      ...release,
      ...updatedRelease,
      assets: updatedRelease.assets || release.assets,
    };
  } else {
    release = await createRelease(client, repository, tagName, targetSha);
  }

  await uploadReleaseArtifacts(client, release, artifactPaths);
  stdout.write('Release upload complete.\n');
  return { cancelled: false, release, tagName, artifactPaths };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  assertReleaseTagMatchesHead,
  buildReleasePayload,
  confirmUpload,
  createGitHubApiPath,
  createUploadAssetUrl,
  fileNameHasVersion,
  getGitHubCommitSha,
  getReleaseTargetCommitish,
  githubCommitExists,
  loadReleaseEnv,
  parseDotEnv,
  parseGitHubRemoteUrl,
  resolveGitHubRepository,
  runCli,
  selectReleaseArtifacts,
  shouldAutoConfirm,
  uploadReleaseArtifacts,
  versionToTagName,
};
