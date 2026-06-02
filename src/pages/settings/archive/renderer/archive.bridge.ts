export interface ArchivedSessionItem {
  archiveId: string;
  sessionId: string;
  provider: 'claude' | 'codex' | 'gemini';
  projectId: string | null;
  name: string;
  cwd: string;
  archivedAt: number;
}

export interface ArchiveCleanupResult {
  ok: boolean;
  retentionDays: number;
  cutoffIso: string;
  scanned: number;
  deletedRecords: number;
  deletedFiles: number;
  missingFiles: number;
  skipped: number;
  cleanedFiles: string[];
  warnings: string[];
}

export const archiveBridge = {
  listArchived(payload?: { projectIds?: string[] }): Promise<ArchivedSessionItem[]> {
    return window.electronAPI.sessions.listArchived(payload);
  },
  restore(payload: { archiveId: string }): Promise<{ ok: boolean }> {
    return window.electronAPI.sessions.restore(payload.archiveId);
  },
  cleanupExpired(): Promise<ArchiveCleanupResult> {
    return window.electronAPI.sessions.cleanupExpiredArchived();
  },
};
