import React from "react";
import { Minus, Square, X } from "lucide-react";
import { ArchiveIcon, ExplorerToggleIcon, ProviderIcon, SmartAiIcon } from "../../../../ui/icon-registry";
import { Button } from "../../../../ui/button";
import { useSessionStore } from "../../home.store";

const RUNTIME_STATUS_LABEL = {
  starting: "启动中",
  streaming: "输出中",
  awaiting_input: "等待输入",
  awaiting_confirmation: "等待确认",
  error: "异常",
  exited: "已退出",
  creating: "启动中",
  running: "运行中"
};

export function TopToolbar({
  sidebarCollapsed,
  activeSessionProviderMeta,
  onExpandSidebar,
  onRenameActiveSession,
  skillgenRunning,
  onRunSkillgen,
  canRunSkillgen,
  onArchiveActiveSession,
  explorerVisible,
  onToggleExplorer,
  onWindowMinimize,
  onWindowToggleMaximize,
  onWindowClose
}) {
  const isWindows = typeof navigator !== "undefined"
    && /win/i.test(String(navigator.platform || navigator.userAgent || ""));
  const sessions = useSessionStore((state) => state.sessions);
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const activeSession = React.useMemo(
    () => sessions.find((s) => s.sessionId === activeSessionId) || null,
    [sessions, activeSessionId]
  );
  const canArchiveActiveSession = Boolean(activeSessionId);
  const sessionStatus = activeSession?.runtimeStatus || activeSession?.status || "";
  const sessionProvider = activeSession?.provider || "claude";

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
            ▸
          </Button>
        )}
        <ProviderIcon
          provider={sessionProvider}
          className={`toolbar-provider-icon ${sessionStatus}`}
          variant="default"
          size={16}
          title={activeSessionProviderMeta || ""}
        />
        <div className="toolbar-session-texts">
          <span
            className={`toolbar-title ${activeSession ? "editable" : ""}`}
            onDoubleClick={onRenameActiveSession}
            title={activeSession ? "双击重命名会话" : ""}
          >
            {activeSession ? activeSession.name : "ready"}
          </span>
          {activeSessionProviderMeta && (
            <span className="toolbar-provider-meta" title={activeSessionProviderMeta}>
              {activeSessionProviderMeta}
            </span>
          )}
        </div>
        <div className="toolbar-drag-spacer" />
        {activeSession && <span className="toolbar-session-status" title={RUNTIME_STATUS_LABEL[sessionStatus] || sessionStatus}>{RUNTIME_STATUS_LABEL[sessionStatus] || sessionStatus}</span>}
      </div>

      <div className="toolbar-actions">
        <Button
          className={`toolbar-icon-btn toolbar-skill-btn ${skillgenRunning ? "active skillgen-running" : ""}`}
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
          className={`toolbar-icon-btn ${explorerVisible ? "active" : ""}`}
          type="button"
          variant="ghost"
          size="icon"
          title={explorerVisible ? "关闭文件树" : "展开文件树"}
          aria-label={explorerVisible ? "关闭文件树" : "展开文件树"}
          onClick={onToggleExplorer}
        >
          <ExplorerToggleIcon size={14} />
        </Button>
      </div>

      {isWindows && (
        <div className="window-controls" aria-label="窗口控制">
          <button
            type="button"
            className="window-control-btn"
            aria-label="最小化"
            title="最小化"
            onClick={onWindowMinimize}
          >
            <Minus size={14} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className="window-control-btn"
            aria-label="最大化"
            title="最大化"
            onClick={onWindowToggleMaximize}
          >
            <Square size={12} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className="window-control-btn close"
            aria-label="关闭"
            title="关闭"
            onClick={onWindowClose}
          >
            <X size={15} strokeWidth={1.8} />
          </button>
        </div>
      )}
    </header>
  );
}
