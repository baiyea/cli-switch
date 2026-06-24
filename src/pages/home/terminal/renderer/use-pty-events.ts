import type { Terminal } from '@xterm/xterm';
import { type RefObject,useEffect } from 'react';

import { logBridge } from '../../../../shared/bridge';
import { ptyBridge } from './terminal.bridge';
import type { PtyDataStats, TermEntry } from './terminal-types';

type UsePtyEventsParams = {
  appendBuffer: (sessionId: string, chunk: string) => void;
  containerRef: RefObject<Map<string, HTMLDivElement>>;
  dataStatsRef: RefObject<Map<string, PtyDataStats>>;
  ingestOutput: (sessionId: string, data: string) => void;
  logTerminalDebug: (
    message: string,
    sessionId: string,
    extra?: Record<string, unknown>,
  ) => void;
  markExited: (sessionId: string, exitCode: number | null) => void;
  refreshRuntimeStatuses: () => void;
  terminalRef: RefObject<Map<string, TermEntry>>;
  writeLiveTerminalData: (sessionId: string, term: Terminal, data: string) => void;
};

export function usePtyEvents({
  appendBuffer,
  containerRef,
  dataStatsRef,
  ingestOutput,
  logTerminalDebug,
  markExited,
  refreshRuntimeStatuses,
  terminalRef,
  writeLiveTerminalData,
}: UsePtyEventsParams) {
  useEffect(() => {
    const offData = ptyBridge.onData(({ sessionId, data }) => {
      appendBuffer(sessionId, data);
      ingestOutput(sessionId, data);
      const prevStats = dataStatsRef.current.get(sessionId) || {
        chunks: 0,
        totalLength: 0,
        lastLogAt: 0,
      };
      const now = Date.now();
      const nextStats = {
        chunks: prevStats.chunks + 1,
        totalLength: prevStats.totalLength + String(data || '').length,
        lastLogAt: prevStats.lastLogAt,
      };
      const shouldLogData = nextStats.chunks <= 3 || now - prevStats.lastLogAt > 10000;
      if (shouldLogData) {
        nextStats.lastLogAt = now;
        logTerminalDebug('PTY data received', sessionId, {
          chunkLength: String(data || '').length,
          chunks: nextStats.chunks,
          totalLength: nextStats.totalLength,
        });
      }
      dataStatsRef.current.set(sessionId, nextStats);
      const entry = terminalRef.current.get(sessionId);
      if (entry && containerRef.current.has(sessionId)) {
        try {
          writeLiveTerminalData(sessionId, entry.term, data);
          if (shouldLogData) {
            logTerminalDebug('PTY data written to xterm', sessionId, {
              chunkLength: String(data || '').length,
            });
          }
        } catch (error) {
          logBridge.write({
            level: 'warn',
            scope: 'terminal',
            message: 'term.write failed',
            meta: { sessionId, error: error instanceof Error ? error.message : String(error) },
          });
        }
      } else if (shouldLogData) {
        logTerminalDebug('PTY data buffered without mounted xterm', sessionId, {
          chunkLength: String(data || '').length,
        });
      }
    });

    const offExit = ptyBridge.onExit(({ sessionId, exitCode }) => {
      const line = `\r\n[process exited with code ${exitCode}]\r\n`;
      appendBuffer(sessionId, line);
      const entry = terminalRef.current.get(sessionId);
      if (entry && containerRef.current.has(sessionId)) {
        try {
          writeLiveTerminalData(sessionId, entry.term, line);
        } catch (error) {
          logBridge.write({
            level: 'warn',
            scope: 'terminal',
            message: 'term.write exit line failed',
            meta: { sessionId, error: error instanceof Error ? error.message : String(error) },
          });
        }
      }
      markExited(sessionId, exitCode);
      logBridge.write({
        level: 'info',
        scope: 'terminal',
        message: 'PTY exited',
        meta: { sessionId, exitCode },
      });
    });

    const idleTimer = window.setInterval(() => {
      refreshRuntimeStatuses();
    }, 1000);

    return () => {
      offData();
      offExit();
      window.clearInterval(idleTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingestOutput, markExited, refreshRuntimeStatuses]);
}
