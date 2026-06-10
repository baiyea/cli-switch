import { logBridge } from '../../../../shared/bridge';
import type { RefObject } from 'react';
import type { TermEntry } from './terminal-types';

type TerminalDebugContext = {
  terminalRef: RefObject<Map<string, TermEntry>>;
  containerRef: RefObject<Map<string, HTMLDivElement>>;
  bufferRef: RefObject<Map<string, string>>;
  lastResizeRef: RefObject<Map<string, { cols: number; rows: number }>>;
  activeSessionIdRef: RefObject<string | null>;
};

function getElementRectMeta(el: Element | null) {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const htmlEl = el as HTMLElement;
  return {
    width: Math.floor(rect.width),
    height: Math.floor(rect.height),
    clientWidth: htmlEl.clientWidth || 0,
    clientHeight: htmlEl.clientHeight || 0,
    display: window.getComputedStyle(htmlEl).display,
    visibility: window.getComputedStyle(htmlEl).visibility,
  };
}

export function getTerminalDebugMeta(
  context: TerminalDebugContext,
  sessionId: string,
  entry = context.terminalRef.current.get(sessionId),
) {
  const container = context.containerRef.current.get(sessionId);
  const localBuffer = context.bufferRef.current.get(sessionId) || '';
  const lastResize = context.lastResizeRef.current.get(sessionId) || null;
  const xterm = container?.querySelector('.xterm') || null;
  const viewport = container?.querySelector('.xterm-viewport') || null;
  const screen = container?.querySelector('.xterm-screen') || null;
  const helper = container?.querySelector('.xterm-helper-textarea') || null;
  let termState = null;
  try {
    const buffer = entry?.term.buffer.active;
    termState = entry
      ? {
          cols: entry.term.cols,
          rows: entry.term.rows,
          baseY: buffer?.baseY ?? null,
          viewportY: buffer?.viewportY ?? null,
          cursorX: buffer?.cursorX ?? null,
          cursorY: buffer?.cursorY ?? null,
        }
      : null;
  } catch {
    termState = entry ? { cols: entry.term.cols, rows: entry.term.rows } : null;
  }
  return {
    sessionId,
    activeSessionId: context.activeSessionIdRef.current,
    isActive: context.activeSessionIdRef.current === sessionId,
    hasContainer: Boolean(container),
    hasTerminal: Boolean(entry),
    documentFocused: document.hasFocus(),
    helperFocused: Boolean(helper && helper === document.activeElement),
    localBufferLength: localBuffer.length,
    localBufferLines: localBuffer ? localBuffer.split(/\r?\n/).length : 0,
    lastResize,
    term: termState,
    container: getElementRectMeta(container || null),
    xterm: getElementRectMeta(xterm),
    viewport: getElementRectMeta(viewport),
    screen: getElementRectMeta(screen),
  };
}

export function logTerminalDebug(
  context: TerminalDebugContext,
  message: string,
  sessionId: string,
  extra: Record<string, unknown> = {},
) {
  logBridge.write({
    level: 'info',
    scope: 'terminal',
    message,
    meta: { ...getTerminalDebugMeta(context, sessionId), ...extra },
  });
}
