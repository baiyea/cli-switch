export {};

declare global {
  interface Window {
    __ZEELIN_TEST__?: {
      getSessionBuffer: (sessionId: string) => string;
      getPaneDisplay: (sessionId: string) => string | null;
      getLastResize: (sessionId: string) => { cols: number; rows: number } | null;
    };
    electronAPI: {
      pty: {
        create: (payload: { cwd: string; name?: string }) => Promise<{ sessionId: string; name: string }>;
        snapshot: (payload: { sessionId: string }) => Promise<{ sessionId: string; data: string }>;
        input: (payload: { sessionId: string; data: string }) => void;
        resize: (payload: { sessionId: string; cols: number; rows: number }) => void;
        destroy: (payload: { sessionId: string }) => void;
        onData: (listener: (payload: { sessionId: string; data: string }) => void) => () => void;
        onExit: (listener: (payload: { sessionId: string; exitCode: number }) => void) => () => void;
      };
      projects: {
        list: () => Promise<Array<{ id: string; name: string; path: string }>>;
        add: () => Promise<{ id: string; name: string; path: string } | null>;
        remove: (id: string) => Promise<void>;
      };
      sessions: {
        list: (payload?: { projectIds?: string[]; providers?: string[] }) => Promise<Array<{
          sessionId: string;
          name: string;
          cwd: string;
          projectId: string;
          provider: "claude" | "codex" | "gemini";
          providerSessionId: string;
          status: "creating" | "running" | "exited";
          createdAt: number;
        }>>;
        create: (payload: { projectId: string; cwd?: string; title?: string; provider?: string }) => Promise<{
          sessionId: string;
          name: string;
          cwd: string;
          projectId: string;
          provider: "claude" | "codex" | "gemini";
          providerSessionId: string;
          status: "creating" | "running" | "exited";
          createdAt: number;
        }>;
        start: (payload: { sessionId: string; cwd?: string; name?: string; provider?: string; providerSessionId?: string }) => Promise<{
          sessionId: string;
          name: string;
          cwd: string;
          projectId: string;
          provider: "claude" | "codex" | "gemini";
          providerSessionId: string;
          status: "creating" | "running" | "exited";
          createdAt: number;
        }>;
        rename: (payload: { sessionId: string; title: string; provider?: string; providerSessionId?: string }) => Promise<{ ok: boolean }>;
        syncProject: (payload: { projectId: string }) => Promise<{ ok: boolean; count: number }>;
        archive: (payload: { sessionId: string; provider?: string; providerSessionId?: string }) => Promise<{ ok: boolean }>;
        listArchived: (payload?: { projectIds?: string[] }) => Promise<Array<{
          archiveId: string;
          sessionId: string;
          provider: "claude" | "codex" | "gemini";
          projectId: string | null;
          name: string;
          cwd: string;
          archivedAt: number;
        }>>;
        restore: (sessionId: string) => Promise<{ ok: boolean }>;
      };
      settings: {
        getClaude: () => Promise<{
          providers: Record<string, {
            defaultProfileId: string;
            enabledProfileId?: string;
            profiles: Array<{
              id: string;
              name: string;
              envVars: Array<{ key: string; value: string }>;
            }>;
          }>;
        }>;
        saveClaude: (payload: {
          providers: Record<string, {
            defaultProfileId: string;
            enabledProfileId?: string;
            profiles: Array<{
              id: string;
              name: string;
              envVars: Array<{ key: string; value: string }>;
            }>;
          }>;
        }) => Promise<{
          providers: Record<string, {
            defaultProfileId: string;
            enabledProfileId?: string;
            profiles: Array<{
              id: string;
              name: string;
              envVars: Array<{ key: string; value: string }>;
            }>;
          }>;
        }>;
        testProvider: (payload: {
          provider: "claude" | "codex" | "gemini";
          profileId: string;
          envVars: Array<{ key: string; value: string }>;
        }) => Promise<{
          ok: boolean;
          message: string;
        }>;
      };
      windowControls: {
        setTrafficLightPosition: (payload: { x: number; y: number }) => Promise<{ ok: boolean }>;
      };
      logs: {
        write: (payload: {
          level?: "debug" | "info" | "warn" | "error";
          scope?: string;
          message: string;
          meta?: unknown;
        }) => void;
      };
      files: {
        readTree: (payload: { cwd: string; depth?: number }) => Promise<{
          cwd: string;
          isGitRepo: boolean;
          items: Array<{
            name: string;
            path: string;
            type: "file" | "directory";
            gitStatus?: "" | "M" | "A" | "D" | "U";
            hasGitChanges?: boolean;
            children?: unknown[];
          }>;
        }>;
        openPath: (payload: { path: string }) => Promise<{ ok: boolean }>;
      };
    };
  }
}
