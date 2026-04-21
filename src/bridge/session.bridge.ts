export interface PersistedSessionItem {
  sessionId: string;
  name: string;
  cwd: string;
  projectId: string;
  provider: "claude" | "codex" | "gemini" | "kimi";
  providerSessionId: string;
  status: "creating" | "running" | "exited";
  createdAt: number;
}

export interface ArchivedSessionItem {
  archiveId: string;
  sessionId: string;
  provider: "claude" | "codex" | "gemini" | "kimi";
  projectId: string | null;
  name: string;
  cwd: string;
  archivedAt: number;
}

export const sessionBridge = {
  list(payload?: { projectIds?: string[]; providers?: string[] }): Promise<PersistedSessionItem[]> {
    return window.electronAPI.sessions.list(payload);
  },
  create(payload: { projectId: string; cwd: string; title?: string; provider?: string }): Promise<PersistedSessionItem> {
    return window.electronAPI.sessions.create(payload);
  },
  start(payload: { sessionId: string; cwd: string; name?: string; provider?: string; providerSessionId?: string }): Promise<PersistedSessionItem> {
    return window.electronAPI.sessions.start(payload);
  },
  archive(payload: { sessionId: string; provider?: string; projectId?: string | null; name?: string; cwd: string }): Promise<{ ok: boolean }> {
    return window.electronAPI.sessions.archive(payload);
  },
  listArchived(): Promise<ArchivedSessionItem[]> {
    return window.electronAPI.sessions.listArchived();
  },
  restore(payload: { archiveId: string }): Promise<{ ok: boolean }> {
    return window.electronAPI.sessions.restore(payload.archiveId);
  }
};
