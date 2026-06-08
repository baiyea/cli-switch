import React, { useEffect, useMemo, useState } from 'react';

import { useThemeStore } from '../../../../ui/theme/theme.store';
import { useHomeWorkspaceStore, useSessionStore } from '../../home.store';
import { type SessionStats, terminalSessionBridge } from './terminal.bridge';
import { TerminalPane } from './TerminalPane';
import styles from './TerminalPanel.module.css';
import { usePty } from './usePty';

export function TerminalPanel() {
  const sessions = useSessionStore((state) => state.sessions);
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const activeProjectId = useHomeWorkspaceStore((state) => state.activeProjectId);
  const activeCwd = useHomeWorkspaceStore((state) => state.activeCwd);
  const effectiveTheme = useThemeStore((state) => state.effectiveTheme);
  const { setPaneRef, activeScrolledUp, scrollActiveToBottom } = usePty(effectiveTheme);
  void activeProjectId;
  void activeCwd;
  const activeSession = sessions.find((session) => session.sessionId === activeSessionId) || null;
  const sessionIds = useMemo(
    () => new Set(sessions.map((session) => session.sessionId)),
    [sessions],
  );
  const [mountedSessionIds, setMountedSessionIds] = useState<string[]>([]);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState('');

  useEffect(() => {
    setMountedSessionIds((prev) => {
      const next = prev.filter((sessionId) => sessionIds.has(sessionId));
      if (activeSessionId && sessionIds.has(activeSessionId) && !next.includes(activeSessionId)) {
        next.push(activeSessionId);
      }
      if (next.length === prev.length && next.every((id, index) => id === prev[index])) {
        return prev;
      }
      return next;
    });
  }, [activeSessionId, sessionIds]);

  useEffect(() => {
    if (!activeSession) {
      setStats(null);
      setStatsError('');
      setStatsLoading(false);
      return;
    }

    let disposed = false;
    let timer: number | null = null;

    const load = async (silent = false) => {
      if (!silent) setStatsLoading(true);
      const response = await terminalSessionBridge.stats({
        provider: activeSession.provider,
        providerSessionId: activeSession.providerSessionId || activeSession.sessionId,
        sessionId: activeSession.sessionId,
      });
      if (disposed) return;
      if (response.ok) {
        setStats(response.stats);
        setStatsError('');
      } else {
        setStatsError(String(response.reason || '统计不可用'));
      }
      if (!silent) setStatsLoading(false);
    };

    void load(false);
    if (activeSession.status === 'running') {
      timer = window.setInterval(() => void load(true), 5000);
    }

    return () => {
      disposed = true;
      if (timer != null) window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeSession?.provider,
    activeSession?.providerSessionId,
    activeSession?.sessionId,
    activeSession?.status,
  ]);

  const durationText = useMemo(() => {
    const duration = Number(stats?.durationMs || 0);
    if (!duration) return '--';
    const totalSec = Math.floor(duration / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    if (hours > 0)
      return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
    if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
    return `${seconds}s`;
  }, [stats?.durationMs]);

  const roundsText = useMemo(() => {
    if (!stats) return '--';
    return String(stats.rounds || 0);
  }, [stats]);

  const tokensText = useMemo(() => {
    if (!stats?.tokens?.available) return '--';
    return new Intl.NumberFormat('en-US').format(Number(stats.tokens.total || 0));
  }, [stats]);

  const statusInfo = useMemo(() => {
    if (!activeSession) return { dotClass: '', text: '' };
    if (statsError) return { dotClass: styles.error, text: statsError };
    if (statsLoading && !stats) return { dotClass: styles.loading, text: '加载中...' };
    if (activeSession.status === 'running') return { dotClass: styles.running, text: '运行中' };
    if (activeSession.status === 'creating') return { dotClass: styles.loading, text: '创建中' };
    if (activeSession.status === 'exited') return { dotClass: styles.loading, text: '已退出' };
    return { dotClass: '', text: '' };
  }, [activeSession, statsError, statsLoading, stats]);

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
        {activeSession && activeScrolledUp && (
          <button
            type="button"
            className={styles.scrollToBottomButton}
            aria-label="滚动到底部"
            title="滚动到底部"
            onClick={scrollActiveToBottom}
          >
            <span aria-hidden="true">↓</span>
          </button>
        )}
      </div>
      <div className={styles.footer} data-testid="terminal-session-stats">
        <div className={styles.status}>
          {statusInfo.text && (
            <>
              <span className={styles.statusLabel}>状态</span>
              <span className={`${styles.statusDot} ${statusInfo.dotClass}`} />
              <span className={styles.statusText}>{statusInfo.text}</span>
            </>
          )}
        </div>
        <div className={styles.metric}>
          <span>总时长</span>
          <strong>{durationText}</strong>
        </div>
        <div className={styles.metric}>
          <span>轮次</span>
          <strong>{roundsText}</strong>
        </div>
        <div className={styles.metric}>
          <span>Token</span>
          <strong>{tokensText}</strong>
        </div>
      </div>
    </section>
  );
}
