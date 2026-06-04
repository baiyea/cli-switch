const path = require('node:path');
const fs = require('node:fs');
const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Menu,
  nativeImage,
  clipboard,
} = require('electron');
const log = require('electron-log');
const {
  logInfo,
  logWarn,
  logError,
  logByLevel,
  sanitizeLogText,
} = require('../kernel/logger.js');
const { z } = require('zod');
const { APP_NAME, APP_ID } = require('../shared/app-config.js');
const { IS_E2E, IS_DEV, getDataDir, getDbPath } = require('../kernel/test-mode.js');
const {
  ensureDirSafe,
  clearDirectoryContentsSafe,
  removeFileSafe,
  tryReadJsonFile,
  writeJsonFileSafe,
  toClaudeProjectKey,
  readTailLines,
} = require('../kernel/utils.js');
const { registerPageMain } = require('./register-page-main');
const {
  PtyService,
  createSkillgenRunner,
  createSessionsDumpRunner,
  createSkillgenModelExtractorRuntime,
  createSessionTitleService,
  createModelResponseHelpers,
  createSessionRecordHelpers,
  createSessionDiscoverySyncService,
  createConversationReader,
  createSessionStatsReader,
  createShellBootstrapService,
  buildFileTree,
  TERMINAL_CHANNELS,
} = require('../pages/home/home.main');
const {
  applyProviderStartupEnv,
  getLaunchCommandForProvider,
  getOAuthLoginCommandForProvider,
  getOAuthProbeCommandForProvider,
  getResumeCommandForProvider,
  isLocalGeneratedSessionId,
  normalizeProviderId,
  listProviderSessions,
  mapSessionsToProjects,
  createOAuthLoginTracker,
  createOAuthLoginService,
  createProviderSettingsRuntime,
  createProviderConnectionService,
  createOAuthProbeService,
  createProxyConnectivityService,
  createCliConfigSyncService,
  createProviderTestSyncService,
  createClaudeRuntimeSyncService,
  createTokenRunMetadataResolver,
  createTokenUsageSyncService,
  fetchWithTimeout,
  shortBody,
  shortBodyLong,
  isDeepSeekAnthropicBase,
  buildAnthropicCompatHeaders,
  maskEnvForLog,
  createRunCommandWithEnv,
} = require('../pages/settings/settings.main');
const { createIpcSchemas } = require('./ipc-schemas');
const { registerAppIpc: registerAppIpcHandlers } = require('./ipc-registry');
const {
  initDatabase,
  projectsRepo,
  sessionsRepo,
  settingsRepo,
  tokenUsageRepo,
} = require('../kernel/db/connection');
const { createRuntimeDataCleaner } = require('../kernel/runtime-data-cleaner');
const { resolveAssetPathFrom, pickExistingPath } = require('./asset-paths');
const { createWindowRuntime } = require('./window-runtime');

// LSUIElement=1 in Info.plist hides all instances from the dock.
// The main process explicitly requests activation to show its dock icon,
// while CLI subprocesses (ELECTRON_RUN_AS_NODE=1) stay hidden.
if (process.platform === 'darwin') app.setActivationPolicy('regular');

const isDev = IS_DEV;
const e2eShowWindow = process.env.APP_E2E_SHOW_WINDOW;
const suppressMainWindowDisplay = e2eShowWindow === '0' || (IS_E2E && e2eShowWindow !== '1');
const appHomeDir = getDataDir();
const runtimeAppId =
  path.basename(appHomeDir).replace(/^\./, '') || (isDev ? `${APP_ID}-dev` : APP_ID);
const appLogsDir = path.join(appHomeDir, 'logs');
const appCacheDir = path.join(appHomeDir, 'cache');
const windowRuntime = createWindowRuntime({
  app,
  BrowserWindow,
  Menu,
  Tray: require('electron').Tray,
  nativeImage: require('electron').nativeImage,
  APP_NAME,
  isDev,
  suppressMainWindowDisplay,
  e2eShowWindow,
  resolveAssetPathFrom,
  pickExistingPath,
  ensureDirSafe,
  appHomeDir,
  appLogsDir,
  appCacheDir,
  preloadPath: path.join(__dirname, 'preload.js'),
  devServerUrl: process.env.VITE_DEV_SERVER_URL,
  productionIndexPath: path.join(app.getAppPath(), 'dist/renderer/index.html'),
  logInfo,
  logWarn,
  logError,
});
const {
  configureAppDataPaths,
  getMainWindow,
  sendToRenderer,
  createWindow,
  createMacTray,
  destroyTray,
  getDockIconPath,
} = windowRuntime;
configureAppDataPaths();

