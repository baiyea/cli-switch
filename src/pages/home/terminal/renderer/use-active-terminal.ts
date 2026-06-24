import { type RefObject,useEffect } from 'react';

import { logBridge } from '../../../../shared/bridge';
import { useSessionStore } from '../../home.store';
import { isWindowsPlatform } from './terminal-platform';
import type { TermEntry } from './terminal-types';

type UseActiveTerminalParams = {
  activeSessionId: string | null;
  activeSessionIdRef: RefObject<string | null>;
  fitActiveTerminal: () => void;
  getTerminalDebugMeta: (sessionId: string) => Record<string, unknown>;
  isAtScrollBottom: (term: TermEntry['term']) => boolean;
  lastResizeRef: RefObject<Map<string, { cols: number; rows: number }>>;
  logTerminalDebug: (
    message: string,
    sessionId: string,
    extra?: Record<string, unknown>,
  ) => void;
  pendingStartSessionRef: RefObject<Set<string>>;
  postFitStartAttemptRef: RefObject<Set<string>>;
  safeResizePty: (sessionId: string, entry: TermEntry) => void;
  scrollToBottomIfActive: (sessionId: string, term: TermEntry['term']) => void;
  setActiveScrolledUp: (value: boolean) => void;
  syncActiveScrollState: (sessionId?: string | null) => void;
  terminalRef: RefObject<Map<string, TermEntry>>;
};

export function useActiveTerminal({
  activeSessionId,
  activeSessionIdRef,
  fitActiveTerminal,
  getTerminalDebugMeta,
  isAtScrollBottom,
  lastResizeRef,
  logTerminalDebug,
  pendingStartSessionRef,
  postFitStartAttemptRef,
  safeResizePty,
  scrollToBottomIfActive,
  setActiveScrolledUp,
  syncActiveScrollState,
  terminalRef,
}: UseActiveTerminalParams) {
  function wakeActiveTerminalOnWindows() {
    if (!isWindowsPlatform()) return;
    const sid = activeSessionIdRef.current;
    if (!sid) return;
    const entry = terminalRef.current.get(sid);
    if (!entry) {
      logTerminalDebug('Windows terminal wake skipped: no xterm entry', sid);
      return;
    }
    try {
      logTerminalDebug('Windows terminal wake start', sid);
      const shouldFollowOutput = isAtScrollBottom(entry.term);
      entry.fitAddon.fit();
      safeResizePty(sid, entry);
      if (shouldFollowOutput) {
        scrollToBottomIfActive(sid, entry.term);
      }
      if (entry.term.rows > 0) {
        entry.term.refresh(0, entry.term.rows - 1);
      }
      entry.term.focus();
      logTerminalDebug('Windows terminal wake finished', sid);
    } catch (error) {
      logBridge.write({
        level: 'warn',
        scope: 'terminal',
        message: 'Windows terminal wake failed',
        meta: { sessionId: sid, error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  function startActiveSessionWithMeasuredSize(sessionId: string) {
    const resize = lastResizeRef.current.get(sessionId);
    if (!resize) {
      logTerminalDebug('Ensuring session running skipped: no measured terminal size', sessionId);
      pendingStartSessionRef.current.add(sessionId);
      return false;
    }
    pendingStartSessionRef.current.delete(sessionId);
    logBridge.write({
      level: 'info',
      scope: 'app',
      message: 'Ensuring session running',
      meta: { activeSessionId: sessionId, initialCols: resize.cols, initialRows: resize.rows },
    });
    void useSessionStore.getState().ensureSessionRunning(sessionId, {
      initialCols: resize.cols,
      initialRows: resize.rows,
      force: true,
    });
    return true;
  }

  function startPendingActiveSessionIfMeasured(sessionId: string) {
    if (activeSessionIdRef.current !== sessionId) return;
    if (
      !pendingStartSessionRef.current.has(sessionId) &&
      postFitStartAttemptRef.current.has(sessionId)
    ) {
      return;
    }
    postFitStartAttemptRef.current.add(sessionId);
    const started = startActiveSessionWithMeasuredSize(sessionId);
    if (started) {
      logTerminalDebug('Pending active session start completed after terminal fit', sessionId);
    }
  }

  useEffect(() => {
    let startRequested = false;
    const wakeTimers: number[] = [];
    if (activeSessionId) {
      postFitStartAttemptRef.current.delete(activeSessionId);
    }
    const fitAndStart = () => {
      fitActiveTerminal();
      if (activeSessionId && !startRequested) {
        startRequested = startActiveSessionWithMeasuredSize(activeSessionId);
      }
    };

    fitAndStart();
    const raf = window.requestAnimationFrame(fitAndStart);
    if (isWindowsPlatform()) {
      wakeTimers.push(window.setTimeout(wakeActiveTerminalOnWindows, 0));
      wakeTimers.push(window.setTimeout(wakeActiveTerminalOnWindows, 80));
      wakeTimers.push(window.setTimeout(wakeActiveTerminalOnWindows, 180));
    }
    syncActiveScrollState(activeSessionId);
    logBridge.write({
      level: 'info',
      scope: 'terminal',
      message: 'Active session changed',
      meta: activeSessionId ? getTerminalDebugMeta(activeSessionId) : { activeSessionId: null },
    });
    const onResize = () => fitActiveTerminal();
    window.addEventListener('resize', onResize);
    return () => {
      window.cancelAnimationFrame(raf);
      for (const timer of wakeTimers) {
        window.clearTimeout(timer);
      }
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  useEffect(() => {
    if (!activeSessionId) {
      setActiveScrolledUp(false);
      return undefined;
    }
    syncActiveScrollState(activeSessionId);
    const timer = window.setInterval(() => syncActiveScrollState(activeSessionId), 250);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  return {
    startPendingActiveSessionIfMeasured,
  };
}
