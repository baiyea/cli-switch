import type { RefObject } from "react";
import { Button } from "../ui/button";
import { ExplorerToggleIcon, SettingsIcon } from "../ui/icon-registry";
import { SidebarProjectsPanel } from "../features/sidebar/renderer/SidebarProjectsPanel";
import { TerminalPanel } from "../features/terminal/renderer/TerminalPanel";
import { ExplorerPane } from "../features/file-tree/renderer/ExplorerPane";
import { TopToolbar } from "../features/terminal/renderer/TopToolbar";
import { WelcomeView } from "./WelcomeView";
import { SettingsModal } from "../features/providers/renderer/SettingsModal";
import { RenameSessionDialog } from "../features/terminal/renderer/RenameSessionDialog";
import { SkillgenResultDialog } from "../features/terminal/renderer/SkillgenResultDialog";

export interface HomePageProps {
  isMacOS: boolean;
  isWindows: boolean;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (updater: boolean | ((prev: boolean) => boolean)) => void;
  explorerVisible: boolean;
  setExplorerVisible: (updater: boolean | ((prev: boolean) => boolean)) => void;
  settingsOpen: boolean;
  setSettingsOpen: (updater: boolean | ((prev: boolean) => boolean)) => void;
  appError: string;

  projects: any[];
  activeProjectId: string | null;
  activeProject: any;
  activeSession: any;
  activeSessionId: string | null;
  activeSessionProviderMeta: string;
  activeWorkspaceCwd: string;

  sessions: any[];
  expandedProjects: Record<string, boolean>;
  showAllSessionsByProject: Record<string, boolean>;
  openCreateMenuProjectId: string | null;
  createMenuPlacementByProject: Record<string, any>;
  draggingSessionId: string;
  dragOverSessionId: string;

  enabledProviderIds: string[];
  enabledSessionToolOptions: { id: string; label: string }[];
  primarySessionTool: { id: string; label: string } | null;
  providerLabel: Record<string, string>;
  runtimeStatusLabel: Record<string, string>;
  providerCheckPassed: boolean;

  explorerCwd: string;
  explorerTreeWrapRef: RefObject<HTMLDivElement | null>;
  explorerLoading: boolean;
  explorerTree: any[];
  explorerTreeHeight: number;
  explorerIsGitRepo: boolean;

  settingsSection: string;
  archivedSessions: any[];
  appVersion: string;
  appLogo: string;
  providerSectionProps: any;

  renameModalOpen: boolean;
  renameSubmitting: boolean;
  renameInputRef: RefObject<HTMLInputElement | null>;
  renameDraft: string;
  setRenameDraft: (value: string) => void;
  closeRenameModal: (forceClose?: boolean) => void;
  submitRenameModal: () => Promise<void>;
  renameSuggesting: boolean;
  renameSuggestedTitle: string;
  renameSuggestSource: string;

  skillgenModalOpen: boolean;
  skillgenRunning: boolean;
  skillgenResult: any;
  setSkillgenModalOpen: (open: boolean) => void;

