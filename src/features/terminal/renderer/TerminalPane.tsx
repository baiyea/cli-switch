import React, { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface TerminalPaneProps {
  sessionId: string;
}

export function TerminalPane({ sessionId }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Consolas, "Courier New", monospace',
      theme: {
        background: "#1e1e1e",
        foreground: "#d4d4d4",
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    const unsubscribe = window.api.terminal.onData(
      ({ sessionId: sid, data }: { sessionId: string; data: string }) => {
        if (sid === sessionId) {
          term.write(data);
        }
      }
    );

    term.onData((data) => {
      window.api.terminal.write({ sessionId, data });
    });

    return () => {
      unsubscribe();
      term.dispose();
      termRef.current = null;
    };
  }, [sessionId]);

  useEffect(() => {
    const onResize = () => {
      if (fitRef.current) {
        fitRef.current.fit();
        if (termRef.current) {
          const { cols, rows } = termRef.current;
          window.api.terminal.resize({ sessionId, cols, rows });
        }
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [sessionId]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%" }}
      data-testid="terminal-pane"
    />
  );
}
