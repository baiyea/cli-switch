import React, { useState, useCallback } from "react";
import { TerminalPane } from "./TerminalPane";

interface TerminalPanelProps {
  projectId: string;
  cwd: string;
}

export function TerminalPanel({ cwd }: TerminalPanelProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("idle");

  const startSession = useCallback(async () => {
    setStatus("starting");
    try {
      const result = await window.api.terminal.start({
        cwd,
        name: "test-session",
      });
      setSessionId(result.sessionId);
      setStatus("running");
    } catch (e) {
      setStatus("error");
      console.error("Failed to start terminal:", e);
    }
  }, [cwd]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {!sessionId ? (
        <div style={{ padding: 20 }}>
          <button onClick={startSession} disabled={status === "starting"}>
            {status === "starting" ? "Starting..." : "Start Terminal"}
          </button>
        </div>
      ) : (
        <div style={{ flex: 1 }}>
          <TerminalPane sessionId={sessionId} />
        </div>
      )}
    </div>
  );
}
