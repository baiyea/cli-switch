import React from "react";
import { ArchiveIcon, ChevronDownIcon, ChevronRightIcon, ProviderIcon } from "../../../../ui/icon-registry";
import { Button } from "../../../../ui/button";
import { normalizeProviderId } from "../../../../pages/settings/providers/renderer/provider-config";

export function SidebarProjectsPanel({
  projects,
  sessions,
  expandedProjects,
  activeProjectId,
  enabledProviderIds,
  activeSessionId,
  showAllSessionsByProject,
  openCreateMenuProjectId,
  createMenuPlacementByProject,
  primarySessionTool,
  enabledSessionToolOptions,
  draggingSessionId,
  dragOverSessionId,
  providerLabel,
  runtimeStatusLabel,
  onAddProject,
  setActiveProjectId,
  setExpandedProjects,
  setSettingsOpen,
  setOpenCreateMenuProjectId,
  setCreateMenuPlacementByProject,
  createSessionForProject,
  onSyncProjectHistory,
  setDraggingSessionId,
  setDragOverSessionId,
  handleSessionDrop,
  setActiveSession,
  openRenameModal,
  destroySession,
  setShowAllSessionsByProject
}) {
  return (
    <div className="sidebar-sessions">
      <div className="sidebar-nav-label">
        <span>ACTIVE WORKSPACE</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="sidebar-nav-collapse-btn"
          title="添加项目"
          aria-label="添加项目"
          onClick={onAddProject}
        >
          <ChevronDownIcon size={14} />
        </Button>
      </div>
      <div className="project-tree" data-testid="project-tree">
        {projects.map((p) => {
          const expanded = expandedProjects[p.id] !== false;
          const projectSessions = sessions.filter(
            (s) =>
              (s.projectId === p.id
                || s.cwd === p.path
                || s.cwd.startsWith(`${p.path}${p.path.endsWith("/") ? "" : "/"}`))
              && enabledProviderIds.includes(normalizeProviderId(s.provider))
          );
          const orderedProjectSessions = [...projectSessions].sort(
            (a, b) => Number(b.sortOrder || 0) - Number(a.sortOrder || 0)
          );
          const hiddenSessionCount = Math.max(0, orderedProjectSessions.length - 5);
          const activeSessionInHidden = hiddenSessionCount > 0
            && orderedProjectSessions.slice(5).some((item) => item.sessionId === activeSessionId);
          const manualShowAll = showAllSessionsByProject[p.id];
          const showAllSessions = typeof manualShowAll === "boolean"
            ? manualShowAll
            : activeSessionInHidden;
          const visibleProjectSessions = showAllSessions
            ? orderedProjectSessions
            : orderedProjectSessions.slice(0, 5);
          return (
            <div key={p.id} className="project-node" data-testid={`project-${p.id}`}>
              <div
                className={`project-head ${activeProjectId === p.id ? "active" : ""}`}
                onClick={() => {
                  setActiveProjectId(p.id);
                  setExpandedProjects((prev) => ({ ...prev, [p.id]: !expanded }));
                  setSettingsOpen(false);
                }}
              >
                <span className="project-caret">{expanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}</span>
                <span className="project-name">{p.name}</span>
                {primarySessionTool && (
                  <div className={`project-create-wrap ${openCreateMenuProjectId === p.id ? "open" : ""}`}>
                    <Button
                      className="project-create-main"
                      variant="ghost"
                      size="icon"
                      title={`新建会话（${primarySessionTool.label}）`}
                      aria-label={`为项目 ${p.name} 新建会话`}
                      onClick={async (e) => {
                        e.stopPropagation();
                        setOpenCreateMenuProjectId(null);
                        setActiveProjectId(p.id);
                        await createSessionForProject(p, primarySessionTool.id);
                      }}
                    >
                      <ProviderIcon provider={primarySessionTool.id} className="project-tool-icon" />
                    </Button>
                    <Button
                      className="project-create-toggle"
                      variant="ghost"
                      size="icon"
                      title="选择会话类型"
                      aria-label="选择会话类型"
                      onClick={(e) => {
                        e.stopPropagation();
                        const button = e.currentTarget;
                        const sessionsEl = button.closest(".sidebar-sessions");
                        const menuEstimatedHeight = 230;
                        let placement = "down";
                        if (sessionsEl instanceof HTMLElement && button instanceof HTMLElement) {
                          const blockRect = sessionsEl.getBoundingClientRect();
                          const buttonRect = button.getBoundingClientRect();
                          const spaceBelow = blockRect.bottom - buttonRect.bottom;
                          const spaceAbove = buttonRect.top - blockRect.top;
                          if (spaceBelow < menuEstimatedHeight && spaceAbove > spaceBelow) {
                            placement = "up";
                          }
                        }
                        setCreateMenuPlacementByProject((prev) => ({ ...prev, [p.id]: placement }));
                        setOpenCreateMenuProjectId((prev) => (prev === p.id ? null : p.id));
                      }}
                    >
                      ▾
                    </Button>
                    {openCreateMenuProjectId === p.id && (
                      <div
                        className={`project-create-menu ${createMenuPlacementByProject[p.id] === "up" ? "upward" : ""}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {enabledSessionToolOptions.map((option) => (
                          <Button
                            key={option.id}
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={`project-create-item ${primarySessionTool.id === option.id ? "active" : ""}`}
                            onClick={async () => {
                              setOpenCreateMenuProjectId(null);
                              setActiveProjectId(p.id);
                              await createSessionForProject(p, option.id);
                            }}
                          >
                            <ProviderIcon provider={option.id} className="project-tool-icon" />
                            <span>{option.label}</span>
                          </Button>
                        ))}
                        <div className="project-create-divider" />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="project-create-item"
                          onClick={async () => {
                            setOpenCreateMenuProjectId(null);
                            setActiveProjectId(p.id);
                            await onSyncProjectHistory(p);
                          }}
                        >
                          <span className="project-create-history-icon" aria-hidden="true">↻</span>
                          <span>读取历史会话</span>
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {expanded && (
                <div className="project-content">
                  {orderedProjectSessions.length === 0 ? (
                    <div className="session-empty">暂无会话</div>
                  ) : (
                    visibleProjectSessions.map((session) => {
                      const sessionStatus = session.runtimeStatus || session.status || "";
                      const hasVisualStatus = Boolean(sessionStatus) && sessionStatus !== "idle";
                      return (
                        <div
                          key={session.sessionId}
                          className={`session-item ${session.sessionId === activeSessionId ? "active" : ""} ${dragOverSessionId === session.sessionId ? "drag-over" : ""}`}
                          data-testid={`session-item-${session.sessionId}`}
                          draggable
                          onDragStart={(e) => {
                            setDraggingSessionId(session.sessionId);
                            setDragOverSessionId("");
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", session.sessionId);
                          }}
                          onDragEnd={() => {
                            setDraggingSessionId("");
                            setDragOverSessionId("");
                          }}
                          onDragOver={(e) => {
                            if (!draggingSessionId || draggingSessionId === session.sessionId) return;
                            e.preventDefault();
                            setDragOverSessionId(session.sessionId);
                          }}
                          onDragEnter={(e) => {
                            if (!draggingSessionId || draggingSessionId === session.sessionId) return;
                            e.preventDefault();
                            setDragOverSessionId(session.sessionId);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void handleSessionDrop(p.id, orderedProjectSessions, session.sessionId);
                          }}
                          onClick={() => {
                            setSettingsOpen(false);
                            setActiveProjectId(p.id);
                            setActiveSession(session.sessionId);
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter" && e.key !== " ") return;
                            e.preventDefault();
                            setSettingsOpen(false);
                            setActiveProjectId(p.id);
                            setActiveSession(session.sessionId);
                          }}
                        >
                          <ProviderIcon
                            provider={session.provider || "claude"}
                            className={`session-provider-icon ${sessionStatus} ${hasVisualStatus ? "" : "no-status"}`}
                            variant="default"
                            size={14}
                            title={
                              hasVisualStatus
                                ? `${providerLabel[session.provider] || session.provider || "Claude Code"} · ${runtimeStatusLabel[sessionStatus] || sessionStatus}`
                                : (providerLabel[session.provider] || session.provider || "Claude Code")
                            }
                          />
                          <span
                            className="session-item-name"
                            onDoubleClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openRenameModal(session.sessionId);
                            }}
                            title="双击重命名会话"
                          >
                            {session.name}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="session-archive-btn"
                            title="归档会话"
                            aria-label={`归档会话 ${session.name}`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              destroySession(session.sessionId);
                            }}
                          >
                            <ArchiveIcon size={12} />
                          </Button>
                        </div>
                      );
                    })
                  )}
                  {hiddenSessionCount > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="session-collapse-toggle"
                      onClick={() => {
                        setShowAllSessionsByProject((prev) => ({
                          ...prev,
                          [p.id]: !showAllSessions
                        }));
                      }}
                    >
                      {showAllSessions ? "收起" : `展开显示（+${hiddenSessionCount}）`}
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
