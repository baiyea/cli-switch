import React, { useEffect, useMemo, useState } from "react";
import { topToolbarBridge } from "../pages/home/top-toolbar/renderer/top-toolbar.bridge";
import { HomePage } from "../pages/HomePage";
import { useAppWorkspace } from "../pages/home/shared/renderer/use-app-workspace";
import { useSessionLauncher } from "../pages/home/shared/renderer/use-session-launcher";
import { isProviderConfigured, useProviderSettings } from "../pages/settings/providers/renderer/use-provider-settings";
import { useFileTree } from "../pages/home/file-tree/renderer/use-file-tree";
import { useArchiveList } from "../pages/settings/archive/renderer/use-archive-list";
import { useSessionRename } from "../pages/home/terminal/renderer/use-session-rename";
import { useSkillgenRunner } from "../pages/home/top-toolbar/renderer/use-skillgen-runner";
import packageJson from "../../package.json";
import appLogo from "../assets/brand/app-logo.png";

const SESSION_TOOL_OPTIONS = [
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex CLI" },
  { id: "gemini", label: "Gemini CLI" }
];

const PROVIDER_LABEL = {
  claude: "Claude Code",
  codex: "Codex CLI",
  gemini: "Gemini CLI"
};

const TRAFFIC_LIGHT_Y = 20;
const TRAFFIC_LIGHT_X_IN_SIDEBAR = 14;
const APP_VERSION = String(packageJson?.version || "0.1.0");

function App() {
  const isMacOS = typeof navigator !== "undefined"
    && /mac/i.test(String(navigator.platform || navigator.userAgent || ""));
  const isWindows = typeof navigator !== "undefined"
    && /win/i.test(String(navigator.platform || navigator.userAgent || ""));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState("providers");
  const [appError, setAppError] = useState("");
  const [explorerVisible, setExplorerVisible] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const {
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
    sidebarProjectsPanelProps
  } = useAppWorkspace({ setAppError });

  const {
    settingsModel,
    providerCheckPassed,
    setProviderCheckPassed,
    setProviderTab,
    loadSettings,
    providerSectionProps,
    enabledProviderIds,
    activeSessionProviderMeta
  } = useProviderSettings({
    sessions,
    activeProjectId,
    activeProject,
    activeSession,
    activeWorkspaceCwd,
    refreshSessions,
    setActiveSession,
    setActiveProjectId,
    providerLabel: PROVIDER_LABEL,
    onFirstProviderConfigured: () => setSettingsOpen(false)
  });

  const { explorerPaneProps } = useFileTree({
    activeProject,
    activeWorkspaceCwd,
    explorerVisible,
    setAppError
  });

  const {
    archivedSessions,
    loadArchivedSessions,
    onRestoreArchivedSession
  } = useArchiveList({ refreshSessions });

  const {
    openRenameModal,
    renameDialogProps
  } = useSessionRename({
    sessions,
    renameSession,
    setAppError
  });

  const {
    skillgenRunning,
    onRunSkillgen,
    skillgenResultDialogProps
  } = useSkillgenRunner({
    activeProject,
    activeSessionId,
    setAppError
  });

  const enabledSessionToolOptions = useMemo(
    () => SESSION_TOOL_OPTIONS.filter((item) => enabledProviderIds.includes(item.id)),
    [enabledProviderIds]
  );
  const primarySessionTool = enabledSessionToolOptions[0] || null;
  const { createSessionForProject } = useSessionLauncher({
    settingsModel,
    sessionToolOptions: SESSION_TOOL_OPTIONS,
    createSession,
    setActiveSession,
    setSettingsOpen,
    setSettingsSection,
    setProviderTab,
    setAppError
  });

  useEffect(() => {
    (async () => {
      try {
        const [settings] = await Promise.all([
          loadSettings(),
          loadWorkspace()
        ]);
        if (!isProviderConfigured(settings)) {
          setProviderCheckPassed(false);
          setSettingsOpen(true);
        } else {
          setProviderCheckPassed(true);
        }
      } catch {
        setProviderCheckPassed(false);
        setSettingsOpen(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!settingsOpen || settingsSection !== "archive") return;
    loadArchivedSessions();
  }, [settingsOpen, settingsSection]);

  useEffect(() => {
    if (!isMacOS) return;
    void topToolbarBridge.window.setTrafficLightPosition({
      x: TRAFFIC_LIGHT_X_IN_SIDEBAR,
      y: TRAFFIC_LIGHT_Y
    }).catch(() => {});
  }, [isMacOS, sidebarCollapsed]);

  return (
    <HomePage
      sidebarCollapsed={sidebarCollapsed}
      setSidebarCollapsed={setSidebarCollapsed}
      explorerVisible={explorerVisible}
      setExplorerVisible={setExplorerVisible}
      settingsOpen={settingsOpen}
      setSettingsOpen={setSettingsOpen}
      settingsSection={settingsSection}
      setSettingsSection={setSettingsSection}
      providerCheckPassed={providerCheckPassed}
      appError={appError}
      activeProject={activeProject}
      activeSessionProviderMeta={activeSessionProviderMeta}
      projects={projects}
      providerLabel={PROVIDER_LABEL}
      enabledProviderIds={enabledProviderIds}
      enabledSessionToolOptions={enabledSessionToolOptions}
      primarySessionTool={primarySessionTool}
      sidebarProjectsPanelProps={sidebarProjectsPanelProps}
      explorerPaneProps={explorerPaneProps}
      providerSectionProps={providerSectionProps}
      renameDialogProps={renameDialogProps}
      skillgenResultDialogProps={skillgenResultDialogProps}
      skillgenRunning={skillgenRunning}
      archivedSessions={archivedSessions}
      appVersion={APP_VERSION}
      appLogo={appLogo}
      onAddProject={onAddProject}
      createSessionForProject={createSessionForProject}
      openRenameModal={openRenameModal}
      destroySession={destroySession}
      loadSettings={loadSettings}
      loadArchivedSessions={loadArchivedSessions}
      onRestoreArchivedSession={onRestoreArchivedSession}
      onRunSkillgen={onRunSkillgen}
      onWindowMinimize={() => {
        void topToolbarBridge.window.minimize().catch(() => {});
      }}
      onWindowToggleMaximize={() => {
        void topToolbarBridge.window.toggleMaximize().catch(() => {});
      }}
      onWindowClose={() => {
        void topToolbarBridge.window.close().catch(() => {});
      }}
      onLearnMore={() => topToolbarBridge.window.openExternal("https://github.com/baiyea/cli-switch")}
    />
  );
}

export default App;
