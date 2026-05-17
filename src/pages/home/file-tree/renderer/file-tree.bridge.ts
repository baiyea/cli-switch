export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  gitStatus?: "" | "M" | "A" | "D" | "U";
  hasGitChanges?: boolean;
  children?: FileTreeNode[];
}

export const fileTreeBridge = {
  readTree(payload: { cwd: string; depth?: number }): Promise<{ cwd: string; isGitRepo: boolean; items: FileTreeNode[] }> {
    return window.electronAPI.files.readTree(payload) as Promise<{ cwd: string; isGitRepo: boolean; items: FileTreeNode[] }>;
  },
  openPath(payload: { path: string }): Promise<{ ok: boolean }> {
    const filesApi = (window.electronAPI as unknown as {
      files?: {
        openPath?: (input: { path: string }) => Promise<{ ok: boolean }>;
        open?: (input: { path: string }) => Promise<{ ok: boolean }>;
      };
    })?.files;
    if (typeof filesApi?.openPath === "function") return filesApi.openPath(payload);
    if (typeof filesApi?.open === "function") return filesApi.open(payload);
    throw new Error("files.openPath is not exposed");
  }
};
