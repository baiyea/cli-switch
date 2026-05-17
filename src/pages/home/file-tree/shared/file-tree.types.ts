export type FileTreeItemType = "file" | "directory";

export interface FileTreeItem {
  name: string;
  path: string;
  type: FileTreeItemType;
  children?: FileTreeItem[];
  hasGitChanges?: boolean;
  gitStatus?: string;
}

export interface FileTreeResult {
  root: string;
  tree: FileTreeItem[];
}
