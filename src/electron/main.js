const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } = require("electron");
const log = require("electron-log");
const { z } = require("zod");
const { IPC } = require("../shared/types.js");
const { APP_NAME, APP_ID, DB_FILENAME } = require("../shared/app-config.js");
const { registerAllIpc } = require("./ipc");
const { PtyService } = require("./services/PtyService");
const {
  applyProviderStartupEnv,
  getLaunchCommandForProvider,
  getResumeCommandForProvider,
  isLocalGeneratedSessionId,
  normalizeProviderId
} = require("./providers/cli-launchers");
const { listProviderSessions, mapSessionsToProjects } = require("./providers/session-sources");
const { initDatabase, projectsRepo, sessionsRepo, settingsRepo } = require("../main/db/database");

const isDev = !!process.env.VITE_DEV_SERVER_URL;
let mainWindow = null;
let tray = null;
const appHomeDir = path.join(os.homedir(), `.${APP_ID}`);
const appLogsDir = path.join(appHomeDir, "logs");
const appCacheDir = path.join(appHomeDir, "cache");

function ensureDirSafe(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function configureAppDataPaths() {
  ensureDirSafe(appHomeDir);
  ensureDirSafe(appLogsDir);
  ensureDirSafe(appCacheDir);

  app.setPath("userData", appHomeDir);
  try {
    app.setAppLogsPath(appLogsDir);
  } catch {}
  try {
    app.setPath("logs", appLogsDir);
  } catch {}
  try {
    app.setPath("sessionData", appCacheDir);
  } catch {}
  try {
    app.setPath("cache", appCacheDir);
  } catch {}
}

configureAppDataPaths();

log.transports.file.level = "info";
log.transports.console.level = "info";
log.transports.file.maxSize = 5 * 1024 * 1024;
log.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}";
log.transports.file.resolvePathFn = () => path.join(appLogsDir, "main.log");

function toLogError(error) {
  if (!error) return {};
  return {
    message: error.message || String(error),
    stack: error.stack || ""
  };
}

function sanitizeLogText(value) {
  return String(value || "").replace(/\r?\n/g, " ").trim();
}

function formatLogLine(scope, message, meta) {
  const prefix = `[${sanitizeLogText(scope)}] ${sanitizeLogText(message)}`.trim();
  if (meta === undefined || meta === null) return prefix;
  try {
    const metaText = JSON.stringify(meta);
    if (!metaText || metaText === "{}") return prefix;
    return `${prefix} ${sanitizeLogText(metaText)}`;
  } catch {
    return prefix;
  }
}

function logInfo(scope, message, meta) {
  log.info(formatLogLine(scope, message, meta));
}

function logWarn(scope, message, meta) {
  log.warn(formatLogLine(scope, message, meta));
}

function logError(scope, message, error, meta) {
  log.error(formatLogLine(scope, message, { ...(meta || {}), ...toLogError(error) }));
}

function logDebug(scope, message, meta) {
  log.debug(formatLogLine(scope, message, meta));
}

function logByLevel(level, scope, message, meta) {
  if (level === "error") {
    log.error(formatLogLine(scope, message, meta));
    return;
  }
  if (level === "warn") {
    log.warn(formatLogLine(scope, message, meta));
    return;
  }
  if (level === "debug") {
    log.debug(formatLogLine(scope, message, meta));
    return;
  }
  log.info(formatLogLine(scope, message, meta));
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

  // Compatibility fallback for Electron versions exposing macOS button API
  // under setWindowButtonPosition instead.
  if (typeof win.setWindowButtonPosition === "function") {
    win.setWindowButtonPosition(target);
    return true;
  }

  return false;
}

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const wc = mainWindow.webContents;
  if (!wc || wc.isDestroyed()) return;
  wc.send(channel, payload);
}

function resolveAssetPath(...parts) {
  return path.join(__dirname, "assets", ...parts);
}

function pickExistingPath(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return "";
}

function getWindowIconPath() {
  return pickExistingPath([
    process.platform === "win32" ? resolveAssetPath("icons", "win", "app.ico") : "",
    resolveAssetPath("icons", "png", "icon_512x512.png"),
    resolveAssetPath("icons", "png", "icon_256x256.png")
  ]);
}

