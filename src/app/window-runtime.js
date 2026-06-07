function getDefaultWindowBounds(platform = process.platform) {
  if (platform === 'win32') {
    return {
      width: 1180,
      height: 760,
      minWidth: 1000,
      minHeight: 680,
    };
  }
  return {
    width: 1360,
    height: 860,
    minWidth: 1000,
    minHeight: 680,
  };
}

function createWindowRuntime(deps = {}) {
  const {
    app,
    BrowserWindow,
    Menu,
    Tray,
    nativeImage,
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
    preloadPath,
    devServerUrl,
    productionIndexPath,
    logInfo = () => {},
    logWarn = () => {},
    logError = () => {},
  } = deps;

  let mainWindow = null;
  let tray = null;

  function configureAppDataPaths() {
    ensureDirSafe(appHomeDir);
    ensureDirSafe(appLogsDir);
    ensureDirSafe(appCacheDir);

    app.setPath('userData', appHomeDir);
    try {
      app.setAppLogsPath(appLogsDir);
    } catch {}
    try {
      app.setPath('logs', appLogsDir);
    } catch {}
    try {
      app.setPath('sessionData', appCacheDir);
    } catch {}
    try {
      app.setPath('cache', appCacheDir);
    } catch {}
  }

  function getMainWindow() {
    return mainWindow;
  }

  function sendToRenderer(channel, payload) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const wc = mainWindow.webContents;
    if (!wc || wc.isDestroyed()) return;
    wc.send(channel, payload);
  }

  function resolveAssetPath(...parts) {
    return resolveAssetPathFrom(__dirname, ...parts);
  }

  function getWindowIconPath() {
    return pickExistingPath([
      process.platform === 'win32' ? resolveAssetPath('app-icons', 'win', 'app.ico') : '',
      resolveAssetPath('app-icons', 'png', 'icon_512x512.png'),
      resolveAssetPath('app-icons', 'png', 'icon_256x256.png'),
    ]);
  }

  function setMacWindowButtonVisibility(win, visible) {
    if (process.platform !== 'darwin' || !win || win.isDestroyed()) return;
    if (typeof win.setWindowButtonVisibility !== 'function') return;
    win.setWindowButtonVisibility(Boolean(visible));
  }

  function bindMacWindowButtonVisibility(win) {
    if (process.platform !== 'darwin' || !win || win.isDestroyed()) return;
    setMacWindowButtonVisibility(win, true);
    win.on('focus', () => setMacWindowButtonVisibility(win, true));
    win.on('blur', () => setMacWindowButtonVisibility(win, false));
  }

  function createWindow() {
    logInfo('app', 'Creating main window', { isDev });
    const iconPath = getWindowIconPath();
    logInfo('app', 'Resolved window icon path', { iconPath: iconPath || '' });
    const useHiddenTitleBar = process.platform === 'darwin' || process.platform === 'win32';
    const windowBounds = getDefaultWindowBounds();
    mainWindow = new BrowserWindow({
      ...windowBounds,
      title: APP_NAME,
      show: false,
      autoHideMenuBar: true,
      frame: process.platform === 'win32' ? false : undefined,
      titleBarStyle: useHiddenTitleBar ? 'hidden' : undefined,
      titleBarOverlay: undefined,
      trafficLightPosition: process.platform === 'darwin' ? { x: 14, y: 20 } : undefined,
      icon: iconPath || undefined,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    bindMacWindowButtonVisibility(mainWindow);

    if (process.platform !== 'darwin') {
      mainWindow.setMenuBarVisibility(false);
    }

    mainWindow.once('ready-to-show', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (suppressMainWindowDisplay) {
        logInfo('app', 'Silent window mode enabled, skip showing/focusing main window', {
          APP_E2E: process.env.APP_E2E || '',
          APP_E2E_SHOW_WINDOW: e2eShowWindow || '',
        });
        return;
      }
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      if (process.platform === 'win32') {
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
        mainWindow.focus();
        setTimeout(() => {
          if (!mainWindow || mainWindow.isDestroyed()) return;
          mainWindow.setAlwaysOnTop(false);
          mainWindow.focus();
        }, 1000);
      } else {
        mainWindow.focus();
      }
      logInfo('app', 'Main window shown', {
        visible: mainWindow.isVisible(),
        focused: mainWindow.isFocused(),
        bounds: mainWindow.getBounds(),
      });
    });

    if (isDev) {
      mainWindow.loadURL(devServerUrl);
      mainWindow.webContents.openDevTools();
    } else {
      mainWindow.loadFile(productionIndexPath);
    }

    mainWindow.webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, validatedURL) => {
        logError('window', 'Renderer failed to load', new Error(errorDescription), {
          errorCode,
          validatedURL,
        });
      },
    );

    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      logWarn('window', 'Renderer process gone', details);
    });

    mainWindow.on('closed', () => {
      logInfo('app', 'Main window closed');
      mainWindow = null;
    });
  }

  function createMacTray() {
    if (process.platform !== 'darwin' || tray) return;

    const trayPath = pickExistingPath([
      resolveAssetPath('app-icons', 'png', 'icon_16x16@2x.png'),
      resolveAssetPath('app-icons', 'png', 'icon_16x16.png'),
      resolveAssetPath('app-icons', 'tray', 'macos-trayTemplate@2x.png'),
      resolveAssetPath('app-icons', 'tray', 'macos-trayTemplate.png'),
      resolveAssetPath('app-icons', 'png', 'icon_16x16.png'),
    ]);
    if (!trayPath) return;

    let trayImage = nativeImage.createFromPath(trayPath);
    if (trayImage.isEmpty()) return;
    trayImage = trayImage.resize({ width: 16, height: 16 });
    trayImage.setTemplateImage(false);

    tray = new Tray(trayImage);
    tray.setToolTip(APP_NAME);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: `Show ${APP_NAME}`,
          click: () => {
            if (!mainWindow || mainWindow.isDestroyed()) {
              createWindow();
              return;
            }
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
          },
        },
        {
          label: `Hide ${APP_NAME}`,
          click: () => {
            if (!mainWindow || mainWindow.isDestroyed()) return;
            mainWindow.hide();
          },
        },
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => app.quit(),
        },
      ]),
    );

    tray.on('click', () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow();
        return;
      }
      if (mainWindow.isVisible()) {
        mainWindow.hide();
        return;
      }
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    });
  }

  function destroyTray() {
    if (!tray) return;
    tray.destroy();
    tray = null;
  }

  function getDockIconPath() {
    return pickExistingPath([
      resolveAssetPath('app-icons', 'mac', 'dock-icon.png'),
      resolveAssetPath('app-icons', 'png', 'icon_512x512.png'),
      resolveAssetPath('app-icons', 'png', 'icon_256x256.png'),
    ]);
  }

  return {
    configureAppDataPaths,
    getMainWindow,
    sendToRenderer,
    resolveAssetPath,
    createWindow,
    createMacTray,
    destroyTray,
    getDockIconPath,
  };
}

module.exports = {
  createWindowRuntime,
  getDefaultWindowBounds,
};
