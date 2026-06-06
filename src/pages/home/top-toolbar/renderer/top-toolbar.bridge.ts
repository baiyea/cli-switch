export interface SkillgenRunPayload {
  projectId: string;
  trigger?: string;
  rebuild?: boolean;
  focusSessionId?: string;
}

export interface SkillgenRunResult {
  ok: boolean;
  projectId: string;
  projectPath: string;
  trigger: string;
  rebuild: boolean;
  scanned: number;
  changed: number;
  skipped: number;
  missing: number;
  parseFailed: number;
  accepted: number;
  drafted: number;
  discarded: number;
  created: number;
  updated: number;
  skillPaths: string[];
  warnings: string[];
  elapsedMs: number;
  finishedAt: string;
  logPath: string;
}

export interface SessionsDumpRunPayload {
  projectId: string;
  trigger?: string;
}

export interface SessionsDumpRunResult {
  ok: boolean;
  projectId: string;
  projectPath: string;
  trigger: string;
  sessionsRoot: string;
  yesterdayStart: string;
  scanned: number;
  inWindow: number;
  changed: number;
  dumpedFiles: number;
  appendedRounds: number;
  skippedUnchanged: number;
  skippedOutOfWindow: number;
  parseFailed: number;
  warnings: string[];
  files: string[];
  elapsedMs: number;
  finishedAt: string;
  error?: string;
}

export const topToolbarBridge = {
  skillgen: {
    run(payload: SkillgenRunPayload): Promise<SkillgenRunResult> {
      return window.electronAPI.skillgen.run(payload);
    },
  },
  sessionsDump: {
    run(payload: SessionsDumpRunPayload): Promise<SessionsDumpRunResult> {
      return window.electronAPI.sessionsDump.run(payload);
    },
  },
  window: {
    setTrafficLightPosition(payload: { x: number; y: number }): Promise<{ ok: boolean }> {
      return window.electronAPI.windowControls.setTrafficLightPosition(payload);
    },
    openExternal(url: string): Promise<void> {
      return window.electronAPI.windowControls.openExternal({ url });
    },
    minimize(): Promise<{ ok: boolean }> {
      return window.electronAPI.windowControls.minimize();
    },
    toggleMaximize(): Promise<{ ok: boolean; isMaximized: boolean }> {
      return window.electronAPI.windowControls.toggleMaximize();
    },
    close(): Promise<{ ok: boolean }> {
      return window.electronAPI.windowControls.close();
    },
    quitApp(): Promise<{ ok: boolean }> {
      return window.electronAPI.windowControls.quitApp();
    },
  },
};
