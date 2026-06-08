import React from 'react';

import { Button } from '../../../../ui/button';
import {
  ArchiveIcon,
  DownloadIcon,
  ExplorerToggleIcon,
  ProviderIcon,
  RestartIcon,
  SmartAiIcon,
} from '../../../../ui/icon-registry';
import { useSessionStore } from '../../home.store';
import { topToolbarBridge } from './top-toolbar.bridge';
import { WindowControls } from './WindowControls';

const RUNTIME_STATUS_LABEL = {
  starting: '启动中',
  streaming: '输出中',
  awaiting_input: '等待输入',
  awaiting_confirmation: '等待确认',
  error: '异常',
  exited: '已退出',
  creating: '启动中',
  running: '运行中',
};
const TRAFFIC_LIGHT_Y = 20;
const TRAFFIC_LIGHT_X_IN_SIDEBAR = 14;

export function TopToolbar({
  sidebarCollapsed,
  activeSessionProviderMeta,
  onExpandSidebar,
  onRenameActiveSession,
  skillgenRunning,
  onRunSkillgen,
  canRunSkillgen,
  sessionsDumpRunning,
  sessionsDumpStatus,
  onRunSessionsDump,
  canRunSessionsDump,
  onArchiveActiveSession,
  sessionRestartRunning,
  onRestartActiveSession,
  explorerVisible,
  onToggleExplorer,
}) {
  const isWindows =
    typeof navigator !== 'undefined' &&
    /win/i.test(String(navigator.platform || navigator.userAgent || ''));
  const isMacOS =
    typeof navigator !== 'undefined' &&
    /mac/i.test(String(navigator.platform || navigator.userAgent || ''));
  const sessions = useSessionStore((state) => state.sessions);
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const activeSession = React.useMemo(
    () => sessions.find((s) => s.sessionId === activeSessionId) || null,
    [sessions, activeSessionId],
  );
  const canArchiveActiveSession = Boolean(activeSessionId);
  const canRestartActiveSession = Boolean(activeSessionId) && !sessionRestartRunning;
  const sessionStatus = activeSession?.runtimeStatus || activeSession?.status || '';
  const sessionProvider = activeSession?.provider || 'claude';

  React.useEffect(() => {
    if (!isMacOS) return;
    void topToolbarBridge.window
      .setTrafficLightPosition({
        x: TRAFFIC_LIGHT_X_IN_SIDEBAR,
        y: TRAFFIC_LIGHT_Y,
      })
      .catch(() => {});
  }, [isMacOS, sidebarCollapsed]);

  return (
    <header className="toolbar">
      <div className="toolbar-title-group">
        {sidebarCollapsed && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="toolbar-expand-btn"
            aria-label="展开会话栏"
            title="展开会话栏"
            onClick={onExpandSidebar}
          >
            <ExplorerToggleIcon size={14} />
          </Button>
        )}
        <ProviderIcon
          provider={sessionProvider}
          className={`toolbar-provider-icon ${sessionStatus}`}
          variant="default"
          size={16}
          title={activeSessionProviderMeta || ''}
        />
        <div className="toolbar-session-texts">
          <span
            className={`toolbar-title ${activeSession ? 'editable' : ''}`}
            onDoubleClick={onRenameActiveSession}
          >
            {activeSession ? activeSession.name : 'ready'}
          </span>
          {activeSessionProviderMeta && (
            <span className="toolbar-provider-meta" title={activeSessionProviderMeta}>
              {activeSessionProviderMeta}
            </span>
          )}
        </div>
        <div className="toolbar-drag-spacer" />
        {activeSession && (
          <span
            className="toolbar-session-status"
            title={RUNTIME_STATUS_LABEL[sessionStatus] || sessionStatus}
          >
            {RUNTIME_STATUS_LABEL[sessionStatus] || sessionStatus}
          </span>
        )}
      </div>

      <div className="toolbar-actions">
        <Button
          className={`toolbar-icon-btn toolbar-skill-btn ${skillgenRunning ? 'active skillgen-running' : ''}`}
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRunSkillgen}
          title="分析当前项目会话并生成 Skill"
          aria-label="生成Skill"
          disabled={!canRunSkillgen || skillgenRunning}
        >
          <SmartAiIcon size={14} />
        </Button>
        <Button
          className={`toolbar-icon-btn ${sessionsDumpRunning ? 'active' : ''}`}
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRunSessionsDump}
          title={sessionsDumpStatus || '导出当前项目会话内容'}
          aria-label="导出会话内容"
          disabled={!canRunSessionsDump || sessionsDumpRunning}
        >
          <DownloadIcon size={14} />
        </Button>
        <Button
          className={`toolbar-icon-btn ${sessionRestartRunning ? 'active' : ''}`}
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRestartActiveSession}
          title="重启当前会话"
          aria-label="重启当前会话"
          disabled={!canRestartActiveSession}
        >
          <RestartIcon size={14} />
        </Button>
        <Button
          className="toolbar-icon-btn"
          type="button"
          variant="ghost"
          size="icon"
          onClick={onArchiveActiveSession}
          title="归档当前会话"
          aria-label="归档当前会话"
          disabled={!canArchiveActiveSession}
        >
          <ArchiveIcon size={14} />
        </Button>
        <Button
          className={`toolbar-icon-btn ${explorerVisible ? 'active' : ''}`}
          type="button"
          variant="ghost"
          size="icon"
          title={explorerVisible ? '关闭文件树' : '展开文件树'}
          aria-label={explorerVisible ? '关闭文件树' : '展开文件树'}
          onClick={onToggleExplorer}
        >
          <ExplorerToggleIcon size={14} />
        </Button>
      </div>

      {isWindows && <WindowControls />}
    </header>
  );
}
