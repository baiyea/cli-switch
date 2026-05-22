import React, { useMemo, useState } from 'react';
import { FileIcon, FolderIcon, OpenFolderIcon } from 'react-files-icons';

import { logBridge } from '../../../../shared/bridge';
import { Button } from '../../../../ui/button';
import { ChevronDownIcon, ChevronRightIcon, FolderOpenIcon } from '../../../../ui/icon-registry';

const EXPLORER_ROW_HEIGHT = 20;
const EXPLORER_INDENT = 20;

function flattenExplorerTree(items = [], openPaths = new Set(), depth = 0, rows = []) {
  for (const item of items || []) {
    const children = Array.isArray(item?.children) ? item.children : [];
    const isInternal = item?.type === 'directory' && children.length > 0;
    const path = String(item?.path || '');
    const isOpen = isInternal && openPaths.has(path);

    rows.push({
      item,
      depth,
      isInternal,
      isOpen,
    });

    if (isOpen) {
      flattenExplorerTree(children, openPaths, depth + 1, rows);
    }
  }
  return rows;
}

class ExplorerErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    logBridge.write({
      level: 'error',
      scope: 'explorer',
      message: 'Explorer pane render failed',
      meta: {
        error: error?.message || String(error),
        componentStack: info?.componentStack,
      },
    });
  }

  render() {
    if (this.state.hasError) {
      return <div className="explorer-empty">Explorer failed to render.</div>;
    }
    return this.props.children;
  }
}

function ExplorerFlatTree({
  explorerTree,
  explorerTreeHeight,
  explorerIsGitRepo,
  onOpenExplorerFile,
}) {
  const [openPaths, setOpenPaths] = useState(() => new Set());
  const [selectedPath, setSelectedPath] = useState('');
  const rows = useMemo(
    () => flattenExplorerTree(explorerTree, openPaths),
    [explorerTree, openPaths],
  );

  const togglePath = (path) => {
    setOpenPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <div
      className="explorer-flat-tree"
      role="tree"
      style={{ height: explorerTreeHeight }}
      aria-label="Workspace files"
    >
      {rows.map(({ item, depth, isInternal, isOpen }) => {
        const itemPath = String(item?.path || '');
        const itemName = String(item?.name || itemPath);
        const selected = itemPath && itemPath === selectedPath;

        return (
          <div
            key={itemPath || itemName}
            role="treeitem"
            aria-expanded={isInternal ? isOpen : undefined}
            aria-selected={selected}
            style={{ height: EXPLORER_ROW_HEIGHT, paddingLeft: depth * EXPLORER_INDENT }}
            className={`explorer-node-row ${selected ? 'selected' : ''}`}
            title={itemPath}
            onClick={() => {
              setSelectedPath(itemPath);
              if (isInternal) {
                togglePath(itemPath);
              }
            }}
            onDoubleClick={(e) => {
              if (item?.type !== 'file') return;
              e.preventDefault();
              e.stopPropagation();
              void onOpenExplorerFile(itemPath);
            }}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="explorer-toggle"
              aria-label={
                isInternal ? (isOpen ? `Collapse ${itemName}` : `Expand ${itemName}`) : ''
              }
              tabIndex={isInternal ? 0 : -1}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!isInternal) return;
                togglePath(itemPath);
              }}
            >
              {isInternal ? (
                isOpen ? (
                  <ChevronDownIcon size={10} />
                ) : (
                  <ChevronRightIcon size={10} />
                )
              ) : (
                ''
              )}
            </Button>
            {isInternal ? (
              isOpen ? (
                <OpenFolderIcon
                  name={itemName}
                  className="explorer-node-icon folder"
                  aria-hidden="true"
                />
              ) : (
                <FolderIcon
                  name={itemName}
                  className="explorer-node-icon folder"
                  aria-hidden="true"
                />
              )
            ) : (
              <FileIcon name={itemName} className="explorer-node-icon file" aria-hidden="true" />
            )}
            <span className="explorer-node-name">{itemName}</span>
            {explorerIsGitRepo && item?.type === 'directory' && item?.hasGitChanges && (
              <span className="explorer-git-dot" aria-hidden="true" />
            )}
            {explorerIsGitRepo && item?.type === 'file' && item?.gitStatus && (
              <span className={`explorer-git-badge git-${String(item.gitStatus).toLowerCase()}`}>
                {item.gitStatus}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ExplorerPane({
  explorerVisible,
  activeProject,
  activeWorkspaceCwd,
  explorerTreeWrapRef,
  explorerLoading,
  explorerTree,
  explorerTreeHeight,
  explorerIsGitRepo,
  onOpenWorkspaceInFileManager,
  onOpenExplorerFile,
}) {
  return (
    <aside className={`explorer ${explorerVisible ? 'open' : 'closed'}`}>
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
              <ExplorerErrorBoundary>
                <ExplorerFlatTree
                  explorerTree={explorerTree}
                  explorerTreeHeight={explorerTreeHeight}
                  explorerIsGitRepo={explorerIsGitRepo}
                  onOpenExplorerFile={onOpenExplorerFile}
                />
              </ExplorerErrorBoundary>
            )}
          </div>
        </div>
      ) : (
        <div className="explorer-empty">Select a project to view the file tree.</div>
      )}
    </aside>
  );
}
