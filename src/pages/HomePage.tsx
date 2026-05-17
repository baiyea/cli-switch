import { Button } from "../ui/button";
import { ExplorerToggleIcon, SettingsIcon } from "../ui/icon-registry";
import { SidebarProjectsPanel } from "./home/sidebar/renderer/SidebarProjectsPanel";
import { TerminalPanel } from "./home/terminal/renderer/TerminalPanel";
import { ExplorerPane } from "./home/file-tree/renderer/ExplorerPane";
import { TopToolbar } from "./home/top-toolbar/renderer/TopToolbar";
import { WelcomeView } from "./WelcomeView";
import { SettingsModal } from "./settings/providers/renderer/SettingsModal";
import { RenameSessionDialog } from "./home/terminal/renderer/RenameSessionDialog";
import { SkillgenResultDialog } from "./home/top-toolbar/renderer/SkillgenResultDialog";
import { useSessionStore } from "./home/home.store";

export interface HomePageProps {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (updater: boolean | ((prev: boolean) => boolean)) => void;
  explorerVisible: boolean;
  setExplorerVisible: (updater: boolean | ((prev: boolean) => boolean)) => void;
  settingsOpen: boolean;
  setSettingsOpen: (updater: boolean | ((prev: boolean) => boolean)) => void;
  settingsSection: string;
  setSettingsSection: (section: string) => void;
  providerCheckPassed: boolean;
  appError: string;
  activeProject: any;
  activeSessionProviderMeta: string;
  projects: any[];
  providerLabel: Record<string, string>;
  enabledProviderIds: string[];
  enabledSessionToolOptions: Array<{ id: string; label: string }>;
  primarySessionTool: { id: string; label: string } | null;
  sidebarProjectsPanelProps: any;
  explorerPaneProps: any;
  providerSectionProps: any;
  renameDialogProps: any;
  skillgenResultDialogProps: any;
  skillgenRunning: boolean;
  archivedSessions: any[];
  appVersion: string;
  appLogo: string;
  onAddProject: () => Promise<void>;
  createSessionForProject: (project: any, toolId?: string) => Promise<void>;
  openRenameModal: (sessionId: string) => void;
  destroySession: (sessionId: string) => Promise<void>;
  loadSettings: () => Promise<any>;
  loadArchivedSessions: () => Promise<any>;
  onRestoreArchivedSession: (archiveId: string) => Promise<void>;
  onRunSkillgen: () => void;
  onWindowMinimize: () => void;
  onWindowToggleMaximize: () => void;
  onWindowClose: () => void;
  onLearnMore: () => void;
}

export function HomePage({
  sidebarCollapsed,
  setSidebarCollapsed,
  explorerVisible,
  setExplorerVisible,
  settingsOpen,
  setSettingsOpen,
  settingsSection,
  setSettingsSection,
  providerCheckPassed,
  appError,
  activeProject,
  activeSessionProviderMeta,
  projects,
  providerLabel,
  enabledProviderIds,
  enabledSessionToolOptions,
  primarySessionTool,
  sidebarProjectsPanelProps,
  explorerPaneProps,
  providerSectionProps,
  renameDialogProps,
  skillgenResultDialogProps,
  skillgenRunning,
  archivedSessions,
  appVersion,
  appLogo,
  onAddProject,
  createSessionForProject,
  openRenameModal,
  destroySession,
  loadSettings,
  loadArchivedSessions,
  onRestoreArchivedSession,
  onRunSkillgen,
  onWindowMinimize,
  onWindowToggleMaximize,
  onWindowClose,
  onLearnMore
}: HomePageProps) {
  const isMacOS = typeof navigator !== "undefined"
    && /mac/i.test(String(navigator.platform || navigator.userAgent || ""));
  const isWindows = typeof navigator !== "undefined"
    && /win/i.test(String(navigator.platform || navigator.userAgent || ""));
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const hasProjects = projects.length > 0;

  return (
    <div className={`layout ${isMacOS ? "macos" : ""} ${isWindows ? "windows" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="brand">
            <div className="brand-title-wrap">
              <span className="brand-title">Cli-Switch</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="sidebar-trigger"
              aria-label="收缩会话栏"
              title="收缩会话栏"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
            >
              <ExplorerToggleIcon size={14} />
            </Button>
          </div>
        </div>

        <SidebarProjectsPanel
          {...sidebarProjectsPanelProps}
          enabledProviderIds={enabledProviderIds}
          primarySessionTool={primarySessionTool}
          enabledSessionToolOptions={enabledSessionToolOptions}
          setSettingsOpen={setSettingsOpen}
          createSessionForProject={createSessionForProject}
          openRenameModal={openRenameModal}
        />

        <div className="sidebar-settings">
          <Button
            type="button"
            variant="ghost"
            className={`sidebar-settings-btn ${settingsOpen ? "active" : ""}`}
            onClick={async () => {
              if (!providerCheckPassed) return;
              await loadSettings();
              setSettingsOpen(true);
            }}
          >
            <SettingsIcon className="settings-link-icon" />
            <span>Settings</span>
          </Button>
        </div>
      </aside>

      <main className="main">
        <TopToolbar
          sidebarCollapsed={sidebarCollapsed}
          activeSessionProviderMeta={activeSessionProviderMeta}
          onExpandSidebar={() => setSidebarCollapsed(false)}
          onRenameActiveSession={() => {
            if (!activeSessionId) return;
            openRenameModal(activeSessionId);
          }}
          skillgenRunning={skillgenRunning}
          onRunSkillgen={() => void onRunSkillgen()}
          canRunSkillgen={Boolean(activeProject?.id)}
          onArchiveActiveSession={() => {
            if (activeSessionId) destroySession(activeSessionId);
          }}
          explorerVisible={explorerVisible}
          onToggleExplorer={() => setExplorerVisible((prev) => !prev)}
          onWindowMinimize={onWindowMinimize}
          onWindowToggleMaximize={onWindowToggleMaximize}
          onWindowClose={onWindowClose}
        />

        {appError && <div className="banner-error">{appError}</div>}

        <div className={`main-content ${explorerVisible ? "" : "explorer-hidden"}`}>
          <section className="main-panel">
            {!hasProjects ? (
              <WelcomeView
                onCreateProject={() => void onAddProject()}
                onImportProject={() => void onAddProject()}
                onLearnMore={onLearnMore}
              />
            ) : activeProject ? (
              <TerminalPanel />
            ) : (
              <div className="settings-wrap" style={{ display: "block" }}>
                Select a project from the sidebar to begin your architectural session.
              </div>
            )}
          </section>

          <ExplorerPane {...explorerPaneProps} />
        </div>

        <SettingsModal
          forceLock={!providerCheckPassed}
          settingsOpen={settingsOpen}
          onClose={() => {
            if (!providerCheckPassed) return;
            setSettingsOpen(false);
          }}
          settingsSection={settingsSection}
          onSelectProviders={() => setSettingsSection("providers")}
          onSelectArchive={async () => {
            setSettingsSection("archive");
            await loadArchivedSessions();
          }}
          onSelectAbout={() => setSettingsSection("about")}
          providerSectionProps={providerSectionProps}
          archivedSessions={archivedSessions}
          providerLabel={providerLabel}
          onRestoreArchivedSession={onRestoreArchivedSession}
          appVersion={appVersion}
          appLogo={appLogo}
        />
        <RenameSessionDialog {...renameDialogProps} />
        <SkillgenResultDialog {...skillgenResultDialogProps} />
      </main>
    </div>
  );
}
