import React, { useEffect, useMemo, useState } from "react";
import { usePty } from "../hooks/usePty";
import { useSessionStore } from "../../../store/session.store";
import { TerminalPane } from "./TerminalPane";
import styles from "./TerminalPanel.module.css";

type Props = {
  projectId?: string;
  cwd?: string;
};

export function TerminalPanel({ projectId, cwd }: Props) {
  const sessions = useSessionStore((state) => state.sessions);
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const { setPaneRef } = usePty();
  void projectId;
  void cwd;
  const activeSession = sessions.find((session) => session.sessionId === activeSessionId) || null;
  const sessionIds = useMemo(() => new Set(sessions.map((session) => session.sessionId)), [sessions]);
  const [mountedSessionIds, setMountedSessionIds] = useState<string[]>([]);

  useEffect(() => {
    setMountedSessionIds((prev) => {
      const next = prev.filter((sessionId) => sessionIds.has(sessionId));
      if (activeSessionId && sessionIds.has(activeSessionId) && !next.includes(activeSessionId)) {
        next.push(activeSessionId);
      }
      return next;
    });
  }, [activeSessionId, sessionIds]);

  return (
    <section className={styles.panel}>
      <div className={styles.viewport} data-testid="terminal-viewport">
        {!activeSession && (
          <div className={styles.empty}>请在左侧项目右侧点击 + 创建会话并启动 CLI。</div>
        )}
        {mountedSessionIds.map((sessionId) => (
          <TerminalPane
            key={sessionId}
            sessionId={sessionId}
            active={sessionId === activeSessionId}
            registerPane={setPaneRef}
          />
        ))}
      </div>
    </section>
  );
}
