import { create } from "zustand";
import { ptyBridge } from "../bridge/pty.bridge";
import { sessionBridge, type PersistedSessionItem } from "../bridge/session.bridge";

export type SessionStatus = "creating" | "running" | "exited";

export interface TerminalSession {
  sessionId: string;
  projectId: string;
  provider: "claude" | "codex" | "gemini" | "kimi";
  providerSessionId: string;
  name: string;
  cwd: string;
  status: SessionStatus;
  createdAt: number;
  exitCode?: number;
}

type ProviderId = "claude" | "codex" | "gemini" | "kimi" | "shell";

interface SessionStoreState {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  nextIndexByPrefix: Record<string, number>;
  hydrateSessions: (items: PersistedSessionItem[]) => void;
  loadSessionsByProjects: (projectIds: string[]) => Promise<void>;
  createSession: (projectId: string, cwd: string, toolId?: ProviderId | string) => Promise<string>;
  ensureSessionRunning: (sessionId: string) => Promise<void>;
  setActiveSession: (sessionId: string) => void;
  destroySession: (sessionId: string) => Promise<void>;
  destroyAll: () => void;
  markExited: (sessionId: string, exitCode: number) => void;
}

function getPrefix(toolId?: string): string {
  if (!toolId || toolId === "shell") return "shell";
  const normalized = toolId.toLowerCase();
  if (normalized.includes("claude")) return "claude";
  if (normalized.includes("codex")) return "codex";
  if (normalized.includes("gemini")) return "gemini";
  if (normalized.includes("kimi")) return "kimi";
  return "shell";
}

function toTerminalSession(item: PersistedSessionItem): TerminalSession {
  return {
    sessionId: item.sessionId,
    projectId: item.projectId,
    provider: item.provider || "claude",
    providerSessionId: item.providerSessionId || "",
    name: item.name,
    cwd: item.cwd,
    status: item.status,
    createdAt: item.createdAt
  };
}

function sessionIdentity(session: Pick<TerminalSession, "provider" | "sessionId">): string {
  return `${String(session.provider || "claude").toLowerCase()}:${session.sessionId}`;
}

function dedupeSessions(items: TerminalSession[]): TerminalSession[] {
  const byKey = new Map<string, TerminalSession>();
  for (const item of items) {
    const key = sessionIdentity(item);
    const prev = byKey.get(key);
    if (!prev || (item.createdAt || 0) >= (prev.createdAt || 0)) {
      byKey.set(key, item);
    }
  }
  return Array.from(byKey.values());
}

function deriveCounters(items: TerminalSession[]): Record<string, number> {
  const next: Record<string, number> = {};
  for (const s of items) {
    const match = s.name.match(/^([a-z]+)-(\d{2,})$/i);
    if (!match) continue;
    const prefix = match[1].toLowerCase();
    const current = Number.parseInt(match[2], 10);
    if (!Number.isFinite(current)) continue;
    const candidate = current + 1;
    if (!next[prefix] || next[prefix] < candidate) {
      next[prefix] = candidate;
    }
  }
  return next;
}

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  nextIndexByPrefix: {},

  hydrateSessions(items) {
    const sessions = dedupeSessions(items.map(toTerminalSession));
    set((state) => ({
      sessions,
      activeSessionId:
        state.activeSessionId && sessions.some((s) => s.sessionId === state.activeSessionId)
          ? state.activeSessionId
          : sessions[0]?.sessionId || null,
      nextIndexByPrefix: {
        ...state.nextIndexByPrefix,
        ...deriveCounters(sessions)
      }
    }));
  },

  async loadSessionsByProjects(projectIds: string[]) {
    const items = await sessionBridge.list({ projectIds });
    get().hydrateSessions(items);
  },

  async createSession(projectId: string, cwd: string, toolId: ProviderId | string = "claude") {
    const prefix = getPrefix(toolId);
    const current = get().nextIndexByPrefix[prefix] || 1;
    const name = `${prefix}-${String(current).padStart(2, "0")}`;

    set((state) => ({
      nextIndexByPrefix: {
        ...state.nextIndexByPrefix,
        [prefix]: current + 1
      }
    }));

    const created = await sessionBridge.create({
      projectId,
      cwd,
      title: name,
      provider: toolId
    });

    const mapped = toTerminalSession({ ...created, cwd });

    set((state) => {
      const exists = state.sessions.some((s) => sessionIdentity(s) === sessionIdentity(mapped));
      return {
        sessions: exists
          ? state.sessions.map((s) => (sessionIdentity(s) === sessionIdentity(mapped) ? mapped : s))
          : dedupeSessions([...state.sessions, mapped]),
        activeSessionId: mapped.sessionId
      };
    });

    return mapped.sessionId;
  },

  async ensureSessionRunning(sessionId: string) {
    const session = get().sessions.find((s) => s.sessionId === sessionId);
    if (!session) return;
    if (session.status === "running") return;

    const started = await sessionBridge.start({
      sessionId,
      provider: session.provider,
      providerSessionId: session.providerSessionId,
      cwd: session.cwd,
      name: session.name
    });
    const mapped = toTerminalSession(started);

    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.sessionId === sessionId
          ? { ...s, ...mapped, projectId: mapped.projectId || s.projectId, status: "running" }
          : s
      )
    }));
  },

  setActiveSession(sessionId: string) {
    set({ activeSessionId: sessionId });
  },

  async destroySession(sessionId: string) {
    const target = get().sessions.find((s) => s.sessionId === sessionId);
    if (!target) return;
    await sessionBridge.archive({
      sessionId: target.sessionId,
      provider: target.provider,
      projectId: target.projectId || null,
      name: target.name,
      cwd: target.cwd
    });
    set((state) => {
      const sessions = state.sessions.filter((s) => s.sessionId !== sessionId);
      let activeSessionId = state.activeSessionId;
      if (activeSessionId === sessionId) {
        activeSessionId = sessions[sessions.length - 1]?.sessionId || null;
      }
      return { sessions, activeSessionId };
    });
  },

  destroyAll() {
    const sessions = get().sessions;
    for (const s of sessions) {
      ptyBridge.destroy(s.sessionId);
    }
    set({ sessions: [], activeSessionId: null });
  },

  markExited(sessionId: string, exitCode: number) {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.sessionId === sessionId
          ? { ...s, status: "exited", exitCode }
          : s
      )
    }));
  }
}));
