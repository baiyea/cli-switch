import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import { useEffect, useRef, useState } from 'react';

import { logBridge } from '../../../../shared/bridge';
import type { EffectiveTheme } from '../../../../ui/theme/theme.store';
import { useSessionStore } from '../../home.store';
import {
  installCodexScrollbackGuard,
  installCodexWheelScrollGuard,
} from './codex-scrollback-guard';
import { ptyBridge } from './terminal.bridge';
import {
  getTerminalDebugMeta as buildTerminalDebugMeta,
  logTerminalDebug as writeTerminalDebug,
} from './terminal-debug';
import {
  appendLimitedBuffer,
  stripEchoedTerminalReports,
  stripTerminalReports,
} from './terminal-output';
import type { PtyDataStats, TermEntry } from './terminal-types';
import { useActiveTerminal } from './use-active-terminal';
import { usePtyEvents } from './use-pty-events';
import { createTerminalPasteController } from './use-terminal-paste';
import { useTerminalTestApi } from './use-terminal-test-api';
import { getXtermTheme } from './xterm-theme';

const MIN_SAFE_WIDTH = 320;
const MIN_SAFE_HEIGHT = 120;

export function usePty(effectiveTheme: EffectiveTheme = 'dark') {
  const terminalRef = useRef<Map<string, TermEntry>>(new Map());
  const containerRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const resizeObserverRef = useRef<Map<string, ResizeObserver>>(new Map());
  const wheelCleanupRef = useRef<Map<string, () => void>>(new Map());
  const fitRafRef = useRef<Map<string, number>>(new Map());
  const bufferRef = useRef<Map<string, string>>(new Map());
  const dataStatsRef = useRef<Map<string, PtyDataStats>>(new Map());
  const lastResizeRef = useRef<Map<string, { cols: number; rows: number }>>(new Map());
  const replayMutedRef = useRef<Set<string>>(new Set());
  const pasteCleanupRef = useRef<Map<string, () => void>>(new Map());
  const pasteInFlightRef = useRef<Set<string>>(new Set());
  const nativeImagePasteInFlightRef = useRef<Set<string>>(new Set());
  const suppressNextTextPasteUntilRef = useRef<Map<string, number>>(new Map());
  const skipWindowsTextPasteUntilRef = useRef<Map<string, number>>(new Map());
  const pendingWindowsTextPasteRef = useRef<Map<string, { timer: number; text: string }>>(
    new Map(),
  );
  const activeSessionIdRef = useRef<string | null>(null);
  const pendingStartSessionRef = useRef<Set<string>>(new Set());
  const postFitStartAttemptRef = useRef<Set<string>>(new Set());
  const [activeScrolledUp, setActiveScrolledUp] = useState(false);
  const terminalDebugContext = {
    terminalRef,
    containerRef,
    bufferRef,
    lastResizeRef,
    activeSessionIdRef,
  };
  const pasteController = createTerminalPasteController({
    activeSessionIdRef,
    pasteInFlightRef,
    nativeImagePasteInFlightRef,
    suppressNextTextPasteUntilRef,
    skipWindowsTextPasteUntilRef,
    pendingWindowsTextPasteRef,
  });

  function getTerminalDebugMeta(sessionId: string, entry = terminalRef.current.get(sessionId)) {
    return buildTerminalDebugMeta(terminalDebugContext, sessionId, entry);
  }

  function logTerminalDebug(message: string, sessionId: string, extra: Record<string, unknown> = {}) {
    writeTerminalDebug(terminalDebugContext, message, sessionId, extra);
  }

  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const ingestOutput = useSessionStore((state) => state.ingestOutput);
  const markExited = useSessionStore((state) => state.markExited);
  const refreshRuntimeStatuses = useSessionStore((state) => state.refreshRuntimeStatuses);

  activeSessionIdRef.current = activeSessionId;

  function appendBuffer(sessionId: string, chunk: string) {
    const prev = bufferRef.current.get(sessionId) || '';
    bufferRef.current.set(sessionId, appendLimitedBuffer(prev, chunk));
  }

  function getPaneRect(sessionId: string) {
    const container = containerRef.current.get(sessionId);
    if (!container) return null;
    return container.getBoundingClientRect();
  }

  function safeResizePty(sessionId: string, entry: TermEntry) {
    if (activeSessionIdRef.current !== sessionId) {
      return;
    }
    const rect = getPaneRect(sessionId);
    if (!rect) return;
    if (rect.width < MIN_SAFE_WIDTH || rect.height < MIN_SAFE_HEIGHT) {
      logBridge.write({
        level: 'warn',
        scope: 'terminal',
        message: 'Skip PTY resize: pane too small',
        meta: {
          sessionId,
          width: Math.floor(rect.width),
          height: Math.floor(rect.height),
        },
      });
      return;
    }

    const cols = Math.max(1, entry.term.cols || 120);
    const rows = Math.max(1, entry.term.rows || 36);
    const prevResize = lastResizeRef.current.get(sessionId);
    ptyBridge.resize(sessionId, cols, rows);
    lastResizeRef.current.set(sessionId, { cols, rows });
    if (!prevResize || prevResize.cols !== cols || prevResize.rows !== rows) {
      logTerminalDebug('PTY resize sent', sessionId, {
        cols,
        rows,
        paneWidth: Math.floor(rect.width),
        paneHeight: Math.floor(rect.height),
      });
    }
  }

  function scrollToBottomIfActive(sessionId: string, term: Terminal) {
    if (activeSessionIdRef.current !== sessionId) return;
    try {
      term.scrollToBottom();
      setActiveScrolledUp(false);
    } catch {}
  }

  function isAtScrollBottom(term: Terminal) {
    try {
      const buffer = term.buffer.active;
      return buffer.baseY - buffer.viewportY <= 1;
    } catch {
      return true;
    }
  }

  function syncActiveScrollState(sessionId = activeSessionIdRef.current) {
    if (!sessionId || activeSessionIdRef.current !== sessionId) {
      setActiveScrolledUp(false);
      return;
    }
    const entry = terminalRef.current.get(sessionId);
    if (!entry) {
      setActiveScrolledUp(false);
      return;
    }
    const next = !isAtScrollBottom(entry.term);
    setActiveScrolledUp((prev) => (prev === next ? prev : next));
  }

  function scrollActiveToBottom() {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return false;
    const entry = terminalRef.current.get(sessionId);
    if (!entry) return false;
    scrollToBottomIfActive(sessionId, entry.term);
    entry.term.focus();
    return true;
  }

  function writeLiveTerminalData(sessionId: string, term: Terminal, data: string) {
    const shouldFollowOutput = activeSessionIdRef.current === sessionId && isAtScrollBottom(term);
    term.write(data, () => {
      if (shouldFollowOutput) {
        scrollToBottomIfActive(sessionId, term);
      }
      syncActiveScrollState(sessionId);
      if (String(data || '').length > 0) {
        logTerminalDebug('PTY data write completed', sessionId, {
          chunkLength: String(data || '').length,
          shouldFollowOutput,
          termRows: term.rows,
          baseY: term.buffer.active.baseY,
          viewportY: term.buffer.active.viewportY,
        });
      }
    });
  }

  function ensureTerminal(sessionId: string, container: HTMLDivElement) {
    const existing = terminalRef.current.get(sessionId);
    if (existing) {
      if (containerRef.current.get(sessionId) === container) {
        return;
      }
      // Remount path: rebuild xterm against the new DOM container.
      const existingWheelCleanup = wheelCleanupRef.current.get(sessionId);
      if (existingWheelCleanup) {
        existingWheelCleanup();
        wheelCleanupRef.current.delete(sessionId);
      }
      try {
        existing.term.dispose();
      } catch {}
      terminalRef.current.delete(sessionId);
      lastResizeRef.current.delete(sessionId);
      logBridge.write({
        level: 'info',
        scope: 'terminal',
        message: 'Recreating xterm instance for remount',
        meta: { sessionId },
      });
    }
    logBridge.write({
      level: 'info',
      scope: 'terminal',
      message: 'Creating xterm instance',
      meta: { sessionId },
    });

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      scrollback: 10000,
      fontSize: 11,
      lineHeight: 1.18,
      letterSpacing: 0,
      fontFamily: 'Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      theme: getXtermTheme(effectiveTheme),
    });

    const fitAddon = new FitAddon();
    const linkAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(linkAddon);
    installCodexScrollbackGuard(sessionId, term);
    const wheelCleanup = installCodexWheelScrollGuard(sessionId, container, term);
    if (wheelCleanup) wheelCleanupRef.current.set(sessionId, wheelCleanup);
    term.onScroll(() => syncActiveScrollState(sessionId));
    term.open(container);
    fitAddon.fit();
    logBridge.write({
      level: 'info',
      scope: 'terminal',
      message: 'xterm opened',
      meta: getTerminalDebugMeta(sessionId, { term, fitAddon }),
    });

    const prevCleanup = pasteCleanupRef.current.get(sessionId);
    if (prevCleanup) prevCleanup();
    pasteCleanupRef.current.set(
      sessionId,
      pasteController.installPasteHandlers({ sessionId, term, container }),
    );

    const refreshTerminal = () => {
      window.requestAnimationFrame(() => {
        try {
          if (isAtScrollBottom(term)) {
            scrollToBottomIfActive(sessionId, term);
          }
          term.refresh(0, Math.max(0, term.rows - 1));
        } catch {}
      });
    };

    const writeReplay = (data: string, reset = false) => {
      logTerminalDebug('Terminal replay start', sessionId, {
        dataLength: data.length,
        reset,
      });
      replayMutedRef.current.add(sessionId);
      const finishReplay = () => {
        scrollToBottomIfActive(sessionId, term);
        refreshTerminal();
        logTerminalDebug('Terminal replay finished', sessionId, {
          dataLength: data.length,
          reset,
        });
        window.requestAnimationFrame(() => {
          replayMutedRef.current.delete(sessionId);
        });
      };
      if (reset) {
        term.reset();
      }
      term.write(data, finishReplay);
    };

    const snapshot = stripEchoedTerminalReports(bufferRef.current.get(sessionId) || '');
    logTerminalDebug('Initial local terminal snapshot checked', sessionId, {
      snapshotLength: snapshot.length,
    });
    if (snapshot) {
      try {
        writeReplay(snapshot);
      } catch (error) {
        replayMutedRef.current.delete(sessionId);
        logBridge.write({
          level: 'warn',
          scope: 'terminal',
          message: 'Initial snapshot write failed',
          meta: { sessionId, error: error instanceof Error ? error.message : String(error) },
        });
      }
    }

    logTerminalDebug('Requesting PTY server snapshot', sessionId);
    ptyBridge
      .snapshot(sessionId)
      .then((serverSnapshot) => {
        const data = stripEchoedTerminalReports(serverSnapshot?.data || '');
        logTerminalDebug('PTY server snapshot received', sessionId, {
          serverSnapshotLength: data.length,
          rawServerSnapshotLength: String(serverSnapshot?.data || '').length,
        });
        if (!data) {
          logTerminalDebug('PTY server snapshot skipped: empty', sessionId);
          return;
        }
        const localSnapshot = bufferRef.current.get(sessionId) || '';
        if (localSnapshot.length >= data.length) {
          logTerminalDebug('PTY server snapshot skipped: local snapshot is newer', sessionId, {
            localSnapshotLength: localSnapshot.length,
            serverSnapshotLength: data.length,
          });
          return;
        }
        bufferRef.current.set(sessionId, data);
        try {
          writeReplay(data, Boolean(localSnapshot));
        } catch (error) {
          replayMutedRef.current.delete(sessionId);
          logBridge.write({
            level: 'warn',
            scope: 'terminal',
            message: 'Server snapshot write failed',
            meta: { sessionId, error: error instanceof Error ? error.message : String(error) },
          });
        }
      })
      .catch((error) => {
        logBridge.write({
          level: 'warn',
          scope: 'terminal',
          message: 'Failed to load PTY snapshot',
          meta: { sessionId, error: error instanceof Error ? error.message : String(error) },
        });
      });

    term.onData((data) => {
      if (activeSessionIdRef.current !== sessionId) return;
      if (replayMutedRef.current.has(sessionId)) return;
      const sanitized = stripTerminalReports(data);
      if (!sanitized) return;
      ptyBridge.input(sessionId, sanitized);
    });

    safeResizePty(sessionId, { term, fitAddon });

    terminalRef.current.set(sessionId, { term, fitAddon });
  }

  function setPaneRef(sessionId: string, el: HTMLDivElement | null) {
    if (!el) {
      if (!containerRef.current.has(sessionId)) return;
      logBridge.write({
        level: 'info',
        scope: 'terminal',
        message: 'Pane unmounted',
        meta: { sessionId },
      });
      const existingObserver = resizeObserverRef.current.get(sessionId);
      if (existingObserver) {
        existingObserver.disconnect();
        resizeObserverRef.current.delete(sessionId);
      }
      const wheelCleanup = wheelCleanupRef.current.get(sessionId);
      if (wheelCleanup) {
        wheelCleanup();
        wheelCleanupRef.current.delete(sessionId);
      }
      const pasteCleanup = pasteCleanupRef.current.get(sessionId);
      if (pasteCleanup) {
        pasteCleanup();
        pasteCleanupRef.current.delete(sessionId);
      }
      pasteController.clearPendingWindowsTextPaste(sessionId);
      suppressNextTextPasteUntilRef.current.delete(sessionId);
      skipWindowsTextPasteUntilRef.current.delete(sessionId);
      nativeImagePasteInFlightRef.current.delete(sessionId);
      const raf = fitRafRef.current.get(sessionId);
      if (typeof raf === 'number') {
        window.cancelAnimationFrame(raf);
        fitRafRef.current.delete(sessionId);
      }
      const existingTerminal = terminalRef.current.get(sessionId);
      if (existingTerminal) {
        try {
          existingTerminal.term.dispose();
        } catch {}
        terminalRef.current.delete(sessionId);
        lastResizeRef.current.delete(sessionId);
        replayMutedRef.current.delete(sessionId);
      }
      dataStatsRef.current.delete(sessionId);
      pendingStartSessionRef.current.delete(sessionId);
      postFitStartAttemptRef.current.delete(sessionId);
      containerRef.current.delete(sessionId);
      return;
    }
    if (containerRef.current.get(sessionId) === el && terminalRef.current.has(sessionId)) {
      return;
    }
    logBridge.write({
      level: 'info',
      scope: 'terminal',
      message: 'Pane mounted',
      meta: { sessionId },
    });
    containerRef.current.set(sessionId, el);
    ensureTerminal(sessionId, el);
    logTerminalDebug('Pane mounted with terminal state', sessionId);

    const scheduleFit = () => {
      const prev = fitRafRef.current.get(sessionId);
      if (typeof prev === 'number') window.cancelAnimationFrame(prev);
      const raf = window.requestAnimationFrame(() => {
        const entry = terminalRef.current.get(sessionId);
        if (!entry) return;
        entry.fitAddon.fit();
        safeResizePty(sessionId, entry);
        logTerminalDebug('ResizeObserver fit completed', sessionId);
        startPendingActiveSessionIfMeasured(sessionId);
      });
      fitRafRef.current.set(sessionId, raf);
    };

    scheduleFit();

    if (typeof ResizeObserver !== 'undefined') {
      const existingObserver = resizeObserverRef.current.get(sessionId);
      if (existingObserver) existingObserver.disconnect();
      const observer = new ResizeObserver(() => scheduleFit());
      observer.observe(el);
      resizeObserverRef.current.set(sessionId, observer);
    }
  }

  function fitActiveTerminal() {
    const sid = activeSessionIdRef.current;
    if (!sid) return;
    const entry = terminalRef.current.get(sid);
    if (!entry) return;
    const shouldFollowOutput = isAtScrollBottom(entry.term);
    entry.fitAddon.fit();
    safeResizePty(sid, entry);
    if (shouldFollowOutput) {
      scrollToBottomIfActive(sid, entry.term);
    }
    entry.term.focus();
  }

  const { startPendingActiveSessionIfMeasured } = useActiveTerminal({
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
  });

  useEffect(() => {
    const nextTheme = getXtermTheme(effectiveTheme);
    for (const { term } of terminalRef.current.values()) {
      term.options.theme = nextTheme;
      if (term.rows > 0) {
        term.refresh(0, term.rows - 1);
      }
    }
  }, [effectiveTheme]);

  usePtyEvents({
    appendBuffer,
    containerRef,
    dataStatsRef,
    ingestOutput,
    logTerminalDebug,
    markExited,
    refreshRuntimeStatuses,
    terminalRef,
    writeLiveTerminalData,
  });

  useEffect(() => {
    const resizeObservers = resizeObserverRef.current;
    const wheelCleanups = wheelCleanupRef.current;
    const pasteCleanups = pasteCleanupRef.current;
    const fitRafs = fitRafRef.current;
    const terminals = terminalRef.current;
    const containers = containerRef.current;
    const replayMuted = replayMutedRef.current;

    return () => {
      for (const observer of resizeObservers.values()) {
        observer.disconnect();
      }
      for (const cleanup of pasteCleanups.values()) {
        cleanup();
      }
      for (const cleanup of wheelCleanups.values()) {
        cleanup();
      }
      for (const raf of fitRafs.values()) {
        window.cancelAnimationFrame(raf);
      }
      resizeObservers.clear();
      wheelCleanups.clear();
      pasteCleanups.clear();
      fitRafs.clear();
      for (const { term } of terminals.values()) {
        term.dispose();
      }
      terminals.clear();
      containers.clear();
      replayMuted.clear();
      dataStatsRef.current.clear();
      pendingStartSessionRef.current.clear();
      postFitStartAttemptRef.current.clear();
      for (const pending of pendingWindowsTextPasteRef.current.values()) {
        window.clearTimeout(pending.timer);
      }
      pendingWindowsTextPasteRef.current.clear();
      suppressNextTextPasteUntilRef.current.clear();
      skipWindowsTextPasteUntilRef.current.clear();
      nativeImagePasteInFlightRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useTerminalTestApi({
    appendBuffer,
    activeSessionIdRef,
    bufferRef,
    containerRef,
    lastResizeRef,
    terminalRef,
    syncActiveScrollState,
    scrollActiveToBottom,
    writeLiveTerminalData,
  });

  return {
    setPaneRef,
    fitActiveTerminal,
    activeScrolledUp,
    scrollActiveToBottom,
  };
}
