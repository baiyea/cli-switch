export interface HomeWorkspaceState {
  activeProjectId: string | null;
  activeSessionId: string | null;
  activeCwd: string | null;
}

export type HomeProviderId = "claude" | "codex" | "gemini" | "shell";
