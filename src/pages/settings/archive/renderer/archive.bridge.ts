export interface ArchivedSessionItem {
  archiveId: string;
  sessionId: string;
  provider: 'claude' | 'codex' | 'gemini';
  projectId: string | null;
  name: string;
  cwd: string;
  archivedAt: number;
}

export const archiveBridge = {
  listArchived(payload?: { projectIds?: string[] }): Promise<ArchivedSessionItem[]> {
    return window.electronAPI.sessions.listArchived(payload);
  },
  restore(payload: { archiveId: string }): Promise<{ ok: boolean }> {
    return window.electronAPI.sessions.restore(payload.archiveId);
  },
};
