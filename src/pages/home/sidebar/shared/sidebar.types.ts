export interface Project {
  id: string;
  name: string;
  path: string;
  defaultProvider: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionListItem {
  sessionId: string;
  name: string;
  cwd: string;
  projectId: string;
  provider: string;
  status?: string;
  runtimeStatus?: string;
  sortOrder?: number;
  createdAt?: number;
}

export type DragSessionState = {
  draggingSessionId: string | null;
  dragOverSessionId: string | null;
};
