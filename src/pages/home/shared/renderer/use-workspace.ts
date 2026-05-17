import { useWorkspaceStore } from "./workspace.store";

export function useWorkspace() {
  return useWorkspaceStore();
}