  onAddProject: () => Promise<void>;
  setActiveProjectId: (id: string) => void;
  setExpandedProjects: (updater: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
  setOpenCreateMenuProjectId: (id: string | null) => void;
  setCreateMenuPlacementByProject: (updater: Record<string, any> | ((prev: Record<string, any>) => Record<string, any>)) => void;
  createSessionForProject: (project: any, toolId?: string) => Promise<void>;
  onSyncProjectHistory: (project: any) => Promise<void>;
  setDraggingSessionId: (id: string) => void;
  setDragOverSessionId: (id: string) => void;
  handleSessionDrop: (projectId: string, orderedProjectSessions: any[], targetSessionId: string) => Promise<void>;
  setActiveSession: (sessionId: string) => void;
  openRenameModal: (sessionId: string) => void;
  destroySession: (sessionId: string) => Promise<void>;
  setShowAllSessionsByProject: (updater: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;

  onRenameActiveSession: () => void;
  onRunSkillgen: () => void;
  canRunSkillgen: boolean;
  onArchiveActiveSession: () => void;
  canArchiveActiveSession: boolean;
  onWindowMinimize: () => void;
  onWindowToggleMaximize: () => void;
  onWindowClose: () => void;

  onOpenWorkspaceInFileManager: () => Promise<void>;
  onOpenExplorerFile: (path: string) => Promise<void>;
  loadSettings: () => Promise<any>;
  onLearnMore: () => void;

  onSelectProviders: () => void;
  onSelectArchive: () => Promise<void>;
  onSelectAbout: () => void;
  onRestoreArchivedSession: (archiveId: string) => Promise<void>;
}

export function HomePage({
  isMacOS,
  isWindows,
  sidebarCollapsed,
  setSidebarCollapsed,
  explorerVisible,
  setExplorerVisible,
  settingsOpen,
  setSettingsOpen,
  appError,
  projects,
  activeProjectId,
  activeProject,
  activeSession,
  activeSessionId,
  activeSessionProviderMeta,
  activeWorkspaceCwd,
  sessions,
  expandedProjects,
  showAllSessionsByProject,
  openCreateMenuProjectId,
  createMenuPlacementByProject,
  draggingSessionId,
  dragOverSessionId,
  enabledProviderIds,
  enabledSessionToolOptions,
  primarySessionTool,
  providerLabel,
  runtimeStatusLabel,
  providerCheckPassed,
  explorerCwd,
  explorerTreeWrapRef,
  explorerLoading,
  explorerTree,
  explorerTreeHeight,
  explorerIsGitRepo,
  settingsSection,
  archivedSessions,
  appVersion,
  appLogo,
  providerSectionProps,
  renameModalOpen,
  renameSubmitting,
  renameInputRef,
  renameDraft,
  setRenameDraft,
  closeRenameModal,
  submitRenameModal,
  renameSuggesting,
  renameSuggestedTitle,
  renameSuggestSource,
  skillgenModalOpen,
  skillgenRunning,
  skillgenResult,
  setSkillgenModalOpen,
  onAddProject,
  setActiveProjectId,
  setExpandedProjects,
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
  setShowAllSessionsByProject,
  onRenameActiveSession,
  onRunSkillgen,
  canRunSkillgen,
  onArchiveActiveSession,
  canArchiveActiveSession,
  onWindowMinimize,
  onWindowToggleMaximize,
  onWindowClose,
  onOpenWorkspaceInFileManager,
  onOpenExplorerFile,
  loadSettings,
  onLearnMore,
  onSelectProviders,
  onSelectArchive,
  onSelectAbout,
  onRestoreArchivedSession
}: HomePageProps) {
  const hasProjects = projects.length > 0;

  return (
    <div
      className={`layout ${isMacOS ? "macos" : ""} ${isWindows ? "windows" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
    >
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
          projects={projects}
          sessions={sessions}
          expandedProjects={expandedProjects}
          activeProjectId={activeProjectId}
          enabledProviderIds={enabledProviderIds}
          activeSessionId={activeSessionId}
          showAllSessionsByProject={showAllSessionsByProject}
          openCreateMenuProjectId={openCreateMenuProjectId}
          createMenuPlacementByProject={createMenuPlacementByProject}
          primarySessionTool={primarySessionTool}
          enabledSessionToolOptions={enabledSessionToolOptions}
          draggingSessionId={draggingSessionId}
          dragOverSessionId={dragOverSessionId}
          providerLabel={providerLabel}
          runtimeStatusLabel={runtimeStatusLabel}
          onAddProject={onAddProject}
          setActiveProjectId={setActiveProjectId}
          setExpandedProjects={setExpandedProjects}
          setSettingsOpen={setSettingsOpen}
          setOpenCreateMenuProjectId={setOpenCreateMenuProjectId}
          setCreateMenuPlacementByProject={setCreateMenuPlacementByProject}
          createSessionForProject={createSessionForProject}
          onSyncProjectHistory={onSyncProjectHistory}
          setDraggingSessionId={setDraggingSessionId}
          setDragOverSessionId={setDragOverSessionId}
          handleSessionDrop={handleSessionDrop}
          setActiveSession={setActiveSession}
          openRenameModal={openRenameModal}
          destroySession={destroySession}
          setShowAllSessionsByProject={setShowAllSessionsByProject}
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
          activeSession={activeSession}
          activeSessionProviderMeta={activeSessionProviderMeta}
          runtimeStatusLabel={runtimeStatusLabel}
          onExpandSidebar={() => setSidebarCollapsed(false)}
          onRenameActiveSession={() => {
            if (!activeSession?.sessionId) return;
            onRenameActiveSession();
          }}
          skillgenRunning={skillgenRunning}
          onRunSkillgen={() => void onRunSkillgen()}
          canRunSkillgen={Boolean(activeProject?.id)}
          onArchiveActiveSession={() => activeSessionId && onArchiveActiveSession()}
          canArchiveActiveSession={Boolean(activeSessionId)}
          explorerVisible={explorerVisible}
          onToggleExplorer={() => setExplorerVisible((prev) => !prev)}
          isWindows={isWindows}
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
              <TerminalPanel projectId={activeProject.id} cwd={activeProject.path} />
            ) : (
              <div className="settings-wrap" style={{ display: "block" }}>
                Select a project from the sidebar to begin your architectural session.
              </div>
            )}
          </section>

          <ExplorerPane
            explorerVisible={explorerVisible}
            activeProject={activeProject}
            activeWorkspaceCwd={activeWorkspaceCwd}
            explorerCwd={explorerCwd}
            explorerTreeWrapRef={explorerTreeWrapRef}
            explorerLoading={explorerLoading}
            explorerTree={explorerTree}
            explorerTreeHeight={explorerTreeHeight}
            explorerIsGitRepo={explorerIsGitRepo}
            onOpenWorkspaceInFileManager={onOpenWorkspaceInFileManager}
            onOpenExplorerFile={onOpenExplorerFile}
          />
        </div>

        <SettingsModal
          forceLock={!providerCheckPassed}
          settingsOpen={settingsOpen}
          onClose={() => {
            if (!providerCheckPassed) return;
            setSettingsOpen(false);
          }}
          settingsSection={settingsSection}
          onSelectProviders={onSelectProviders}
          onSelectArchive={onSelectArchive}
          onSelectAbout={onSelectAbout}
          providerSectionProps={providerSectionProps}
          archivedSessions={archivedSessions}
          providerLabel={providerLabel}
          onRestoreArchivedSession={onRestoreArchivedSession}
          appVersion={appVersion}
          appLogo={appLogo}
        />

        <RenameSessionDialog
          open={renameModalOpen}
          onClose={closeRenameModal}
          submitting={renameSubmitting}
          inputRef={renameInputRef}
          draft={renameDraft}
          onDraftChange={setRenameDraft}
          onSubmit={() => void submitRenameModal()}
          suggesting={renameSuggesting}
          suggestedTitle={renameSuggestedTitle}
          suggestSource={renameSuggestSource}
          onUseSuggestedTitle={setRenameDraft}
        />

        <SkillgenResultDialog
          open={skillgenModalOpen}
          running={skillgenRunning}
          result={skillgenResult}
          onClose={() => setSkillgenModalOpen(false)}
        />
      </main>
    </div>
  );
}
