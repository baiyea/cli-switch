const path = require("node:path");
const os = require("node:os");
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { z } = require("zod");
const { initDatabase, projectsRepo, sessionsRepo, settingsRepo } = require("./db/database");
const { SessionManager } = require("./session/session-manager");

const isDev = !!process.env.VITE_DEV_SERVER_URL;
let mainWindow;

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const wc = mainWindow.webContents;
  if (!wc || wc.isDestroyed()) return;

  try {
    wc.send(channel, payload);
  } catch {
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1000,
    minHeight: 680,
    title: "ZeeLinCode",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), "dist/renderer/index.html"));
  }
}

const dbPath = process.env.ZEELIN_DB_PATH || path.join(app.getPath("userData"), "zeelincode.db");
const db = initDatabase(dbPath);
const sessionStore = sessionsRepo(db);
const appSettingsStore = settingsRepo(db);
const sessionManager = new SessionManager({
  getSessionById: sessionStore.getById,
  updateSessionState: sessionStore.updateState,
  updateProviderSessionId: sessionStore.updateProviderSessionId
});

const additionalEnvVarSchema = z.object({
  key: z.string().min(1).regex(/^[A-Z_][A-Z0-9_]*$/),
  value: z.string()
});

const claudeSettingsSchema = z.object({
  apiUrl: z.string().trim().optional().default(""),
  apiKey: z.string().optional().default(""),
  apiKeyEnvVarName: z.enum(["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"]).default("ANTHROPIC_API_KEY"),
  model: z.string().trim().optional().default(""),
  additionalEnvVars: z.array(additionalEnvVarSchema).optional().default([])
}).superRefine((val, ctx) => {
  if (!val.apiUrl) return;

  try {
    const u = new URL(val.apiUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["apiUrl"],
        message: "API URL must start with http:// or https://"
      });
    }
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["apiUrl"],
      message: "Invalid API URL format"
    });
  }
});

function buildClaudeStartupEnv() {
  const settings = appSettingsStore.getClaudeStartupSettings();
  const env = {};

  if (settings.apiUrl) env.ANTHROPIC_BASE_URL = settings.apiUrl;
  if (settings.apiKey) env[settings.apiKeyEnvVarName] = settings.apiKey;
  if (settings.model) env.ANTHROPIC_MODEL = settings.model;

  for (const pair of settings.additionalEnvVars || []) {
    if (!pair?.key) continue;
    env[pair.key] = pair.value || "";
  }

  return env;
}

function registerIpc() {
  const projectStore = projectsRepo(db);

  ipcMain.handle("project:list", async () => projectStore.list());

  ipcMain.handle("project:add", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select Project Folder",
      properties: ["openDirectory"]
    });

    if (result.canceled || result.filePaths.length === 0) return null;
    const folderPath = result.filePaths[0];
    return projectStore.create({
      name: path.basename(folderPath),
      path: folderPath
    });
  });

  ipcMain.handle("project:remove", async (_event, { id }) => projectStore.remove(id));

  ipcMain.handle("session:list", async (_event, { projectId }) => sessionStore.listByProject(projectId));
  ipcMain.handle("session:listArchived", async (_event, { projectId }) =>
    sessionStore.listArchivedByProject(projectId)
  );

  ipcMain.handle("session:create", async (_event, { projectId, title, provider = "claude" }) => {
    const project = projectStore.getById(projectId);
    if (!project) throw new Error("Project not found");
    return sessionStore.create({
      projectId,
      title: title || "New Chat",
      provider,
      cwd: project.path
    });
  });

  ipcMain.handle("session:start", async (_event, { sessionId }) => {
    return sessionManager.startSession(sessionId, {
      platform: os.platform(),
      startupEnv: buildClaudeStartupEnv(),
      onOutput: (chunk) => sendToRenderer("terminal:output", { sessionId, chunk }),
      onExit: ({ code, signal }) => sendToRenderer("terminal:exit", { sessionId, code, signal })
    });
  });

  ipcMain.handle("session:resume", async (_event, { sessionId }) => {
    return sessionManager.resumeSession(sessionId, {
      platform: os.platform(),
      startupEnv: buildClaudeStartupEnv(),
      onOutput: (chunk) => sendToRenderer("terminal:output", { sessionId, chunk }),
      onExit: ({ code, signal }) => sendToRenderer("terminal:exit", { sessionId, code, signal })
    });
  });

  ipcMain.handle("session:stop", async (_event, { sessionId }) => sessionManager.stopSession(sessionId));
  ipcMain.handle("session:rename", async (_event, { sessionId, title }) => {
    const nextTitle = String(title || "").trim();
    if (!nextTitle) throw new Error("Title cannot be empty");
    sessionStore.rename({ sessionId, title: nextTitle });
    return { ok: true };
  });
  ipcMain.handle("session:archive", async (_event, { sessionId }) => {
    sessionStore.archive(sessionId);
    return { ok: true };
  });
  ipcMain.handle("session:restore", async (_event, { sessionId }) => {
    sessionStore.restore(sessionId);
    return { ok: true };
  });

  ipcMain.handle("session:buffer", async (_event, { sessionId }) => ({
    sessionId,
    buffer: sessionManager.getSessionBuffer(sessionId)
  }));

  ipcMain.handle("terminal:input", async (_event, { sessionId, text }) => sessionManager.sendInput(sessionId, text));

  ipcMain.handle("provider:list", async () => [
    { id: "claude", enabled: true, label: "Claude Code" },
    { id: "codex", enabled: false, label: "Codex CLI" },
    { id: "gemini", enabled: false, label: "Gemini CLI" },
    { id: "kimi", enabled: false, label: "Kimi CLI" }
  ]);

  ipcMain.handle("settings:claude:get", async () => appSettingsStore.getClaudeStartupSettings());

  ipcMain.handle("settings:claude:save", async (_event, payload) => {
    const parsed = claudeSettingsSchema.parse(payload);
    return appSettingsStore.setClaudeStartupSettings(parsed);
  });
}

app.whenReady().then(() => {
  createWindow();
  registerIpc();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
