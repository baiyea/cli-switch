import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { ptyBridge } from "../../../bridge/pty.bridge";
import { logBridge } from "../../../bridge/log.bridge";
import { useSessionStore } from "../../../store/session.store";

type TermEntry = {
  term: Terminal;
  fitAddon: FitAddon;
};

const MIN_SAFE_WIDTH = 320;
const MIN_SAFE_HEIGHT = 120;

export function usePty() {
  const terminalRef = useRef<Map<string, TermEntry>>(new Map());
  const containerRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const resizeObserverRef = useRef<Map<string, ResizeObserver>>(new Map());
  const fitRafRef = useRef<Map<string, number>>(new Map());
  const bufferRef = useRef<Map<string, string>>(new Map());
  const lastResizeRef = useRef<Map<string, { cols: number; rows: number }>>(new Map());
  const activeSessionIdRef = useRef<string | null>(null);

  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const markExited = useSessionStore((state) => state.markExited);

  activeSessionIdRef.current = activeSessionId;

  function appendBuffer(sessionId: string, chunk: string) {
    const prev = bufferRef.current.get(sessionId) || "";
    const merged = prev + chunk;
    const limit = 300000;
    bufferRef.current.set(sessionId, merged.length > limit ? merged.slice(-limit) : merged);
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
        level: "warn",
        scope: "terminal",
        message: "Skip PTY resize: pane too small",
        meta: {
          sessionId,
          width: Math.floor(rect.width),
          height: Math.floor(rect.height)
        }
      });
      return;
    }

    const cols = Math.max(1, entry.term.cols || 120);
    const rows = Math.max(1, entry.term.rows || 36);
    ptyBridge.resize(sessionId, cols, rows);
    lastResizeRef.current.set(sessionId, { cols, rows });
  }

  function ensureTerminal(sessionId: string, container: HTMLDivElement) {
    const existing = terminalRef.current.get(sessionId);
    if (existing) {
      if (containerRef.current.get(sessionId) === container) {
        return;
      }
      // Remount path: rebuild xterm against the new DOM container.
      try {
        existing.term.dispose();
      } catch {
      }
      terminalRef.current.delete(sessionId);
      lastResizeRef.current.delete(sessionId);
      logBridge.write({
        level: "info",
        scope: "terminal",
        message: "Recreating xterm instance for remount",
        meta: { sessionId }
      });
    }
    logBridge.write({
      level: "info",
      scope: "terminal",
      message: "Creating xterm instance",
      meta: { sessionId }
    });

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontSize: 12,
      lineHeight: 1.5,
      letterSpacing: 0,
      fontFamily: "\"JetBrains Mono\", monospace",
      theme: {
        background: "#ffffff00",
        foreground: "#2a3439",
        cursor: "#565e74",
        selectionBackground: "rgba(86, 94, 116, 0.2)",
        black: "#2a3439",
        red: "#9f403d",
        green: "#006d4a",
        yellow: "#f79009",
        blue: "#565e74",
        magenta: "#506076",
        cyan: "#10b981",
        white: "#f7f9fb",
        brightBlack: "#566166",
        brightRed: "#fe8983",
        brightGreen: "#69f6b8",
        brightYellow: "#f79009",
        brightBlue: "#dae2fd",
        brightMagenta: "#d3e4fe",
        brightCyan: "#58e7ab",
        brightWhite: "#ffffff"
      }
    });

    const fitAddon = new FitAddon();
    const linkAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(linkAddon);
    term.open(container);
    fitAddon.fit();

    const snapshot = bufferRef.current.get(sessionId);
    if (snapshot) {
      try {
        term.write(snapshot);
      } catch (error) {
        logBridge.write({
          level: "warn",
          scope: "terminal",
          message: "Initial snapshot write failed",
          meta: { sessionId, error: error instanceof Error ? error.message : String(error) }
        });
      }
    }

    term.onData((data) => {
      if (activeSessionIdRef.current !== sessionId) return;
      ptyBridge.input(sessionId, data);
    });

    safeResizePty(sessionId, { term, fitAddon });

    terminalRef.current.set(sessionId, { term, fitAddon });
  }

  function setPaneRef(sessionId: string, el: HTMLDivElement | null) {
    if (!el) {
      if (!containerRef.current.has(sessionId)) return;
      logBridge.write({
        level: "info",
        scope: "terminal",
        message: "Pane unmounted",
        meta: { sessionId }
      });
      const existingObserver = resizeObserverRef.current.get(sessionId);
      if (existingObserver) {
        existingObserver.disconnect();
        resizeObserverRef.current.delete(sessionId);
      }
      const raf = fitRafRef.current.get(sessionId);
      if (typeof raf === "number") {
        window.cancelAnimationFrame(raf);
        fitRafRef.current.delete(sessionId);
      }
      containerRef.current.delete(sessionId);
      return;
    }
    if (containerRef.current.get(sessionId) === el && terminalRef.current.has(sessionId)) {
      return;
    }
    logBridge.write({
      level: "info",
      scope: "terminal",
      message: "Pane mounted",
      meta: { sessionId }
    });
    containerRef.current.set(sessionId, el);
    ensureTerminal(sessionId, el);

    const scheduleFit = () => {
      const prev = fitRafRef.current.get(sessionId);
      if (typeof prev === "number") window.cancelAnimationFrame(prev);
      const raf = window.requestAnimationFrame(() => {
        const entry = terminalRef.current.get(sessionId);
        if (!entry) return;
        entry.fitAddon.fit();
        safeResizePty(sessionId, entry);
      });
      fitRafRef.current.set(sessionId, raf);
    };

    scheduleFit();

    if (typeof ResizeObserver !== "undefined") {
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
    entry.fitAddon.fit();
    safeResizePty(sid, entry);
    entry.term.focus();
  }

  useEffect(() => {
    const offData = ptyBridge.onData(({ sessionId, data }) => {
      appendBuffer(sessionId, data);
      const entry = terminalRef.current.get(sessionId);
      if (entry) {
        try {
          entry.term.write(data);
        } catch (error) {
          logBridge.write({
            level: "warn",
            scope: "terminal",
            message: "term.write failed",
            meta: { sessionId, error: error instanceof Error ? error.message : String(error) }
          });
        }
      }
    });

    const offExit = ptyBridge.onExit(({ sessionId, exitCode }) => {
      const line = `\r\n[process exited with code ${exitCode}]\r\n`;
      appendBuffer(sessionId, line);
      const entry = terminalRef.current.get(sessionId);
      if (entry) {
        try {
          entry.term.write(line);
        } catch (error) {
          logBridge.write({
            level: "warn",
            scope: "terminal",
            message: "term.write exit line failed",
            meta: { sessionId, error: error instanceof Error ? error.message : String(error) }
          });
        }
      }
      markExited(sessionId, exitCode);
      logBridge.write({
        level: "info",
        scope: "terminal",
        message: "PTY exited",
        meta: { sessionId, exitCode }
      });
    });

    return () => {
      offData();
      offExit();
      for (const observer of resizeObserverRef.current.values()) {
        observer.disconnect();
      }
      for (const raf of fitRafRef.current.values()) {
        window.cancelAnimationFrame(raf);
      }
      resizeObserverRef.current.clear();
      fitRafRef.current.clear();
      for (const { term } of terminalRef.current.values()) {
        term.dispose();
      }
      terminalRef.current.clear();
      containerRef.current.clear();
    };
  }, [markExited]);

  useEffect(() => {
    fitActiveTerminal();
    const raf = window.requestAnimationFrame(() => fitActiveTerminal());
    logBridge.write({
      level: "info",
      scope: "terminal",
      message: "Active session changed",
      meta: { activeSessionId }
    });
    const onResize = () => fitActiveTerminal();
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [activeSessionId]);

  useEffect(() => {
    window.__ZEELIN_TEST__ = {
      getSessionBuffer: (sessionId: string) => bufferRef.current.get(sessionId) || "",
      getPaneDisplay: (sessionId: string) => {
        const el = containerRef.current.get(sessionId);
        if (!el) return null;
        return window.getComputedStyle(el).display;
      },
      getLastResize: (sessionId: string) => lastResizeRef.current.get(sessionId) || null
    };

    return () => {
      // @ts-expect-error test hook
      delete window.__ZEELIN_TEST__;
    };
  }, []);

  return {
    setPaneRef,
    fitActiveTerminal
  };
}
