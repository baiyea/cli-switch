const { TOP_TOOLBAR_CHANNELS } = require("../shared/top-toolbar.channels");

function parseTrafficLightPayload(payload = {}) {
  const x = Number(payload.x);
  const y = Number(payload.y);
  if (!Number.isInteger(x) || x < 0 || x > 5000) {
    throw new Error("Invalid traffic light x");
  }
  if (!Number.isInteger(y) || y < 0 || y > 5000) {
    throw new Error("Invalid traffic light y");
  }
  return { x, y };
}

function setTrafficLightPositionSafe(win, position) {
  if (!win || win.isDestroyed?.()) return false;
  const target = {
    x: Math.max(0, Math.floor(position?.x || 0)),
    y: Math.max(0, Math.floor(position?.y || 0))
  };

  if (typeof win.setTrafficLightPosition === "function") {
    win.setTrafficLightPosition(target);
    return true;
  }

  if (typeof win.setWindowButtonPosition === "function") {
    win.setWindowButtonPosition(target);
    return true;
  }

  return false;
}

function registerTopToolbarIpc(context = {}) {
  const {
    registerIpc,
    registerIpcOn,
    BrowserWindow,
    shell,
    getMainWindow,
    logByLevel = () => {},
    logWarn = () => {}
  } = context;

  if (!registerIpc || !registerIpcOn || !BrowserWindow || !shell) return;

  registerIpc(TOP_TOOLBAR_CHANNELS.WINDOW_OPEN_EXTERNAL, async (_event, { url }) => {
    if (!url || typeof url !== "string") return;
    await shell.openExternal(url);
  });

  registerIpc(TOP_TOOLBAR_CHANNELS.WINDOW_MINIMIZE, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return { ok: false };
    win.minimize();
    return { ok: true };
  });

  registerIpc(TOP_TOOLBAR_CHANNELS.WINDOW_TOGGLE_MAXIMIZE, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return { ok: false, isMaximized: false };
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return { ok: true, isMaximized: win.isMaximized() };
  });

  registerIpc(TOP_TOOLBAR_CHANNELS.WINDOW_CLOSE, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return { ok: false };
    win.close();
    return { ok: true };
  });

  registerIpc(TOP_TOOLBAR_CHANNELS.WINDOW_SET_TRAFFIC_LIGHT, async (_event, payload) => {
    const win = typeof getMainWindow === "function" ? getMainWindow() : null;
    if (process.platform !== "darwin" || !win || win.isDestroyed()) return { ok: true };
    const parsed = parseTrafficLightPayload(payload || {});
    const updated = setTrafficLightPositionSafe(win, parsed);
    if (!updated) {
      logWarn("window", "Skip traffic light update: API not supported", {
        x: parsed.x,
        y: parsed.y,
        electron: process.versions.electron
      });
    }
    return { ok: updated };
  });

  registerIpcOn(TOP_TOOLBAR_CHANNELS.APP_LOG, (_event, payload = {}) => {
    const level = payload.level || "info";
    const scope = payload.scope || "renderer";
    const message = payload.message || "renderer log";
    const meta = payload.meta || {};
    logByLevel(level, scope, message, meta);
  });
}

module.exports = { registerTopToolbarIpc };