function createMacTray() {
  if (process.platform !== "darwin" || tray) return;

  const trayPath = pickExistingPath([
    resolveAssetPath("icons", "png", "icon_16x16@2x.png"),
    resolveAssetPath("icons", "png", "icon_16x16.png"),
    resolveAssetPath("icons", "tray", "macos-trayTemplate@2x.png"),
    resolveAssetPath("icons", "tray", "macos-trayTemplate.png"),
    resolveAssetPath("icons", "png", "icon_16x16.png")
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
        }
      },
      {
        label: `Hide ${APP_NAME}`,
        click: () => {
          if (!mainWindow || mainWindow.isDestroyed()) return;
          mainWindow.hide();
        }
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => app.quit()
      }
    ])
  );

  tray.on("click", () => {
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

const dbPath = process.env.ZEELIN_DB_PATH || path.join(app.getPath("userData"), DB_FILENAME);
const db = initDatabase(dbPath);
const projectStore = projectsRepo(db);
const sessionStore = sessionsRepo(db);
const appSettingsStore = settingsRepo(db);

const providerSettingsSchema = z.object({
  providers: z.object({
    claude: z.object({
      defaultProfileId: z.string().min(1),
      enabledProfileId: z.string().optional().default(""),
      profiles: z.array(z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        envVars: z.array(z.object({ key: z.string().min(1), value: z.string() })).optional().default([])
      })).min(1)
    }),
    codex: z.object({
      defaultProfileId: z.string().min(1),
      enabledProfileId: z.string().optional().default(""),
      profiles: z.array(z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        envVars: z.array(z.object({ key: z.string().min(1), value: z.string() })).optional().default([])
      })).min(1)
    }),
    gemini: z.object({
      defaultProfileId: z.string().min(1),
      enabledProfileId: z.string().optional().default(""),
      profiles: z.array(z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        envVars: z.array(z.object({ key: z.string().min(1), value: z.string() })).optional().default([])
      })).min(1)
    })
  })
});
const providerTestSchema = z.object({
  provider: z.string().min(1),
  profileId: z.string().min(1),
  envVars: z.array(z.object({ key: z.string().min(1), value: z.string().optional().default("") })).optional().default([])
});
const sessionCreateSchema = z.object({
  projectId: z.string().min(1),
  cwd: z.string().optional(),
  title: z.string().optional(),
  provider: z.string().optional().default("claude")
});
const sessionStartSchema = z.object({
  sessionId: z.string().min(1),
  providerSessionId: z.string().optional(),
  cwd: z.string().optional(),
  name: z.string().optional(),
  provider: z.string().optional().default("claude")
});
const sessionArchiveSchema = z.object({
  sessionId: z.string().min(1)
});
const fileTreeSchema = z.object({
  cwd: z.string().min(1),
  depth: z.number().int().min(1).max(12).optional().default(6)
});
const fileOpenPathSchema = z.object({
  path: z.string().min(1)
});

function toSessionView(row) {
  return {
    sessionId: row.provider_session_id || row.providerSessionId || row.sessionId || row.id,
    name: row.title || row.name || "New Chat",
    cwd: row.cwd || row.project_path || "",
    projectId: row.project_id || row.projectId || "",
    provider: normalizeProviderId(row.provider || "claude"),
    providerSessionId: row.provider_session_id || row.providerSessionId || "",
    status: row.status || "exited",
    createdAt: row.created_at ? new Date(row.created_at).getTime() : (row.createdAt || Date.now())
  };
}

function toArchivedView(row) {
  const provider = normalizeProviderId(row.provider || "claude");
  const sessionId = row.provider_session_id || row.providerSessionId || row.sessionId || row.id;
  return {
    archiveId: `${provider}:${sessionId}`,
    sessionId,
    provider,
    projectId: row.project_id || row.projectId || null,
    name: row.title || row.name || `session-${String(sessionId).slice(0, 8)}`,
    cwd: row.cwd || row.project_path || "",
    archivedAt: row.archived_at ? new Date(row.archived_at).getTime() : Date.now()
  };
}

function dedupeSessionViews(items) {
  const byKey = new Map();
  for (const item of items || []) {
    const sid = item.provider_session_id || item.providerSessionId || item.sessionId;
    const key = `${normalizeProviderId(item.provider)}:${sid}`;
    const prev = byKey.get(key);
    if (!prev || (item.createdAt || 0) >= (prev.createdAt || 0)) {
      byKey.set(key, item);
    }
  }
  return Array.from(byKey.values());
}

function sessionBelongsToProjectRoot(row) {
  const cwd = row?.cwd || row?.project_path || "";
  const projectPath = row?.project_path || "";
  if (!cwd || !projectPath) return true;
  return path.resolve(cwd) === path.resolve(projectPath);
}

