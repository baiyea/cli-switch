const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const violations = [];
const allowedSharedBridgeFiles = new Set([
  'src/shared/bridge/index.ts',
  'src/shared/bridge/log.bridge.ts',
]);
const forbiddenHomePageTransitionalImports = [
  './home/shared/renderer/use-app-workspace',
  './home/shared/renderer/use-session-launcher',
];
const forbiddenLegacyAppFiles = [
  'src/app/App.jsx',
  'src/app/register-feature-main.js',
  'src/app/register-feature-preload.js',
  'src/app/register-feature-renderer.tsx',
  'src/app/create-window.js',
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.git'].includes(entry.name)) return [];
      return walk(fullPath);
    }
    return [fullPath];
  });
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

function extractImportSpecifiers(source) {
  const imports = [];
  const patterns = [
    /import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /import\(\s*['"]([^'"]+)['"]\s*\)/g,
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) imports.push(match[1]);
  }

  return imports;
}

function resolveImportPath(fromRelativePath, specifier) {
  if (specifier.startsWith('@/')) return `src/${specifier.slice(2)}`;
  if (!specifier.startsWith('.')) return null;

  const importerDir = path.posix.dirname(fromRelativePath);
  return path.posix.normalize(path.posix.join(importerDir, specifier));
}

function sameSettingsBlock(ownerRelativePath, targetRelativePath) {
  const owner = ownerRelativePath.match(/^src\/pages\/settings\/([^/]+)\//)?.[1];
  const target = targetRelativePath.match(/^src\/pages\/settings\/([^/]+)\//)?.[1];
  return owner && target && owner === target;
}

function isTestFile(relativePath) {
  return /\.(?:test|spec)\.[jt]sx?$/.test(relativePath) || relativePath.includes('/e2e/');
}

const srcFiles = walk(path.join(root, 'src')).filter((filePath) =>
  /\.(js|jsx|ts|tsx)$/.test(filePath),
);

const featuresDir = path.join(root, 'src', 'features');
if (fs.existsSync(featuresDir)) {
  violations.push(
    'src/features still exists; Page Block Capsule keeps page-owned code under src/pages.',
  );
}

for (const filePath of srcFiles) {
  const relative = rel(filePath);
  const source = read(filePath);
  const imports = extractImportSpecifiers(source);
  if (/src\/features|['"][^'"]*\.\.\/features|['"][^'"]*features\//.test(source)) {
    violations.push(`${relative}: imports or references src/features`);
  }
  if (
    /register-feature-(main|preload|renderer)/.test(source) &&
    !relative.includes('register-feature-')
  ) {
    violations.push(`${relative}: imports legacy feature registration`);
  }
  if (
    /pages\/home\/(terminal|sidebar|file-tree|top-toolbar)\/.*\/renderer\/.*bridge/.test(source)
  ) {
    violations.push(`${relative}: imports another Home block renderer bridge`);
  }
  if (
    relative.startsWith('src/pages/settings/token-usage/renderer/') &&
    /pages\/home\/terminal|home\/terminal\/renderer|home\/terminal\/preload|home\/terminal\/main/.test(
      source,
    )
  ) {
    violations.push(`${relative}: token-usage renderer must not import terminal internals`);
  }
  if (relative.startsWith('src/pages/settings/token-usage/') && /terminal\.bridge/.test(source)) {
    violations.push(`${relative}: token-usage block must not import terminal.bridge`);
  }
  if (
    relative.startsWith('src/pages/settings/appearance/') &&
    /providers\/renderer\/providers\.bridge|settingsBridge/.test(source)
  ) {
    violations.push(
      `${relative}: appearance block must not import providers renderer bridge or use settingsBridge`,
    );
  }

  for (const importPath of imports) {
    const resolved = resolveImportPath(relative, importPath);
    if (!resolved) continue;
    if (
      relative.startsWith('src/i18n/') &&
      !isTestFile(relative) &&
      resolved.startsWith('src/pages/')
    ) {
      violations.push(`${relative}: src/i18n must not import page or block implementation`);
    }

    if (
      resolved.includes('/locales') &&
      resolved.startsWith('src/pages/settings/') &&
      relative.startsWith('src/pages/settings/') &&
      !sameSettingsBlock(relative, resolved) &&
      relative !== 'src/pages/settings/settings.i18n.ts'
    ) {
      violations.push(
        `${relative}: settings block locale imports must stay inside the owning block or settings.i18n.ts`,
      );
    }

    if (
      resolved.startsWith('src/pages/settings/token-usage/renderer/') &&
      !relative.startsWith('src/pages/settings/token-usage/')
    ) {
      violations.push(
        `${relative}: must not import token-usage renderer internals; import the block renderer entry instead`,
      );
    }
  }
}

const appMainPath = path.join(root, 'src', 'app', 'main.js');
if (fs.existsSync(appMainPath)) {
  const appMainSource = read(appMainPath);
  const importsSharedTypes =
    /require\((['"])\.\.\/shared\/types(?:\.(?:js|ts))?\1\)|from\s+['"]\.\.\/shared\/types(?:\.(?:js|ts))?['"]/.test(
      appMainSource,
    );
  if (importsSharedTypes) {
    violations.push(
      'src/app/main.js: must not import or require src/shared/types(.js/.ts), including legacy IPC contracts',
    );
  }
  const pageImports = Array.from(
    appMainSource.matchAll(/require\((['"])\.\.\/pages\/([^'"]+)\1\)/g),
  ).map((m) => m[2]);
  const allowedPageImports = new Set([
    'register-page-main',
    'home/home.main',
    'settings/settings.main',
  ]);
  const allowedPageImportPatterns = [/shared\/provider-env-presets\.json$/];
  for (const imported of pageImports) {
    if (allowedPageImports.has(imported)) continue;
    if (allowedPageImportPatterns.some((pattern) => pattern.test(imported))) continue;
    violations.push(
      `src/app/main.js: page import ../pages/${imported} is not allowed; keep app startup aggregated by page entry files only`,
    );
  }
}

const homePagePath = path.join(root, 'src', 'pages', 'home', 'HomePage.tsx');
if (fs.existsSync(homePagePath)) {
  const homePageSource = read(homePagePath);
  for (const importPath of forbiddenHomePageTransitionalImports) {
    if (homePageSource.includes(importPath)) {
      violations.push(
        `src/pages/HomePage.tsx: transitional import ${importPath} is forbidden; move to page/block store or block-local hooks`,
      );
    }
  }
}

const sharedBridgeDir = path.join(root, 'src', 'shared', 'bridge');
if (fs.existsSync(sharedBridgeDir)) {
  const sharedBridgeFiles = walk(sharedBridgeDir)
    .filter((filePath) => /\.(js|ts|jsx|tsx)$/.test(filePath))
    .map((filePath) => rel(filePath));

  for (const file of sharedBridgeFiles) {
    if (!allowedSharedBridgeFiles.has(file)) {
      violations.push(
        `${file}: business bridge must live in page/block scope; src/shared/bridge only allows log.bridge.ts and index.ts`,
      );
    }
  }
}

for (const relativePath of forbiddenLegacyAppFiles) {
  const abs = path.join(root, relativePath);
  if (fs.existsSync(abs)) {
    violations.push(
      `${relativePath}: legacy app wrapper file should be removed after page-entry migration`,
    );
  }
}

if (violations.length > 0) {
  console.error('[architecture] violations found:');
  for (const item of violations) console.error(`- ${item}`);
  process.exit(1);
}

console.log('[architecture] ok');
