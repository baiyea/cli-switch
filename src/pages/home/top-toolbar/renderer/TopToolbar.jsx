import React from "react";
import { Minus, Square, X } from "lucide-react";
import { ArchiveIcon, ExplorerToggleIcon, ProviderIcon, SmartAiIcon } from "../../../../ui/icon-registry";
import { Button } from "../../../../ui/button";

export function TopToolbar({
  sidebarCollapsed,
  activeSession,
  activeSessionProviderMeta,
  runtimeStatusLabel,
  onExpandSidebar,
  onRenameActiveSession,
  skillgenRunning,
  onRunSkillgen,
  canRunSkillgen,
  onArchiveActiveSession,
  canArchiveActiveSession,
  explorerVisible,
  onToggleExplorer,
  isWindows,
  onWindowMinimize,
  onWindowToggleMaximize,
  onWindowClose
}) {
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
        {activeSession && <span className="toolbar-session-status" title={runtimeStatusLabel[sessionStatus] || sessionStatus}>{runtimeStatusLabel[sessionStatus] || sessionStatus}</span>}
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