function normalizeArchivePayload(payload) {
  if (typeof payload === "string") {
    return { sessionId: payload };
  }
  if (!payload || typeof payload !== "object") {
    return { sessionId: "" };
  }
  if (typeof payload.sessionId === "string") {
    return payload;
  }
  // Backward compatibility: payload can be { sessionId: { sessionId, ... } }.
  if (payload.sessionId && typeof payload.sessionId === "object") {
    return { ...payload, ...payload.sessionId };
  }
  return payload;
}

function parseArchiveId(identifier, fallbackProvider = "claude") {
  const raw = String(identifier || "");
  if (raw.includes(":")) {
    const [provider, ...rest] = raw.split(":");
    return {
      provider: normalizeProviderId(provider),
      providerSessionId: rest.join(":")
    };
  }
  return {
    provider: normalizeProviderId(fallbackProvider),
    providerSessionId: raw
  };
}

function encodeClaudeProjectDir(cwd) {
  const normalized = path.resolve(cwd);
  const replaced = normalized
    .replace(/\\/g, "-")
    .replace(/\//g, "-")
    .replace(/:/g, "");
  return replaced.startsWith("-") ? replaced : `-${replaced}`;
}

function normalizeTitle(text, maxLen = 36) {
  if (!text) return "";
  const compact = String(text).replace(/\s+/g, " ").trim();
  if (!compact) return "";
  if (compact.length <= maxLen) return compact;
  return `${compact.slice(0, maxLen - 1)}…`;
}

function extractRenameTitle(content) {
  if (typeof content !== "string") return "";
  if (!content.includes("<command-name>/rename</command-name>")) return "";
  const match = content.match(/<command-args>([\s\S]*?)<\/command-args>/);
  if (!match) return "";
  return normalizeTitle(match[1], 48);
}

function extractUserPrompt(content) {
  if (typeof content !== "string") return "";
  const trimmed = content.trim();
  if (!trimmed) return "";
  // Skip command/meta envelopes and caveat blocks.
  if (trimmed.startsWith("<")) return "";
  if (trimmed.includes("<local-command-caveat>")) return "";
  return normalizeTitle(trimmed, 40);
}

function readTailLines(filePath, maxBytes = 256 * 1024, maxLines = 500) {
  const stat = fs.statSync(filePath);
  const readSize = Math.min(maxBytes, stat.size);
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(readSize);
    fs.readSync(fd, buffer, 0, readSize, stat.size - readSize);
    const text = buffer.toString("utf8");
    const lines = text.split("\n").filter(Boolean);
    return lines.slice(-maxLines);
  } finally {
    fs.closeSync(fd);
  }
}

function readHeadLines(filePath, maxBytes = 128 * 1024, maxLines = 300) {
  const stat = fs.statSync(filePath);
  const readSize = Math.min(maxBytes, stat.size);
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(readSize);
    fs.readSync(fd, buffer, 0, readSize, 0);
    const text = buffer.toString("utf8");
    const lines = text.split("\n").filter(Boolean);
    return lines.slice(0, maxLines);
  } finally {
    fs.closeSync(fd);
  }
}

function extractSessionCwdFromJsonl(filePath) {
  try {
    const lines = readHeadLines(filePath);
    for (const line of lines) {
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const cwd = parsed?.cwd || parsed?.entrypoint?.cwd;
      if (typeof cwd === "string" && cwd.trim().length > 0) {
        return cwd.trim();
      }
    }
    return "";
  } catch {
    return "";
  }
}

function deriveSessionTitleFromJsonl(filePath, fallbackTitle) {
  try {
    const lines = readTailLines(filePath);
    let promptTitle = "";

    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }

      const content = parsed?.message?.content;
      const rename = extractRenameTitle(content);
      if (rename) return rename;

      if (!promptTitle && parsed?.message?.role === "user") {
        const prompt = extractUserPrompt(content);
        if (prompt) promptTitle = prompt;
      }
    }

    return promptTitle || fallbackTitle;
  } catch {
    return fallbackTitle;
  }
}

