const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const log = require("electron-log");
const { z } = require("zod");
const { IPC } = require("../shared/types.js");
const { registerAllIpc } = require("./ipc");
const { PtyService } = require("./services/PtyService");
const {
  applyProviderStartupEnv,
  getLaunchCommandForProvider,
  getResumeCommandForProvider,
  normalizeProviderId
} = require("./providers/cli-launchers");
const { listProviderSessions, mapSessionsToProjects } = require("./providers/session-sources");
const { initDatabase, projectsRepo, sessionsRepo, settingsRepo } = require("../src/main/db/database");

const isDev = !!process.env.VITE_DEV_SERVER_URL;
let mainWindow = null;

log.transports.file.level = "info";
log.transports.console.level = "info";
log.transports.file.maxSize = 5 * 1024 * 1024;
log.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}";

function toLogError(error) {
  if (!error) return {};
  return {
    message: error.message || String(error),
    stack: error.stack || ""
  };
}

function logInfo(scope, message, meta) {
  log.info(`[${scope}] ${message}`, meta || {});
}

function logWarn(scope, message, meta) {
  log.warn(`[${scope}] ${message}`, meta || {});
}

function logError(scope, message, error, meta) {
  log.error(`[${scope}] ${message}`, { ...(meta || {}), ...toLogError(error) });
}

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const wc = mainWindow.webContents;
  if (!wc || wc.isDestroyed()) return;
  wc.send(channel, payload);
}

const dbPath = process.env.ZEELIN_DB_PATH || path.join(app.getPath("userData"), "zeelincode.db");
const db = initDatabase(dbPath);
const projectStore = projectsRepo(db);
const sessionStore = sessionsRepo(db);
const appSettingsStore = settingsRepo(db);

const providerSettingsSchema = z.object({
  providers: z.object({
    claude: z.object({
      defaultProfileId: z.string().min(1),
      profiles: z.array(z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        envVars: z.array(z.object({ key: z.string().min(1), value: z.string() })).optional().default([])
      })).min(1)
    }),
    codex: z.object({
      defaultProfileId: z.string().min(1),
      profiles: z.array(z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        envVars: z.array(z.object({ key: z.string().min(1), value: z.string() })).optional().default([])
      })).min(1)
    }),
    gemini: z.object({
      defaultProfileId: z.string().min(1),
      profiles: z.array(z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        envVars: z.array(z.object({ key: z.string().min(1), value: z.string() })).optional().default([])
      })).min(1)
    })
  })
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
  depth: z.number().int().min(1).max(6).optional().default(3)
});
const fileOpenPathSchema = z.object({
  path: z.string().min(1)
});

function toSessionView(row) {
  return {
    sessionId: row.provider_session_id || row.providerSessionId || row.sessionId || row.id,
    name: row.title || row.name || "New Chat",
    cwd: row.project_path || row.cwd || "",
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
    cwd: row.project_path || row.cwd || "",
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
  const IGNORE = new Set([".git", ".DS_Store", "node_modules", ".claude"]);
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
  const profile = (providerSettings.profiles || []).find((item) => item.id === providerSettings.defaultProfileId)
    || providerSettings.profiles?.[0]
    || { envVars: [] };
  const env = {};
  for (const pair of profile.envVars || []) {
    if (!pair?.key) continue;
    env[pair.key] = pair.value || "";
  }
  return applyProviderStartupEnv(provider, env);
}

function syncDiscoveredSessionsForProjects(projects) {
  if (!Array.isArray(projects) || projects.length === 0) return 0;
  const discovered = mapSessionsToProjects(listProviderSessions(), projects);
  const deduped = dedupeSessionViews(discovered);
  for (const session of deduped) {
    sessionStore.upsertDiscovered({
      projectId: session.projectId,
      title: session.name,
      provider: normalizeProviderId(session.provider),
      providerSessionId: session.providerSessionId || session.sessionId,
      cwd: session.cwd || "",
      sessionFilePath: session.sessionFilePath || null,
      createdAt: session.createdAt
    });
  }
  return deduped.length;
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
    if (level === "error") {
      log.error(`[${scope}] ${message}`, meta);
      return;
    }
    if (level === "warn") {
      log.warn(`[${scope}] ${message}`, meta);
      return;
    }
    if (level === "debug") {
      log.debug(`[${scope}] ${message}`, meta);
      return;
    }
    log.info(`[${scope}] ${message}`, meta);
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
    const syncedCount = syncDiscoveredSessionsForProjects([created]);
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
      .map(toSessionView)
      .filter((session) => providers.length === 0 || providers.includes(normalizeProviderId(session.provider)));
  });
  registerIpc(IPC.SESSION_SYNC_PROJECT, async (_event, payload) => {
    const parsed = z.object({ projectId: z.string().min(1) }).parse(payload);
    const project = projectStore.getById(parsed.projectId);
    if (!project) throw new Error("Project not found");
    const count = syncDiscoveredSessionsForProjects([project]);
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
      ptyService.write(localSessionId, launchCommand);
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
    const providerSessionId = parsed.providerSessionId || parsed.sessionId;
    const record = sessionStore.getByProviderSessionId({ provider, providerSessionId });
    const project = record?.project_id ? projectStore.getById(record.project_id) : null;
    const sessionCwd = project?.path || parsed.cwd || "";
    if (!sessionCwd) throw new Error("Session project path not found");
    logInfo("session", "Starting session", {
      sessionId: parsed.sessionId,
      provider,
      providerSessionId,
      cwd: sessionCwd
    });

    if (!ptyService.hasSession(parsed.sessionId)) {
      ptyService.create({
        cwd: sessionCwd,
        name: parsed.name || `session-${parsed.sessionId.slice(0, 8)}`,
        provider,
        sessionId: parsed.sessionId
      });
      ptyService.write(parsed.sessionId, `cd "${sessionCwd.replace(/"/g, '\\"')}"\n`);
      const resumeCommand = getResumeCommandForProvider(provider, providerSessionId);
      if (resumeCommand) ptyService.write(parsed.sessionId, resumeCommand);
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

  registerIpc(IPC.SETTINGS_CLAUDE_GET, async () => appSettingsStore.getProviderStartupSettings());
  registerIpc(IPC.SETTINGS_CLAUDE_SAVE, async (_event, payload) => {
    const parsed = providerSettingsSchema.parse(payload);
    return appSettingsStore.setProviderStartupSettings(parsed);
  });
}

function createWindow() {
  logInfo("app", "Creating main window", { isDev });
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1000,
    minHeight: 680,
    title: "ZeeLinCode",
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
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  logInfo("app", "Before quit: destroying PTY sessions");
  ptyService.destroyAll();
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
