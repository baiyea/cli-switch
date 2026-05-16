/// <reference types="vite/client" />

interface Window {
  api: {
    terminal: {
      start: (payload: { cwd: string; name?: string }) => Promise<{ sessionId: string; name: string }>;
      snapshot: (payload: { sessionId: string }) => Promise<string>;
      write: (payload: { sessionId: string; data: string }) => void;
      resize: (payload: { sessionId: string; cols: number; rows: number }) => void;
      kill: (payload: { sessionId: string }) => void;
      onData: (listener: (payload: { sessionId: string; data: string }) => void) => () => void;
      onExit: (listener: (payload: { sessionId: string; exitCode: number }) => void) => () => void;
    };
  };
}