function listClaudeSessionsForProject(project) {
  const projectDirName = encodeClaudeProjectDir(project.path);
  const root = path.join(os.homedir(), ".claude", "projects", projectDirName);
  if (!fs.existsSync(root)) return [];

  const entries = fs.readdirSync(root, { withFileTypes: true });
  const sessions = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".jsonl")) continue;
    const uuid = entry.name.slice(0, -6);
    if (!/^[0-9a-fA-F-]{36}$/.test(uuid)) continue;
    const filePath = path.join(root, entry.name);
    let createdAt = Date.now();
    try {
      const stat = fs.statSync(filePath);
      createdAt = stat.mtimeMs;
    } catch {
    }

    const fallbackTitle = `session-${uuid.slice(0, 8)}`;
    const title = deriveSessionTitleFromJsonl(filePath, fallbackTitle);
    const sessionCwd = extractSessionCwdFromJsonl(filePath) || project.path;

    sessions.push({
      sessionId: uuid,
      name: title,
      cwd: sessionCwd,
      projectId: project.id,
      providerSessionId: uuid,
      status: "exited",
      createdAt
    });
  }

  sessions.sort((a, b) => b.createdAt - a.createdAt);
  return sessions;
}

function buildFileTree(cwd, depth) {
  const IGNORE = new Set([".git", ".DS_Store", "node_modules"]);
  const gitInfo = getGitStatusSnapshot(cwd);

  function walk(dir, level) {
    if (level > depth) return [];
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }

    const nodes = entries
      .filter((entry) => !IGNORE.has(entry.name))
      .map((entry) => {
        const full = path.join(dir, entry.name);
        const relative = path.relative(cwd, full).replace(/\\/g, "/");
        if (entry.isDirectory()) {
          const children = walk(full, level + 1);
          return {
            name: entry.name,
            path: full,
            type: "directory",
            hasGitChanges: children.some((child) => child.hasGitChanges || !!child.gitStatus),
            children
          };
        }
        return {
          name: entry.name,
          path: full,
          type: "file",
          gitStatus: gitInfo.byPath.get(relative) || ""
        };
      });

    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return nodes;
  }
  return { isGitRepo: gitInfo.isRepo, items: walk(cwd, 1) };
}

function getGitStatusSnapshot(cwd) {
  const repoProbe = spawnSync("git", ["-C", cwd, "rev-parse", "--is-inside-work-tree"], {
    encoding: "utf8"
  });
  if (repoProbe.status !== 0) {
    return { isRepo: false, byPath: new Map() };
  }

  const statusProbe = spawnSync(
    "git",
    ["-C", cwd, "-c", "core.quotepath=false", "status", "--porcelain=v1", "--untracked-files=all"],
    { encoding: "utf8" }
  );
  if (statusProbe.status !== 0) {
    return { isRepo: true, byPath: new Map() };
  }

  const byPath = new Map();
  const lines = String(statusProbe.stdout || "").split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const xy = line.slice(0, 2);
    const raw = line.slice(3).trim();
    if (!raw) continue;
    const pathname = normalizeStatusPath(raw);
    if (!pathname) continue;
    const code = toGitBadgeCode(xy);
    const previous = byPath.get(pathname);
    if (!previous || gitBadgePriority(code) >= gitBadgePriority(previous)) {
      byPath.set(pathname, code);
    }
  }

  return { isRepo: true, byPath };
}

function normalizeStatusPath(rawPath) {
  const renamed = rawPath.includes(" -> ") ? rawPath.split(" -> ").pop() : rawPath;
  const trimmed = String(renamed || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    return trimmed.slice(1, -1).replace(/\\"/g, "\"").replace(/\\\\/g, "\\").replace(/\\/g, "/");
  }
  return trimmed.replace(/\\/g, "/");
}

function toGitBadgeCode(xy) {
  const code = String(xy || "  ");
  if (code === "??") return "U";
  if (code.includes("U")) return "U";
  if (code.includes("D")) return "D";
  if (code.includes("A")) return "A";
  return "M";
}

function gitBadgePriority(code) {
  if (code === "U") return 4;
  if (code === "D") return 3;
  if (code === "A") return 2;
  return 1;
}

function getStartupEnvForProvider(provider = "claude") {
  const settings = appSettingsStore.getProviderStartupSettings();
  const id = normalizeProviderId(provider);
  const providerSettings = settings?.providers?.[id] || settings?.providers?.claude || {};
  const activeProfileId = providerSettings.enabledProfileId || providerSettings.defaultProfileId;
  const profile = (providerSettings.profiles || []).find((item) => item.id === activeProfileId)
    || providerSettings.profiles?.[0]
    || { envVars: [] };
  const env = {};
  for (const pair of profile.envVars || []) {
    if (!pair?.key) continue;
    env[pair.key] = pair.value || "";
  }
  return applyProviderStartupEnv(provider, env);
}