log.transports.file.level = 'info';
log.transports.console.level = 'info';
log.transports.file.maxSize = 5 * 1024 * 1024;
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
log.transports.file.resolvePathFn = () => path.join(appLogsDir, 'main.log');

const dbPath = getDbPath();
const db = initDatabase(dbPath);
const projectStore = projectsRepo(db);
const sessionStore = sessionsRepo(db);
const appSettingsStore = settingsRepo(db);
const tokenUsageStore = tokenUsageRepo(db);
const conversationReader = createConversationReader({ readTailLines });
const {
  extractTextFromContentValue,
  extractMessageTextBlocks,
  extractConversationText,
  isSkippableConversationText,
  parseLatestConversationRoundFromSessionFile,
} = conversationReader;
const modelResponseHelpers = createModelResponseHelpers({
  shortBodyLong,
  sanitizeLogText,
  extractTextFromContentValue,
});
const {
  sanitizeModelResponsePreview,
  previewPayloadForLog,
  extractTitleTextFromOpenAiResponse,
  extractTitleTextFromClaudeResponse,
  extractClaudeThinkingPreview,
  extractTitleTextFromGeminiResponse,
  cleanText,
} = modelResponseHelpers;
const {
  toSessionView,
  toArchivedView,
  dedupeSessionViews,
  sessionBelongsToProjectRoot: isSessionInProjectRoot,
  normalizeArchivePayload,
  parseArchiveId,
} = createSessionRecordHelpers({ normalizeProviderId });
const sessionBelongsToProjectRoot = (row) => isSessionInProjectRoot(row, path.resolve);
const providerRuntime = createProviderSettingsRuntime({
  normalizeProviderId,
  applyProviderStartupEnv,
  getProviderStartupSettings: () => appSettingsStore.getProviderStartupSettings(),
});
const {
  INTERNAL_ENV_KEY_AUTH_MODE,
  AUTH_MODE_OAUTH,
  INTERNAL_PROXY_ENABLED_KEY,
  INTERNAL_PROXY_URL_KEY,
  applyUnifiedProxyEnv,
  getMergedProviderProfileEnvVars,
  getActiveProviderProfile,
  stripPresetValuesFromProviderSettings,
  getStartupEnvForProvider,
  buildEnvFromPairs,
} = providerRuntime;
const runCommandWithEnv = createRunCommandWithEnv({
  authModeEnvKey: INTERNAL_ENV_KEY_AUTH_MODE,
  oauthAuthMode: AUTH_MODE_OAUTH,
});
const providerConnectionService = createProviderConnectionService({
  normalizeProviderId,
  getMergedProviderProfileEnvVars,
  applyProviderStartupEnv,
  buildEnvFromPairs,
  maskEnvForLog,
  fetchWithTimeout,
  shortBody,
  isDeepSeekAnthropicBase,
  buildAnthropicCompatHeaders,
  logInfo,
  logWarn,
});
const oauthProbeService = createOAuthProbeService({
  normalizeProviderId,
  getMergedProviderProfileEnvVars,
  applyProviderStartupEnv,
  buildEnvFromPairs,
  getOAuthProbeCommandForProvider,
  runCommandWithEnv,
  maskEnvForLog,
  shortBody,
  logInfo,
  logWarn,
});
const proxyConnectivityService = createProxyConnectivityService({
  normalizeProviderId,
  getMergedProviderProfileEnvVars,
  buildEnvFromPairs,
  applyUnifiedProxyEnv,
  applyProviderStartupEnv,
  runCommandWithEnv,
  maskEnvForLog,
  shortBody,
  logInfo,
  logWarn,
  internalProxyEnabledKey: INTERNAL_PROXY_ENABLED_KEY,
  internalProxyUrlKey: INTERNAL_PROXY_URL_KEY,
});
const {
  providerSettingsSchema,
  providerTestSchema,
  providerOAuthLoginSchema,
  providerOAuthProbeSchema,
  providerOAuthLinksSchema,
  providerProxyTestSchema,
  sessionCreateSchema,
  sessionStartSchema,
  sessionSuggestTitleSchema,
  sessionReorderSchema,
  sessionStatsSchema,
  fileTreeSchema,
  fileOpenPathSchema,
  fileAttachmentSaveSchema,
  fileAttachmentSaveBufferSchema,
  skillgenRunSchema,
  sessionsDumpRunSchema,
} = createIpcSchemas(z);
const { extractSkillCandidatesWithModel } = createSkillgenModelExtractorRuntime({
  normalizeProviderId,
  getStartupEnvForProvider,
  parseLatestConversationRoundFromSessionFile,
  buildAnthropicCompatHeaders,
  sanitizeModelResponsePreview,
  previewPayloadForLog,
  extractTitleTextFromOpenAiResponse,
  extractTitleTextFromClaudeResponse,
  extractClaudeThinkingPreview,
  extractTitleTextFromGeminiResponse,
  cleanText,
  logInfo,
  logWarn,
});
const skillgenRunner = createSkillgenRunner({
  projectStore,
  sessionStore,
  logInfo,
  logWarn,
  logError,
  extractCandidatesWithModel: extractSkillCandidatesWithModel,
});
const sessionsDumpRunner = createSessionsDumpRunner({
  projectStore,
  logInfo,
  logWarn,
  logError,
});

