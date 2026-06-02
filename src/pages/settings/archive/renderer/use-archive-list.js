import { useState } from 'react';

import { archiveBridge } from './archive.bridge';

export function useArchiveList({ refreshSessions } = {}) {
  const [archivedSessions, setArchivedSessions] = useState([]);
  const [archiveCleanupRunning, setArchiveCleanupRunning] = useState(false);
  const [archiveCleanupResult, setArchiveCleanupResult] = useState(null);

  async function loadArchivedSessions() {
    const list = await archiveBridge.listArchived();
    setArchivedSessions(list);
    return list;
  }

  async function onRestoreArchivedSession(archiveId) {
    await archiveBridge.restore({ archiveId });
    await Promise.all([refreshSessions?.(), loadArchivedSessions()]);
  }

  async function onCleanupExpiredArchivedSessions() {
    if (archiveCleanupRunning) return archiveCleanupResult;
    setArchiveCleanupRunning(true);
    setArchiveCleanupResult(null);
    try {
      const result = await archiveBridge.cleanupExpired();
      setArchiveCleanupResult(result);
      await Promise.all([refreshSessions?.(), loadArchivedSessions()]);
      return result;
    } catch (error) {
      const result = {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        deletedRecords: 0,
        deletedFiles: 0,
        missingFiles: 0,
        skipped: 0,
        warnings: [],
      };
      setArchiveCleanupResult(result);
      return result;
    } finally {
      setArchiveCleanupRunning(false);
    }
  }

  return {
    archivedSessions,
    archiveCleanupRunning,
    archiveCleanupResult,
    loadArchivedSessions,
    onRestoreArchivedSession,
    onCleanupExpiredArchivedSessions,
  };
}