function buildEnvFromPairs(pairs) {
  const env = {};
  for (const pair of pairs || []) {
    if (!pair?.key) continue;
    env[String(pair.key).trim()] = String(pair.value || "");
  }
  return env;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function shortBody(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 160);
}

async function testProviderConnection({ provider, envVars }) {
  const id = normalizeProviderId(provider);
  const env = applyProviderStartupEnv(id, buildEnvFromPairs(envVars));

  if (id === "claude") {
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) return { ok: false, message: "缺少 ANTHROPIC_API_KEY" };
    const base = String(env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/+$/, "");
    const url = `${base}/v1/models`;
    const resp = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      }
    });
    if (resp.ok) return { ok: true, message: "Claude 连接成功" };
    const body = shortBody(await resp.text());
    return { ok: false, message: `Claude 测试失败: HTTP ${resp.status}${body ? ` - ${body}` : ""}` };
  }

  if (id === "codex") {
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return { ok: false, message: "缺少 OPENAI_API_KEY" };
    const base = String(env.OPENAI_BASE_URL || "https://api.openai.com").replace(/\/+$/, "");
    const url = `${base}/v1/models`;
    const resp = await fetchWithTimeout(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (resp.ok) return { ok: true, message: "Codex(OpenAI) 连接成功" };
    const body = shortBody(await resp.text());
    return { ok: false, message: `Codex 测试失败: HTTP ${resp.status}${body ? ` - ${body}` : ""}` };
  }

  if (id === "gemini") {
    const apiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
    if (!apiKey) return { ok: false, message: "缺少 GEMINI_API_KEY 或 GOOGLE_API_KEY" };
    const base = String(env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
    const url = `${base}/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    const resp = await fetchWithTimeout(url, { method: "GET" });
    if (resp.ok) return { ok: true, message: "Gemini 连接成功" };
    const body = shortBody(await resp.text());
    return { ok: false, message: `Gemini 测试失败: HTTP ${resp.status}${body ? ` - ${body}` : ""}` };
  }

  return { ok: false, message: `不支持的 provider: ${provider}` };
}

function syncDiscoveredSessionsForProjects(projects) {
  if (!Array.isArray(projects) || projects.length === 0) return { count: 0, mappings: [] };
  const discovered = mapSessionsToProjects(listProviderSessions(), projects);
  const deduped = dedupeSessionViews(discovered);
  const mappings = [];
  for (const session of deduped) {
    const result = sessionStore.reconcileDiscovered({
      projectId: session.projectId,
      title: session.name,
      provider: normalizeProviderId(session.provider),
      providerSessionId: session.providerSessionId || session.sessionId,
      cwd: session.cwd || "",
      sessionFilePath: session.sessionFilePath || null,
      createdAt: session.createdAt
    });
    if (result?.reconciled && result.fromProviderSessionId && result.toProviderSessionId) {
      mappings.push({
        provider: normalizeProviderId(session.provider),
        fromProviderSessionId: result.fromProviderSessionId,
        toProviderSessionId: result.toProviderSessionId,
        cwd: session.cwd || "",
        projectId: session.projectId
      });
    }
  }
  return { count: deduped.length, mappings };
}

const ptyService = new PtyService({
  getStartupEnv: ({ provider }) => getStartupEnvForProvider(provider),
  onData: ({ sessionId, data }) => sendToRenderer(IPC.PTY_DATA, { sessionId, data }),
  onExit: ({ sessionId, exitCode }) => {
    logInfo("pty", "Session exited", { sessionId, exitCode });
    sendToRenderer(IPC.PTY_EXIT, { sessionId, exitCode });
  }
});

function registerAppIpc() {
  const registerIpc = (channel, handler) => {
    ipcMain.handle(channel, async (event, payload) => {
      try {
        return await handler(event, payload);
      } catch (error) {
        logError("ipc", `Handler failed: ${channel}`, error, { payload });
        throw error;
      }
    });
  };

  ipcMain.on(IPC.APP_LOG, (_event, payload = {}) => {
    const level = payload.level || "info";
    const scope = payload.scope || "renderer";
    const message = payload.message || "renderer log";
    const meta = payload.meta || {};
    logByLevel(level, scope, message, meta);
  });

  registerAllIpc(ipcMain, { ptyService });

  registerIpc(IPC.PROJECT_LIST, async () => projectStore.list());
  registerIpc(IPC.PROJECT_ADD, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select Project Folder",
      properties: ["openDirectory"]
    });

    if (result.canceled || result.filePaths.length === 0) return null;
    const folderPath = result.filePaths[0];
    const created = projectStore.create({
      name: path.basename(folderPath),
      path: folderPath
    });
    const { count: syncedCount } = syncDiscoveredSessionsForProjects([created]);
    logInfo("project", "Project created and sessions synced", {
      projectId: created.id,
      path: created.path,
      syncedCount
    });
    return created;
  });

  registerIpc(IPC.PROJECT_REMOVE, async (_event, { id }) => projectStore.remove(id));
  registerIpc(IPC.SESSION_LIST, async (_event, payload = {}) => {
    const projectIds = Array.isArray(payload.projectIds) ? payload.projectIds : [];
    const providers = Array.isArray(payload.providers) ? payload.providers.map(normalizeProviderId) : [];
    const allProjects = projectStore.list();
    const selectedProjects = projectIds.length > 0
      ? allProjects.filter((p) => projectIds.includes(p.id))
      : allProjects;
    const rows = sessionStore.listAllActive(selectedProjects.map((p) => p.id));
    return rows
      .filter(sessionBelongsToProjectRoot)
      .map(toSessionView)
      .filter((session) => providers.length === 0 || providers.includes(normalizeProviderId(session.provider)));
  });
  registerIpc(IPC.SESSION_SYNC_PROJECT, async (_event, payload) => {
    const parsed = z.object({ projectId: z.string().min(1) }).parse(payload);
    const project = projectStore.getById(parsed.projectId);
    if (!project) throw new Error("Project not found");
    const { count } = syncDiscoveredSessionsForProjects([project]);
    logInfo("session", "Manual project session sync complete", {
      projectId: project.id,
      path: project.path,
      syncedCount: count
    });
    return { ok: true, count };
  });
  registerIpc(IPC.SESSION_CREATE, async (_event, payload) => {
    const parsed = sessionCreateSchema.parse(payload);
    const provider = normalizeProviderId(parsed.provider);
    const localSessionId = `${provider}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const name = parsed.title || "New Chat";
    const launchCommand = getLaunchCommandForProvider(provider);
    const project = projectStore.getById(parsed.projectId);
    const cwd = project?.path || parsed.cwd || "";
    if (!cwd) throw new Error("Project path not found");
    logInfo("session", "Creating session", {
      sessionId: localSessionId,
      projectId: parsed.projectId,
      provider,
      cwd
    });

    ptyService.create({
      cwd,
      name,
      provider,
      sessionId: localSessionId
    });
    if (launchCommand) {
      logInfo("session", "Writing launch command", {
        sessionId: localSessionId,
        provider,
        command: launchCommand.trim()
      });
      const wrote = ptyService.write(localSessionId, launchCommand);
      if (!wrote) logWarn("session", "Launch command write skipped: PTY not found", { sessionId: localSessionId, provider });
    } else {
      const message = `No launch command available for provider=${provider}. CLI runtime may be missing for platform ${process.platform}-${process.arch}.`;
      logWarn("session", message, { sessionId: localSessionId, provider });
      const wroteError = ptyService.write(localSessionId, `${message}\n`);
      if (!wroteError) logWarn("session", "Launch error write skipped: PTY not found", { sessionId: localSessionId, provider });
    }

    sessionStore.create({
      projectId: parsed.projectId,
      title: name,
      provider,
      providerSessionId: localSessionId,
      cwd,
      sessionFilePath: null,
      status: "running"
    });
    sessionStore.updateStateByProviderSessionId({
      provider,
      providerSessionId: localSessionId,
      status: "running"
    });

    return toSessionView({
      provider_session_id: localSessionId,
      title: name,
      project_path: cwd,
      project_id: parsed.projectId,
      provider,
      provider_session_id: localSessionId,
      status: "running"
    });
  });
  registerIpc(IPC.SESSION_START, async (_event, payload) => {
    const parsed = sessionStartSchema.parse(payload);
    const provider = normalizeProviderId(parsed.provider);
    let providerSessionId = parsed.providerSessionId || parsed.sessionId;
    let record = sessionStore.getByProviderSessionId({ provider, providerSessionId });
    const project = record?.project_id ? projectStore.getById(record.project_id) : null;
    const sessionCwd = record?.cwd || parsed.cwd || project?.path || "";
    if (!sessionCwd) throw new Error("Session project path not found");
    if (project && isLocalGeneratedSessionId(provider, providerSessionId)) {
      const { mappings } = syncDiscoveredSessionsForProjects([project]);
      const reconciled = mappings.find((item) => item.provider === provider && item.fromProviderSessionId === providerSessionId);
      if (reconciled?.toProviderSessionId) {
        providerSessionId = reconciled.toProviderSessionId;
        record = sessionStore.getByProviderSessionId({ provider, providerSessionId });
        logInfo("session", "Reconciled local session id to provider session id", {
          provider,
          fromProviderSessionId: reconciled.fromProviderSessionId,
          toProviderSessionId: reconciled.toProviderSessionId
        });
      }
    }
    logInfo("session", "Starting session", {sessionId: parsed.sessionId, provider, providerSessionId,cwd: sessionCwd});

    if (!ptyService.hasSession(parsed.sessionId)) {
      ptyService.create({
        cwd: sessionCwd,
        name: parsed.name || `session-${parsed.sessionId.slice(0, 8)}`,
        provider,
        sessionId: parsed.sessionId
      });
      const wroteCwd = ptyService.write(parsed.sessionId, `cd "${sessionCwd.replace(/"/g, '\\"')}"\n`);
      if (!wroteCwd) logWarn("session", "CWD command write skipped: PTY not found", { sessionId: parsed.sessionId, provider });
      const resumeCommand = getResumeCommandForProvider(provider, providerSessionId);
      const startupCommand = resumeCommand || getLaunchCommandForProvider(provider);
      if (startupCommand) {
        logInfo("session", "Writing resume command", {
          sessionId: parsed.sessionId,
          provider,
          providerSessionId,
          mode: resumeCommand ? "resume" : "launch",
          command: startupCommand.trim()
        });
        const wroteResume = ptyService.write(parsed.sessionId, startupCommand);
        if (!wroteResume) logWarn("session", "Resume command write skipped: PTY not found", { sessionId: parsed.sessionId, provider });
      } else {
        const message = `No startup command available for provider=${provider}. CLI runtime may be missing for platform ${process.platform}-${process.arch}.`;
        logWarn("session", message, {
          sessionId: parsed.sessionId,
          provider,
          providerSessionId
        });
        const wroteError = ptyService.write(parsed.sessionId, `${message}\n`);
        if (!wroteError) logWarn("session", "Startup error write skipped: PTY not found", { sessionId: parsed.sessionId, provider });
      }
    }
    sessionStore.updateStateByProviderSessionId({
      provider,
      providerSessionId,
      status: "running"
    });

    return toSessionView({
      ...(record || {}),
      provider,
      provider_session_id: providerSessionId,
      title: parsed.name || record?.title || `session-${parsed.sessionId.slice(0, 8)}`,
      project_path: sessionCwd,
      status: "running"
    });
  });
  registerIpc(IPC.SESSION_RENAME, async (_event, payload) => {
    const parsed = z.object({
      sessionId: z.string().min(1),
      title: z.string().min(1),
      provider: z.string().optional().default("claude"),
      providerSessionId: z.string().optional()
    }).parse(payload || {});

    const provider = normalizeProviderId(parsed.provider);
    const providerSessionId = parsed.providerSessionId || parsed.sessionId;
    const nextTitle = parsed.title.trim();
    if (!nextTitle) {
      throw new Error("Session title is required");
    }

    sessionStore.renameByProviderSessionId({
      provider,
      providerSessionId,
      title: nextTitle
    });
    return { ok: true };
  });
  registerIpc(IPC.SESSION_ARCHIVE, async (_event, payload) => {
    const parsed = z.object({
      sessionId: z.string().min(1),
      provider: z.string().optional().default("claude"),
      providerSessionId: z.string().optional()
    }).parse(normalizeArchivePayload(payload));
    const provider = normalizeProviderId(parsed.provider);
    const providerSessionId = parsed.providerSessionId || parsed.sessionId;
    ptyService.destroy(providerSessionId);
    logInfo("session", "Archiving session", {
      sessionId: providerSessionId,
      provider
    });
    sessionStore.archiveByProviderSessionId({
      provider,
      providerSessionId
    });
    return { ok: true };
  });
  registerIpc(IPC.SESSION_ARCHIVE_LIST, async (_event, payload = {}) => {
    const projectIds = Array.isArray(payload.projectIds) ? payload.projectIds : [];
    return sessionStore.listAllArchived(projectIds).map(toArchivedView);
  });
  registerIpc(IPC.SESSION_RESTORE, async (_event, payload) => {
    const parsed = z.object({
      archiveId: z.string().optional(),
      sessionId: z.string().optional(),
      provider: z.string().optional().default("claude")
    }).parse(payload || {});
    const source = parsed.archiveId || parsed.sessionId || "";
    const archive = parseArchiveId(source, parsed.provider);
    if (!archive.providerSessionId) throw new Error("Invalid archive identifier");
    sessionStore.restoreByProviderSessionId({
      provider: archive.provider,
      providerSessionId: archive.providerSessionId
    });
    return { ok: true };
  });
  registerIpc(IPC.FILE_TREE_READ, async (_event, payload) => {
    const parsed = fileTreeSchema.parse(payload);
    const root = path.resolve(parsed.cwd);
    const tree = buildFileTree(root, parsed.depth);
    return {
      cwd: root,
      isGitRepo: tree.isGitRepo,
      items: tree.items
    };
  });
  registerIpc(IPC.FILE_OPEN_PATH, async (_event, payload) => {
    const parsed = fileOpenPathSchema.parse(payload);
    const target = path.resolve(parsed.path);
    logInfo("files", "Opening path", { target });
    const errorMessage = await shell.openPath(target);
    if (errorMessage) {
      logWarn("files", "Open path failed", { target, errorMessage });
      throw new Error(errorMessage);
    }
    return { ok: true };
  });
  registerIpc(IPC.WINDOW_SET_TRAFFIC_LIGHT, async (_event, payload) => {
    if (process.platform !== "darwin" || !mainWindow || mainWindow.isDestroyed()) {
      return { ok: true };
    }
    const parsed = z.object({
      x: z.number().int().min(0).max(5000),
      y: z.number().int().min(0).max(5000)
    }).parse(payload || {});
    const updated = setTrafficLightPositionSafe(mainWindow, { x: parsed.x, y: parsed.y });
    if (!updated) {
      logWarn("window", "Skip traffic light update: API not supported", {
        x: parsed.x,
        y: parsed.y,
        electron: process.versions.electron
      });
    }
    return { ok: updated };
  });

  registerIpc(IPC.SETTINGS_CLAUDE_GET, async () => appSettingsStore.getProviderStartupSettings());
  registerIpc(IPC.SETTINGS_CLAUDE_SAVE, async (_event, payload) => {
    const parsed = providerSettingsSchema.parse(payload);
    return appSettingsStore.setProviderStartupSettings(parsed);
  });
  registerIpc(IPC.SETTINGS_PROVIDER_TEST, async (_event, payload) => {
    const parsed = providerTestSchema.parse(payload);
    try {
      return await testProviderConnection(parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, message: `连接测试异常: ${message}` };
    }
  });
}

