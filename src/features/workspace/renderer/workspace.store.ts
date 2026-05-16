import { create } from "zustand";
import type { WorkspaceState } from "../shared/workspace.types";

interface WorkspaceStore extends WorkspaceState {
  selectProject: (projectId: string, cwd?: string) => void;
  selectSession: (sessionId: string, projectId: string, cwd?: string) => void;
  clearSelection: () => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  activeProjectId: null,
  activeSessionId: null,
  activeCwd: null,

  selectProject(projectId, cwd) {
    set({
      activeProjectId: projectId,
      activeSessionId: null,
      activeCwd: cwd ?? null,
    });
  },

  selectSession(sessionId, projectId, cwd) {
    set({
      activeSessionId: sessionId,
      activeProjectId: projectId,
      activeCwd: cwd ?? null,
    });
  },

  clearSelection() {
    set({
      activeProjectId: null,
      activeSessionId: null,
      activeCwd: null,
    });
  },
}));
