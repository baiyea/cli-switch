import type { Terminal } from '@xterm/xterm';

import { logBridge } from '../../../../shared/bridge';
import { useSessionStore } from '../../home.store';

function getSessionProvider(sessionId: string) {
  const session = useSessionStore.getState().sessions.find((item) => item.sessionId === sessionId);
  return String(session?.provider || '').toLowerCase();
}

function hasBlockedCodexTerminalMode(params: (number | number[])[]) {
  const blockedModes = new Set([
    47,
    1000,
    1002,
    1003,
    1005,
    1006,
    1007,
    1015,
    1047,
    1048,
    1049,
  ]);
  for (const param of params || []) {
    if (Array.isArray(param)) {
      if (param.some((value) => blockedModes.has(Number(value)))) return true;
      continue;
    }
    if (blockedModes.has(Number(param))) return true;
  }
  return false;
}

export function installCodexScrollbackGuard(sessionId: string, term: Terminal) {
  const intercept = (params: (number | number[])[]) =>
    getSessionProvider(sessionId) === 'codex' && hasBlockedCodexTerminalMode(params);
  try {
    term.parser.registerCsiHandler({ prefix: '?', final: 'h' }, intercept);
    term.parser.registerCsiHandler({ prefix: '?', final: 'l' }, intercept);
  } catch (error) {
    logBridge.write({
      level: 'warn',
      scope: 'terminal',
      message: 'Failed to install Codex scrollback guard',
      meta: { sessionId, error: error instanceof Error ? error.message : String(error) },
    });
  }
}

export function installCodexWheelScrollGuard(
  sessionId: string,
  container: HTMLElement,
  term: Terminal,
) {
  const onWheel = (event: WheelEvent) => {
    if (getSessionProvider(sessionId) !== 'codex') return;
    if (!Number.isFinite(event.deltaY) || event.deltaY === 0) return;
    const buffer = term.buffer.active;
    const before = buffer.viewportY;
    const lines = Math.max(1, Math.ceil(Math.abs(event.deltaY) / 40));
    term.scrollLines(event.deltaY > 0 ? lines : -lines);
    const after = term.buffer.active.viewportY;
    if (after === before) return;
    event.preventDefault();
    event.stopPropagation();
  };
  container.addEventListener('wheel', onWheel, { capture: true, passive: false });
  return () => container.removeEventListener('wheel', onWheel, { capture: true });
}