const { normalizeSuggestedTitle, suggestSessionTitleWithModel } = createSessionTitleService({
  normalizeProviderId,
  getStartupEnvForProvider,
  parseLatestConversationRoundFromSessionFile,
  sanitizeModelResponsePreview,
  previewPayloadForLog,
  extractTitleTextFromOpenAiResponse,
  extractTitleTextFromClaudeResponse,
  extractClaudeThinkingPreview,
  extractTitleTextFromGeminiResponse,
  logInfo,
  logWarn,
});

const readSessionStats = createSessionStatsReader({
  listProviderSessions,
  normalizeProviderId,
  extractConversationText,
  extractMessageTextBlocks,
  extractTextFromContentValue,
  isSkippableConversationText,
});
const resolveTokenRunMetadata = createTokenRunMetadataResolver({
  normalizeProviderId,
  getActiveProviderProfile,
  getStartupEnvForProvider,
});
const tokenUsageRuntime = createTokenUsageSyncService({
  fs,
  sessionStore,
  tokenUsageStore,
  readSessionStats,
  resolveRunMetadata: resolveTokenRunMetadata,
  now: () => new Date().toISOString(),
  logWarn,
});

function reconcileTokenUsageProviderSessionId(mapping) {
  try {
    const result = tokenUsageRuntime.reconcileProviderSessionId(mapping);
    if (result && typeof result.then === 'function') {
      result.catch((error) => {
        logWarn('token-usage', 'Failed to reconcile token usage run provider session id', {
          provider: mapping.provider,
          fromProviderSessionId: mapping.fromProviderSessionId,
          toProviderSessionId: mapping.toProviderSessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  } catch (error) {
    logWarn('token-usage', 'Failed to reconcile token usage run provider session id', {
      provider: mapping.provider,
      fromProviderSessionId: mapping.fromProviderSessionId,
      toProviderSessionId: mapping.toProviderSessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const { syncDiscoveredSessionsForProjects } = createSessionDiscoverySyncService({
  mapSessionsToProjects,
  listProviderSessions,
  dedupeSessionViews,
  sessionStore,
  normalizeProviderId,
  onReconciledSession: reconcileTokenUsageProviderSessionId,
  logWarn,
});

function getStartupCommandForProvider(provider = 'claude') {
  // Normal sessions should always launch provider CLI runtime.
  // OAuth login command is only used from settings "start OAuth login" action.
  return getLaunchCommandForProvider(provider);
}
const oauthLoginTracker = createOAuthLoginTracker({
  normalizeProviderId,
  openExternal: (url) => shell.openExternal(url),
  logInfo,
  logWarn,
});
const cliConfigSyncService = createCliConfigSyncService({
  normalizeProviderId,
  logInfo,
  logWarn,
});
const { syncCliConfigAfterSuccessfulProviderTest } = createProviderTestSyncService({
  normalizeProviderId,
  getMergedProviderProfileEnvVars,
  applyProviderStartupEnv,
  applyUnifiedProxyEnv,
  buildEnvFromPairs,
  cliConfigSyncService,
});
const { syncClaudeSettingsEnv } = createClaudeRuntimeSyncService({
  normalizeProviderId,
  maskEnvForLog,
  logInfo,
  logWarn,
  tryReadJsonFile,
  writeJsonFileSafe,
  ensureDirSafe,
  toClaudeProjectKey,
});

function finishTokenUsageRunOnExit(sessionId, endedAt) {
  try {
    const result = tokenUsageRuntime.finishActiveRunByRuntimeSessionId(sessionId, endedAt);
    if (result && typeof result.then === 'function') {
      result.catch((error) => {
        logWarn('token-usage', 'Failed to finish token usage run on PTY exit', {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  } catch (error) {
    logWarn('token-usage', 'Failed to finish token usage run on PTY exit', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const ptyService = new PtyService({
  getStartupEnv: ({ provider, cwd }) =>
    syncClaudeSettingsEnv(provider, getStartupEnvForProvider(provider), cwd),
  logWarn,
  onData: ({ sessionId, data }) => {
    oauthLoginTracker.handleOutput(sessionId, data);
    sendToRenderer(TERMINAL_CHANNELS.DATA, { sessionId, data });
  },
  onExit: ({ sessionId, exitCode }) => {
    oauthLoginTracker.unregisterSession(sessionId);
    finishTokenUsageRunOnExit(sessionId, new Date().toISOString());
    logInfo('pty', 'Session exited', { sessionId, exitCode });
    sendToRenderer(TERMINAL_CHANNELS.EXIT, { sessionId, exitCode });
  },
});
const { waitForShellBootstrap, runWithSessionStartLock } = createShellBootstrapService({
  ptyService,
});
const { startProviderOAuthLogin } = createOAuthLoginService({
  normalizeProviderId,
  getOAuthLoginCommandForProvider,
  projectStore,
  sessionStore,
  ptyService,
  oauthLoginTracker,
  logInfo,
  logWarn,
});
const cleanRuntimeData = createRuntimeDataCleaner({
  APP_ID,
  appHomeDir,
  db,
  dbPath,
  ptyService,
  clearDirectoryContentsSafe,
  removeFileSafe,
});

function registerAppIpc() {
  registerAppIpcHandlers({
    ipcMain,
    registerPageMain,
    z,
    fs,
    path,
    Buffer,
    dialog,
    shell,
    BrowserWindow,
    clipboard,
    nativeImage,
    mainWindow: getMainWindow(),
    getMainWindow,
    projectStore,
    sessionStore,
    appSettingsStore,
    tokenUsageStore,
    tokenUsageRuntime,
    ptyService,
    providerSettingsSchema,
    providerTestSchema,
    providerOAuthLoginSchema,
    providerOAuthProbeSchema,
    providerOAuthLinksSchema,
    providerProxyTestSchema,
    sessionCreateSchema,
    sessionStartSchema,
    sessionSuggestTitleSchema,
    sessionReorderSchema,
    sessionStatsSchema,
    fileTreeSchema,
    fileOpenPathSchema,
    fileAttachmentSaveSchema,
    fileAttachmentSaveBufferSchema,
    skillgenRunSchema,
    skillgenRunner,
    sessionsDumpRunSchema,
    sessionsDumpRunner,
    providerConnectionService,
    oauthProbeService,
    proxyConnectivityService,
    oauthLoginTracker,
    cleanRuntimeData,
    dbPath,
    ensureDirSafe,
    buildFileTree,
    readSessionStats,
    getStartupCommandForProvider,
    getStartupEnvForProvider,
    getResumeCommandForProvider,
    waitForShellBootstrap,
    runWithSessionStartLock,
    normalizeProviderId,
    isLocalGeneratedSessionId,
    syncDiscoveredSessionsForProjects,
    sessionBelongsToProjectRoot,
    normalizeArchivePayload,
    parseArchiveId,
    toSessionView,
    toArchivedView,
    maskEnvForLog,
    normalizeSuggestedTitle,
    suggestSessionTitleWithModel,
    stripPresetValuesFromProviderSettings,
    syncCliConfigAfterSuccessfulProviderTest,
    startProviderOAuthLogin,
    logByLevel,
    logInfo,
    logWarn,
    logError,
  });
}

app.whenReady().then(() => {
  logInfo('app', 'Application ready', {
    appVersion: app.getVersion(),
    platform: process.platform,
    isDev,
    runtimeAppId,
    appHomeDir,
  });

  // 允许渲染进程通过 navigator.clipboard 读写剪贴板
  const { session } = require('electron');
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    if (permission === 'clipboard-read' || permission === 'clipboard-write') {
      return true;
    }
    return false;
  });

  // Windows/Linux 只保留 Undo/Redo/SelectAll，去掉 Copy/Paste role。
  // Copy/Paste 快捷键由 xterm.js 的 attachCustomKeyEventHandler 处理，
  // 避免 Edit 菜单 role 拦截系统快捷键导致键盘事件不传递到 renderer。
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: 'Edit',
          submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'selectAll' },
          ],
        },
      ]),
    );
  }
  if (process.platform === 'darwin' && app.dock) {
    const dockIconPath = getDockIconPath();
    if (dockIconPath) app.dock.setIcon(dockIconPath);
    logInfo('app', 'Resolved dock icon path', { dockIconPath: dockIconPath || '' });
  }
  createWindow();
  registerAppIpc();
  createMacTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  logInfo('app', 'Before quit: destroying PTY sessions');
  ptyService.destroyAll({ quiet: process.platform === 'win32' });
  destroyTray();
});

app.on('window-all-closed', () => {
  logInfo('app', 'All windows closed');
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (error) => {
  logError('process', 'Uncaught exception', error);
});

process.on('unhandledRejection', (reason) => {
  if (reason instanceof Error) {
    logError('process', 'Unhandled rejection', reason);
    return;
  }
  log.error('[process] Unhandled rejection', { reason: String(reason) });
});
