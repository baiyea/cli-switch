export interface PtyCreatePayload {
  cwd: string;
  name?: string;
}

export interface PtyCreateResult {
  sessionId: string;
  name: string;
}

export interface PtyDataEvent {
  sessionId: string;
  data: string;
}

export interface PtyExitEvent {
  sessionId: string;
  exitCode: number;
}

export interface PtySnapshotResult {
  sessionId: string;
  data: string;
}

export interface SessionStats {
  provider: 'claude' | 'codex' | 'gemini';
  providerSessionId: string;
  startedAt: number | null;
  endedAt: number | null;
  durationMs: number;
  rounds: number;
  tokens: {
    input: number;
    output: number;
    cached: number;
    reasoning: number;
    tool: number;
    total: number;
    available: boolean;
  };
  sourcePath?: string;
}

export interface PersistedSessionItem {
  sessionId: string;
  name: string;
  cwd: string;
  projectId: string;
  provider: 'claude' | 'codex' | 'gemini';
  providerSessionId: string;
  status: 'creating' | 'running' | 'exited';
  createdAt: number;
  updatedAt?: number;
  sortOrder?: number;
}

export const ptyBridge = {
  create(payload: PtyCreatePayload): Promise<PtyCreateResult> {
    return window.electronAPI.pty.create(payload);
  },
  snapshot(sessionId: string): Promise<PtySnapshotResult> {
    return window.electronAPI.pty.snapshot({ sessionId });
  },
  input(sessionId: string, data: string): void {
    window.electronAPI.pty.input({ sessionId, data });
  },
  resize(sessionId: string, cols: number, rows: number): void {
    window.electronAPI.pty.resize({ sessionId, cols, rows });
  },
  destroy(sessionId: string): void {
    window.electronAPI.pty.destroy({ sessionId });
  },
  onData(listener: (event: PtyDataEvent) => void): () => void {
    return window.electronAPI.pty.onData(listener);
  },
  onExit(listener: (event: PtyExitEvent) => void): () => void {
    return window.electronAPI.pty.onExit(listener);
  },
};

export const terminalSessionBridge = {
  list(payload?: { projectIds?: string[]; providers?: string[] }): Promise<PersistedSessionItem[]> {
    return window.electronAPI.sessions.list(payload) as Promise<PersistedSessionItem[]>;
  },
  create(payload: {
    projectId: string;
    cwd?: string;
    title?: string;
    provider?: string;
  }): Promise<PersistedSessionItem> {
    return window.electronAPI.sessions.create(payload) as Promise<PersistedSessionItem>;
  },
  start(payload: {
    sessionId: string;
    cwd?: string;
    name?: string;
    provider?: string;
    providerSessionId?: string;
  }): Promise<PersistedSessionItem> {
    return window.electronAPI.sessions.start(payload) as Promise<PersistedSessionItem>;
  },
  rename(payload: {
    sessionId: string;
    title: string;
    provider?: string;
    providerSessionId?: string;
  }): Promise<{ ok: boolean }> {
    return window.electronAPI.sessions.rename(payload);
  },
  reorder(payload: {
    projectId: string;
    orderedSessions: Array<{ provider: 'claude' | 'codex' | 'gemini'; providerSessionId: string }>;
  }): Promise<{ ok: boolean }> {
    return window.electronAPI.sessions.reorder(payload);
  },
  archive(payload: {
    sessionId: string;
    provider?: string;
    providerSessionId?: string;
  }): Promise<{ ok: boolean }> {
    return window.electronAPI.sessions.archive(payload);
  },
  stats(payload: {
    provider?: 'claude' | 'codex' | 'gemini';
    providerSessionId?: string;
    sessionId?: string;
  }): Promise<{ ok: true; stats: SessionStats } | { ok: false; reason: string }> {
    return window.electronAPI.sessions.stats(payload);
  },
  suggestTitle(payload: {
    sessionId: string;
    provider?: string;
    providerSessionId?: string;
  }): Promise<{ ok: boolean; title: string; source: 'llm' | 'fallback'; reason?: string }> {
    return window.electronAPI.sessions.suggestTitle(payload);
  },
};

export const sessionBridge = terminalSessionBridge;

export const fileAttachmentBridge = {
  saveAttachmentImage(payload: { cwd: string; sessionId: string }) {
    return window.electronAPI.files.saveAttachmentImage(payload);
  },
  saveAttachmentImageBuffer(payload: {
    cwd: string;
    sessionId: string;
    base64: string;
    mimeType: string;
  }) {
    return window.electronAPI.files.saveAttachmentImageBuffer(payload);
  },
};
