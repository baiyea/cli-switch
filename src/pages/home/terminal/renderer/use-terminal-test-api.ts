import { useEffect, type RefObject } from 'react';

import { i18nService } from '../../../../i18n/renderer';
import { useSessionStore } from '../../home.store';
import { fileAttachmentBridge, ptyBridge } from './terminal.bridge';
import type { TermEntry } from './terminal-types';

type UseTerminalTestApiParams = {
  activeSessionIdRef: RefObject<string | null>;
  bufferRef: RefObject<Map<string, string>>;
  containerRef: RefObject<Map<string, HTMLDivElement>>;
  lastResizeRef: RefObject<Map<string, { cols: number; rows: number }>>;
  terminalRef: RefObject<Map<string, TermEntry>>;
  syncActiveScrollState: (sessionId?: string | null) => void;
  scrollActiveToBottom: () => boolean;
  writeLiveTerminalData: (sessionId: string, term: TermEntry['term'], data: string) => void;
};

export function useTerminalTestApi({
  activeSessionIdRef,
  bufferRef,
  containerRef,
  lastResizeRef,
  terminalRef,
  syncActiveScrollState,
  scrollActiveToBottom,
  writeLiveTerminalData,
}: UseTerminalTestApiParams) {
  useEffect(() => {
    window.__ZEELIN_TEST__ = {
      getActiveSessionId: () => activeSessionIdRef.current || '',
      getSessionBuffer: (sessionId: string) => bufferRef.current.get(sessionId) || '',
      getPaneDisplay: (sessionId: string) => {
        const el = containerRef.current.get(sessionId);
        if (!el) return null;
        return window.getComputedStyle(el).display;
      },
      getLastResize: (sessionId: string) => lastResizeRef.current.get(sessionId) || null,
      getTerminalLayoutGeometry: (sessionId: string) => {
        const container = containerRef.current.get(sessionId);
        const entry = terminalRef.current.get(sessionId);
        if (!container || !entry) return null;
        const mainPanel = container.closest('.main-panel') as HTMLElement | null;
        const mainContent = container.closest('.main-content') as HTMLElement | null;
        const sidebar = document.querySelector('.sidebar') as HTMLElement | null;
        const xterm = container.querySelector('.xterm') as HTMLElement | null;
        const viewport = container.querySelector('.xterm-viewport') as HTMLElement | null;
        const screen = container.querySelector('.xterm-screen') as HTMLElement | null;
        const helper = container.querySelector('.xterm-helper-textarea') as HTMLElement | null;
        const dims = entry.term._core?._renderService?.dimensions;
        const cssCell = dims?.css?.cell;
        const rectOf = (el: Element | null) => {
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          const htmlEl = el as HTMLElement;
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
            clientWidth: htmlEl.clientWidth || 0,
            scrollWidth: htmlEl.scrollWidth || 0,
            clientHeight: htmlEl.clientHeight || 0,
            scrollHeight: htmlEl.scrollHeight || 0,
          };
        };
        return {
          cols: entry.term.cols,
          rows: entry.term.rows,
          cellWidth: Number(cssCell?.width || 0),
          cellHeight: Number(cssCell?.height || 0),
          sidebar: rectOf(sidebar),
          mainContent: rectOf(mainContent),
          mainPanel: rectOf(mainPanel),
          container: rectOf(container),
          xterm: rectOf(xterm),
          viewport: rectOf(viewport),
          screen: rectOf(screen),
          helper: rectOf(helper),
        };
      },
      getTerminalScrollState: (sessionId: string) => {
        const entry = terminalRef.current.get(sessionId);
        if (!entry) return null;
        const buffer = entry.term.buffer.active;
        const viewport = containerRef.current
          .get(sessionId)
          ?.querySelector('.xterm-viewport') as HTMLElement | null;
        return {
          baseY: buffer.baseY,
          viewportY: buffer.viewportY,
          rows: entry.term.rows,
          scrollTop: viewport?.scrollTop ?? 0,
          scrollHeight: viewport?.scrollHeight ?? 0,
          clientHeight: viewport?.clientHeight ?? 0,
        };
      },
      scrollTerminalLines: (sessionId: string, lines: number) => {
        const entry = terminalRef.current.get(sessionId);
        if (!entry) return false;
        entry.term.scrollLines(lines);
        syncActiveScrollState(sessionId);
        return true;
      },
      scrollTerminalToBottom: (sessionId: string) => {
        if (activeSessionIdRef.current !== sessionId) return false;
        return scrollActiveToBottom();
      },
      appendTerminalData: (sessionId: string, data: string) => {
        const entry = terminalRef.current.get(sessionId);
        if (!entry) return false;
        writeLiveTerminalData(sessionId, entry.term, data);
        return true;
      },
      destroyAllSessions: () => {
        useSessionStore.getState().destroyAll();
        return true;
      },
      t: (key: string, params?: Record<string, string | number>) =>
        i18nService.t(key, params),
      simulateImagePaste: async (sessionId: string, base64: string, mimeType = 'image/png') => {
        const session = useSessionStore.getState().sessions.find((s) => s.sessionId === sessionId);
        if (!session || !session.cwd) {
          return { ok: false, reason: 'no-session-or-cwd' };
        }
        try {
          const result = await fileAttachmentBridge.saveAttachmentImageBuffer({
            cwd: session.cwd,
            sessionId,
            base64,
            mimeType,
          });
          if (result?.ok && result.relPath) {
            ptyBridge.input(sessionId, `@${result.relPath}`);
            return { ok: true, relPath: result.relPath, absPath: result.absPath };
          }
          return { ok: false, reason: result?.reason || 'save-failed' };
        } catch (error) {
          return { ok: false, reason: error instanceof Error ? error.message : String(error) };
        }
      },
    };

    return () => {
      // @ts-expect-error test hook
      delete window.__ZEELIN_TEST__;
    };
  }, [
    activeSessionIdRef,
    bufferRef,
    containerRef,
    lastResizeRef,
    scrollActiveToBottom,
    syncActiveScrollState,
    terminalRef,
    writeLiveTerminalData,
  ]);
}
