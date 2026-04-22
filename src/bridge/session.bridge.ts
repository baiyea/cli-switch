export interface PersistedSessionItem {
  sessionId: string;
  name: string;
  cwd: string;
  projectId: string;
  provider: "claude" | "codex" | "gemini";
  providerSessionId: string;
  status: "creating" | "running" | "exited";
  createdAt: number;
}

export interface ArchivedSessionItem {
  archiveId: string;
  sessionId: string;
  provider: "claude" | "codex" | "gemini";
  projectId: string | null;
  name: string;
  cwd: string;
  archivedAt: number;
}

export const sessionBridge = {
  list(payload?: { projectIds?: string[]; providers?: string[] }): Promise<PersistedSessionItem[]> {
    return window.electronAPI.sessions.list(payload);
  },
  create(payload: { projectId: string; cwd?: string; title?: string; provider?: string }): Promise<PersistedSessionItem> {
    return window.electronAPI.sessions.create(payload);
  },
  start(payload: { sessionId: string; cwd?: string; name?: string; provider?: string; providerSessionId?: string }): Promise<PersistedSessionItem> {
    return window.electronAPI.sessions.start(payload);
  },
  syncProject(payload: { projectId: string }): Promise<{ ok: boolean; count: number }> {
    return window.electronAPI.sessions.syncProject(payload);
  },
  archive(payload: { sessionId: string; provider?: string; providerSessionId?: string }): Promise<{ ok: boolean }> {
    return window.electronAPI.sessions.archive(payload);
  },
  listArchived(payload?: { projectIds?: string[] }): Promise<ArchivedSessionItem[]> {
    return window.electronAPI.sessions.listArchived(payload);
  },
  restore(payload: { archiveId: string }): Promise<{ ok: boolean }> {
    return window.electronAPI.sessions.restore(payload.archiveId);
  }
};
