import { useEffect, useMemo, useState } from 'react';

import packageJson from '../../../package.json';
import appLogo from '../../assets/brand/app-logo.png';
import { Button } from '../../ui/button';
import { ExplorerToggleIcon, SettingsIcon } from '../../ui/icon-registry';
import { useArchiveList } from '../settings/archive/renderer/use-archive-list';
import { SettingsModal } from '../settings/providers/renderer/SettingsModal';
import {
  isProviderConfigured,
  useProviderSettings,
} from '../settings/providers/renderer/use-provider-settings';
import { ExplorerPane } from './file-tree/block.renderer';
import { useFileTree } from './file-tree/renderer/use-file-tree';
import { useHomeWorkspace } from './renderer/use-home-workspace';
import { useSessionLauncher } from './renderer/use-session-launcher';
import { SidebarProjectsPanel } from './sidebar/block.renderer';
import { RenameSessionDialog, TerminalPanel } from './terminal/block.renderer';
import { useSessionRename } from './terminal/renderer/use-session-rename';
import { SkillgenResultDialog, TopToolbar } from './top-toolbar/block.renderer';
import { useSkillgenRunner } from './top-toolbar/renderer/use-skillgen-runner';
import { WelcomeView } from './WelcomeView';

const SESSION_TOOL_OPTIONS = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex CLI' },
  { id: 'gemini', label: 'Gemini CLI' },
];

const PROVIDER_LABEL = {
  claude: 'Claude Code',
  codex: 'Codex CLI',
  gemini: 'Gemini CLI',
};

const APP_VERSION = String(packageJson?.version || '0.1.0');

export function HomePage() {
  const isWindows =
    typeof navigator !== 'undefined' &&
    /win/i.test(String(navigator.platform || navigator.userAgent || ''));
  const isMacOS =
    typeof navigator !== 'undefined' &&
    /mac/i.test(String(navigator.platform || navigator.userAgent || ''));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState('providers');
  const [appError, setAppError] = useState('');
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
    sidebarProjectsPanelProps,
  } = useHomeWorkspace({ setAppError });

  const {
    settingsModel,
    providerCheckPassed,
    setProviderCheckPassed,
    setProviderTab,
    loadSettings,
    providerSectionProps,
    enabledProviderIds,
    activeSessionProviderMeta,
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
    onFirstProviderConfigured: () => setSettingsOpen(false),
  });

  const { explorerPaneProps } = useFileTree({
    activeProject,
    activeWorkspaceCwd,
    explorerVisible,
    setAppError,
  });

  const { archivedSessions, loadArchivedSessions, onRestoreArchivedSession } = useArchiveList({
    refreshSessions,
  });

  const { openRenameModal, renameDialogProps } = useSessionRename({
    sessions,
    renameSession,
    setAppError,
  });

  const { skillgenRunning, onRunSkillgen, skillgenResultDialogProps } = useSkillgenRunner({
    activeProject,
    activeSessionId,
    setAppError,
  });

  const enabledSessionToolOptions = useMemo(
    () => SESSION_TOOL_OPTIONS.filter((item) => enabledProviderIds.includes(item.id)),
    [enabledProviderIds],
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
    setAppError,
  });

  useEffect(() => {
    (async () => {
      try {
        const [settings] = await Promise.all([loadSettings(), loadWorkspace()]);
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
    if (!settingsOpen || settingsSection !== 'archive') return;
    loadArchivedSessions();
  }, [settingsOpen, settingsSection]);

  const hasProjects = projects.length > 0;

  return (
    <div
      className={`layout ${isWindows ? 'windows' : ''} ${isMacOS ? 'macos' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}
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
            className={`sidebar-settings-btn ${settingsOpen ? 'active' : ''}`}
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
        />

        {appError && <div className="banner-error">{appError}</div>}

        <div className={`main-content ${explorerVisible ? '' : 'explorer-hidden'}`}>
          <section className="main-panel">
            {!hasProjects ? (
              <WelcomeView
                onCreateProject={() => void onAddProject()}
                onImportProject={() => void onAddProject()}
                onLearnMore={() =>
                  window.open(
                    'https://github.com/baiyea/cli-switch',
                    '_blank',
                    'noopener,noreferrer',
                  )
                }
              />
            ) : activeProject ? (
              <TerminalPanel />
            ) : (
              <div className="settings-wrap" style={{ display: 'block' }}>
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
          onSelectProviders={() => setSettingsSection('providers')}
          onSelectArchive={async () => {
            setSettingsSection('archive');
            await loadArchivedSessions();
          }}
          onSelectAbout={() => setSettingsSection('about')}
          providerSectionProps={providerSectionProps}
          archivedSessions={archivedSessions}
          providerLabel={PROVIDER_LABEL}
          onRestoreArchivedSession={onRestoreArchivedSession}
          appVersion={APP_VERSION}
          appLogo={appLogo}
        />
        <RenameSessionDialog {...renameDialogProps} />
        <SkillgenResultDialog {...skillgenResultDialogProps} />
      </main>
    </div>
  );
}