function createWindow() {
  logInfo("app", "Creating main window", { isDev });
  const iconPath = getWindowIconPath();
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1000,
    minHeight: 680,
    title: APP_NAME,
    titleBarStyle: process.platform === "darwin" ? "hidden" : undefined,
    trafficLightPosition: process.platform === "darwin"
      ? { x: 14, y: 20 }
      : undefined,
    icon: iconPath || undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
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

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    logError("window", "Renderer failed to load", new Error(errorDescription), {
      errorCode,
      validatedURL
    });
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    logWarn("window", "Renderer process gone", details);
  });

  mainWindow.on("closed", () => {
    logInfo("app", "Main window closed");
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  logInfo("app", "Application ready", {
    appVersion: app.getVersion(),
    platform: process.platform,
    isDev
  });
  registerAppIpc();
  if (process.platform === "darwin" && app.dock) {
    const dockIconPath = pickExistingPath([
      resolveAssetPath("icons", "mac", "dock-icon.png"),
      resolveAssetPath("icons", "png", "icon_512x512.png"),
      resolveAssetPath("icons", "png", "icon_256x256.png")
    ]);
    if (dockIconPath) app.dock.setIcon(dockIconPath);
  }
  createWindow();
  createMacTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  logInfo("app", "Before quit: destroying PTY sessions");
  ptyService.destroyAll();
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

app.on("window-all-closed", () => {
  logInfo("app", "All windows closed");
  if (process.platform !== "darwin") app.quit();
});

process.on("uncaughtException", (error) => {
  logError("process", "Uncaught exception", error);
});

process.on("unhandledRejection", (reason) => {
  if (reason instanceof Error) {
    logError("process", "Unhandled rejection", reason);
    return;
  }
  log.error("[process] Unhandled rejection", { reason: String(reason) });
});
