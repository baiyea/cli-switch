import { useEffect, useMemo, useState } from "react";
import { logBridge } from "../../../../shared/bridge/log.bridge";
import { projectBridge, sidebarSessionBridge } from "../../sidebar/renderer/sidebar.bridge";
import { useSessionStore } from "../../home.store";

export function useAppWorkspace({
  setAppError
}) {
  const [projects, setProjects] = useState([]);
  const [expandedProjects, setExpandedProjects] = useState({});
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [openCreateMenuProjectId, setOpenCreateMenuProjectId] = useState(null);
  const [createMenuPlacementByProject, setCreateMenuPlacementByProject] = useState({});
  const [showAllSessionsByProject, setShowAllSessionsByProject] = useState({});
  const [draggingSessionId, setDraggingSessionId] = useState("");
  const [dragOverSessionId, setDragOverSessionId] = useState("");

  const sessions = useSessionStore((state) => state.sessions);
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const createSession = useSessionStore((state) => state.createSession);
  const loadSessionsByProjects = useSessionStore((state) => state.loadSessionsByProjects);
  const ensureSessionRunning = useSessionStore((state) => state.ensureSessionRunning);
  const renameSession = useSessionStore((state) => state.renameSession);
  const reorderSessions = useSessionStore((state) => state.reorderSessions);
  const setActiveSession = useSessionStore((state) => state.setActiveSession);
  const destroySession = useSessionStore((state) => state.destroySession);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) || null,
    [projects, activeProjectId]
  );
  const activeSession = useMemo(
    () => sessions.find((session) => session.sessionId === activeSessionId) || null,
    [sessions, activeSessionId]
  );
  const activeWorkspaceCwd = activeSession?.cwd || activeProject?.path || "";
  async function loadProjects() {
    const list = await projectBridge.list();
    setProjects(list);

    setExpandedProjects((prev) => {
      const next = { ...prev };
      for (const project of list) {
        if (typeof next[project.id] !== "boolean") next[project.id] = true;
      }
      return next;
    });

    if (!activeProjectId && list[0]) {
      setActiveProjectId(list[0].id);
    }
    return list;
  }

  async function loadWorkspace() {
    const list = await loadProjects();
    await loadSessionsByProjects(list.map((project) => project.id));
    return list;
  }

  async function refreshSessions() {
    const ids = projects.map((project) => project.id);
    await loadSessionsByProjects(ids);
  }

  async function onAddProject() {
    setAppError?.("");
    try {
      const created = await projectBridge.add();
      if (!created) return;
      const list = await loadProjects();
      await loadSessionsByProjects(list.map((project) => project.id));
      setActiveProjectId(created.id);
    } catch (e) {
      setAppError?.(`添加项目失败：${e?.message || "未知错误"}`);
    }
  }

  async function handleSessionDrop(projectId, orderedProjectSessions, targetSessionId) {
    const sourceSessionId = draggingSessionId;
    setDragOverSessionId("");
    setDraggingSessionId("");
    if (!projectId || !sourceSessionId || !targetSessionId || sourceSessionId === targetSessionId) return;

    const fromIndex = orderedProjectSessions.findIndex((item) => item.sessionId === sourceSessionId);
    const toIndex = orderedProjectSessions.findIndex((item) => item.sessionId === targetSessionId);
    if (fromIndex < 0 || toIndex < 0) return;

    const nextOrder = [...orderedProjectSessions];
    const [moved] = nextOrder.splice(fromIndex, 1);
    nextOrder.splice(toIndex, 0, moved);
    await reorderSessions(
      projectId,
      nextOrder.map((item) => ({
        provider: item.provider || "claude",
        providerSessionId: item.providerSessionId || item.sessionId
      }))
    );
  }

  async function onSyncProjectHistory(project) {
    if (!project) return;
    setAppError?.("");
    try {
      await sidebarSessionBridge.syncProject({ projectId: project.id });
      await refreshSessions();
    } catch (e) {
      setAppError?.(`读取历史会话失败：${e?.message || "未知错误"}`);
    }
  }

  useEffect(() => {
    if (!activeSession) return;
    const project = projects.find((item) => item.path === activeSession.cwd);
    if (project && project.id !== activeProjectId) {
      setActiveProjectId(project.id);
    }
  }, [activeSession, projects, activeProjectId]);

  useEffect(() => {
    if (!activeSessionId) return;
    logBridge.write({
      level: "info",
      scope: "app",
      message: "Ensuring session running",
      meta: { activeSessionId }
    });
    ensureSessionRunning(activeSessionId);
  }, [activeSessionId, ensureSessionRunning]);

  useEffect(() => {
    logBridge.write({
      level: "info",
      scope: "app",
      message: "Selection changed",
      meta: {
        activeProjectId: activeProject?.id || null,
        activeSessionId: activeSession?.sessionId || null,
        activeSessionCwd: activeSession?.cwd || ""
      }
    });
  }, [activeProject?.id, activeSession?.sessionId, activeSession?.cwd]);

  useEffect(() => {
    if (!openCreateMenuProjectId) return undefined;
    const onWindowClick = (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest(".project-create-wrap")) return;
      setOpenCreateMenuProjectId(null);
    };
    window.addEventListener("click", onWindowClick);
    return () => window.removeEventListener("click", onWindowClick);
  }, [openCreateMenuProjectId]);

  return {
    projects,
    sessions,
    activeProjectId,
    activeProject,
    activeSessionId,
    activeSession,
    activeWorkspaceCwd,
    renameSession,
    createSession,
    setActiveProjectId,
    setActiveSession,
    destroySession,
    loadWorkspace,
    refreshSessions,
    onAddProject,
    sidebarProjectsPanelProps: {
      projects,
      expandedProjects,
      activeProjectId,
      showAllSessionsByProject,
      openCreateMenuProjectId,
      createMenuPlacementByProject,
      draggingSessionId,
      dragOverSessionId,
      onAddProject,
      setActiveProjectId,
      setExpandedProjects,
      setOpenCreateMenuProjectId,
      setCreateMenuPlacementByProject,
      onSyncProjectHistory,
      setDraggingSessionId,
      setDragOverSessionId,
      handleSessionDrop,
      setActiveSession,
      destroySession,
      setShowAllSessionsByProject
    }
  };
}
