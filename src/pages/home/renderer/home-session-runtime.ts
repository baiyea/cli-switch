type ElectronApi = Window["electronAPI"];
type SessionApi = ElectronApi["sessions"];

export type PersistedSessionItem = Awaited<ReturnType<SessionApi["create"]>>;
export type SessionProvider = PersistedSessionItem["provider"];

interface HomeSessionRuntime {
  list(payload?: { projectIds?: string[]; providers?: string[] }): Promise<PersistedSessionItem[]>;
  create(payload: { projectId: string; cwd?: string; title?: string; provider?: string }): Promise<PersistedSessionItem>;
  start(payload: {
    sessionId: string;
    cwd?: string;
    name?: string;
    provider?: string;
    providerSessionId?: string;
  }): Promise<PersistedSessionItem>;
  rename(payload: { sessionId: string; title: string; provider?: string; providerSessionId?: string }): Promise<{ ok: boolean }>;
  reorder(payload: {
    projectId: string;
    orderedSessions: Array<{ provider: SessionProvider; providerSessionId: string }>;
  }): Promise<{ ok: boolean }>;
  archive(payload: { sessionId: string; provider?: string; providerSessionId?: string }): Promise<{ ok: boolean }>;
}

interface HomePtyRuntime {
  destroy(sessionId: string): void;
}

export interface HomeRuntime {
  sessions: HomeSessionRuntime;
  pty: HomePtyRuntime;
}

export function createHomeRuntime(electronAPI: ElectronApi = window.electronAPI): HomeRuntime {
  return {
    sessions: {
      list(payload) {
        return electronAPI.sessions.list(payload) as Promise<PersistedSessionItem[]>;
      },
      create(payload) {
        return electronAPI.sessions.create(payload) as Promise<PersistedSessionItem>;
      },
      start(payload) {
        return electronAPI.sessions.start(payload) as Promise<PersistedSessionItem>;
      },
      rename(payload) {
        return electronAPI.sessions.rename(payload);
      },
      reorder(payload) {
        return electronAPI.sessions.reorder(payload);
      },
      archive(payload) {
        return electronAPI.sessions.archive(payload);
      }
    },
    pty: {
      destroy(sessionId: string) {
        electronAPI.pty.destroy({ sessionId });
      }
    }
  };
}

export const homeRuntime = createHomeRuntime();
