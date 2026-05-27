import { useEffect, useRef, useState } from 'react';

import { logBridge } from '../../../../shared/bridge';
import { fileTreeBridge } from './file-tree.bridge';

export function useFileTree({ activeProject, activeWorkspaceCwd, explorerVisible, setAppError }) {
  const [explorerTree, setExplorerTree] = useState([]);
  const [explorerCwd, setExplorerCwd] = useState('');
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [explorerIsGitRepo, setExplorerIsGitRepo] = useState(false);
  const [explorerTreeHeight, setExplorerTreeHeight] = useState(300);
  const explorerTreeWrapRef = useRef(null);

  async function loadExplorerTree(cwd, options = {}) {
    const silent = Boolean(options.silent);
    if (!cwd) {
      setExplorerTree([]);
      setExplorerCwd('');
      setExplorerIsGitRepo(false);
      return;
    }
    if (!silent) setExplorerLoading(true);
    try {
      const result = await fileTreeBridge.readTree({ cwd, depth: 6 });
      setExplorerTree(result.items || []);
      setExplorerCwd(result.cwd || cwd);
      setExplorerIsGitRepo(Boolean(result.isGitRepo));
    } catch {
      setExplorerTree([]);
      setExplorerCwd(cwd);
      setExplorerIsGitRepo(false);
    } finally {
      if (!silent) setExplorerLoading(false);
    }
  }

  async function onOpenWorkspaceInFileManager() {
    const target = activeWorkspaceCwd || activeProject?.path || '';
    if (!target) return;
    try {
      await fileTreeBridge.openPath({ path: target });
    } catch (e) {
      setAppError?.(`打开目录失败：${e?.message || '未知错误'}`);
    }
  }

  async function onOpenExplorerFile(path) {
    if (!path) return;
    try {
      await fileTreeBridge.openPath({ path });
    } catch (e) {
      setAppError?.(`打开文件失败：${e?.message || '未知错误'}`);
    }
  }

  useEffect(() => {
    logBridge.write({
      level: 'debug',
      scope: 'app',
      message: 'Loading explorer tree',
      meta: { cwd: activeWorkspaceCwd || '' },
    });
    loadExplorerTree(activeWorkspaceCwd);
  }, [activeWorkspaceCwd]);

  useEffect(() => {
    if (!activeProject || !explorerVisible || !activeWorkspaceCwd) return undefined;

    const timer = window.setInterval(() => {
      loadExplorerTree(activeWorkspaceCwd, { silent: true });
    }, 2000);

    return () => window.clearInterval(timer);
  }, [activeProject, explorerVisible, activeWorkspaceCwd]);

  useEffect(() => {
    if (!activeProject || !explorerVisible) return undefined;

    const updateHeight = () => {
      const container = explorerTreeWrapRef.current;
      if (!container) return;
      const nextHeight = Math.max(180, Math.floor(container.getBoundingClientRect().height));
      setExplorerTreeHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    };

    const scheduleUpdate = () => window.requestAnimationFrame(updateHeight);
    const raf1 = window.requestAnimationFrame(updateHeight);
    const raf2 = window.requestAnimationFrame(scheduleUpdate);
    window.addEventListener('resize', scheduleUpdate);

    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(scheduleUpdate);
      const container = explorerTreeWrapRef.current;
      if (container) observer.observe(container);
    }

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      window.removeEventListener('resize', scheduleUpdate);
      if (observer) observer.disconnect();
    };
  }, [activeProject, explorerVisible, explorerCwd]);

  return {
    explorerCwd,
    explorerTreeWrapRef,
    explorerLoading,
    explorerTree,
    explorerTreeHeight,
    explorerIsGitRepo,
    onOpenWorkspaceInFileManager,
    onOpenExplorerFile,
    explorerPaneProps: {
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
      onOpenExplorerFile,
    },
  };
}
