import React, { memo, useCallback } from "react";
import styles from "./TerminalPane.module.css";

type Props = {
  sessionId: string;
  active: boolean;
  registerPane: (sessionId: string, el: HTMLDivElement | null) => void;
};

function TerminalPaneComponent({ sessionId, active, registerPane }: Props) {
  const setRef = useCallback(
    (el: HTMLDivElement | null) => registerPane(sessionId, el),
    [registerPane, sessionId]
  );

  return (
    <div
      className={`${styles.terminalPane} ${active ? styles.active : styles.inactive}`}
      ref={setRef}
      data-session-id={sessionId}
    />
  );
}

export const TerminalPane = memo(TerminalPaneComponent);
