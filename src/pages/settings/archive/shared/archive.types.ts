export interface ArchivedSession {
  archiveId: string;
  sessionId: string;
  name: string;
  cwd: string;
  provider: string;
  archivedAt: string;
}

export interface ArchiveListResult {
  archived: ArchivedSession[];
  total: number;
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
