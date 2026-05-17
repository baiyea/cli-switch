import React from "react";
import { Tree } from "react-arborist";
import { FileIcon, FolderIcon, OpenFolderIcon } from "react-files-icons";
import { Button } from "../../../ui/button";
import { ChevronDownIcon, ChevronRightIcon, FolderOpenIcon } from "../../../ui/icon-registry";

export function ExplorerPane({
  explorerVisible,
  activeProject,
  activeWorkspaceCwd,
  explorerCwd,
  explorerTreeWrapRef,
  explorerLoading,
  explorerTree,
  explorerTreeHeight,
  explorerIsGitRepo,
  onOpenWorkspaceInFileManager,
  onOpenExplorerFile
}) {
  return (
    <aside className={`explorer ${explorerVisible ? "open" : "closed"}`}>
      <div className="explorer-head">
        <span>EXPLORER</span>
        <div className="explorer-actions">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Open Workspace"
            aria-label="Open Workspace"
            onClick={onOpenWorkspaceInFileManager}
            disabled={!activeWorkspaceCwd && !activeProject?.path}
          >
            <FolderOpenIcon size={14} />
          </Button>
        </div>
      </div>

      {activeProject ? (
        <div className="explorer-tree">
          <div className="explorer-tree-wrap" ref={explorerTreeWrapRef}>
            {explorerLoading ? (
              <div className="explorer-empty">Loading directory...</div>
            ) : (
              <Tree
                data={explorerTree}
                idAccessor={(item) => item.path}
                childrenAccessor={(item) => item.children}
                width="100%"
                height={explorerTreeHeight}
                rowHeight={20}
                indent={20}
                openByDefault={false}
                className="explorer-arborist"
              >
                {({ node, style, dragHandle }) => (
                  <div
                    style={style}
                    ref={dragHandle}
                    className={`explorer-node-row ${node.isSelected ? "selected" : ""}`}
                    title={node.data.path}
                    onDoubleClick={(e) => {
                      if (node.data.type !== "file") return;
                      e.preventDefault();
                      e.stopPropagation();
                      void onOpenExplorerFile(node.data.path);
                    }}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="explorer-toggle"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!node.isInternal) return;
                        node.toggle();
                      }}
                    >
                      {node.isInternal ? (node.isOpen ? <ChevronDownIcon size={10} /> : <ChevronRightIcon size={10} />) : ""}
                    </Button>
                    {node.isInternal ? (
                      node.isOpen ? (
                        <OpenFolderIcon name={node.data.name} className="explorer-node-icon folder" aria-hidden="true" />
                      ) : (
                        <FolderIcon name={node.data.name} className="explorer-node-icon folder" aria-hidden="true" />
                      )
                    ) : (
                      <FileIcon name={node.data.name} className="explorer-node-icon file" aria-hidden="true" />
                    )}
                    <span className="explorer-node-name">{node.data.name}</span>
                    {explorerIsGitRepo && node.data.type === "directory" && node.data.hasGitChanges && (
                      <span className="explorer-git-dot" aria-hidden="true" />
                    )}
                    {explorerIsGitRepo && node.data.type === "file" && node.data.gitStatus && (
                      <span className={`explorer-git-badge git-${String(node.data.gitStatus).toLowerCase()}`}>
                        {node.data.gitStatus}
                      </span>
                    )}
                  </div>
                )}
              </Tree>
            )}
          </div>
        </div>
      ) : (
        <div className="explorer-empty">Select a project to view the file tree.</div>
      )}
    </aside>
  );
}
