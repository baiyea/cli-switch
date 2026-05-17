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
