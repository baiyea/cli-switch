import { useState } from "react";
import { archiveBridge } from "./archive.bridge";

export function useArchiveList({ refreshSessions } = {}) {
  const [archivedSessions, setArchivedSessions] = useState([]);

  async function loadArchivedSessions() {
    const list = await archiveBridge.listArchived();
    setArchivedSessions(list);
    return list;
  }

  async function onRestoreArchivedSession(archiveId) {
    await archiveBridge.restore({ archiveId });
    await Promise.all([
      refreshSessions?.(),
      loadArchivedSessions()
    ]);
  }

  return {
    archivedSessions,
    loadArchivedSessions,
    onRestoreArchivedSession
  };
}
