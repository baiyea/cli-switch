const path = require("node:path");
const { BrowserWindow } = require("electron");
const { IS_DEV } = require("../kernel/test-mode");

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Cli-Switch",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (IS_DEV) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5073";
    win.loadURL(devUrl);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "..", "..", "dist", "renderer", "index.html"));
  }

  return win;
}

module.exports = { createMainWindow };
