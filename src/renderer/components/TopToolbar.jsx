import React from "react";
import { ArchiveIcon, ExplorerToggleIcon, SmartAiIcon } from "../icons/icon-registry";
import { Button } from "./ui/button";

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
  onToggleExplorer
}) {
  const sessionStatus = activeSession?.runtimeStatus || activeSession?.status || "";
  const ringActive = sessionStatus === "running" || sessionStatus === "streaming";

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
        <span className={`toolbar-session-ring ${ringActive ? "active" : ""}`} aria-hidden="true">
          <span className="toolbar-session-dot" />
        </span>
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
    </header>
  );
}
