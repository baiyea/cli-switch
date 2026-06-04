import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../../ui/dialog';
import { Tabs, TabsContent } from '../../../../ui/tabs';
import { AboutSettingsSection } from '../../about/renderer/AboutSettingsSection';
import { ArchiveSettingsSection } from '../../archive/renderer/ArchiveSettingsSection';
import { TokenUsageSettingsSection } from '../../token-usage/block.renderer';
import { ProviderSettingsSection } from './ProviderSettingsSection';
import { SettingsSideNav } from './SettingsSideNav';

export function SettingsModal({
  forceLock,
  settingsOpen,
  onClose,
  settingsSection,
  onSelectProviders,
  onSelectArchive,
  onSelectTokenUsage,
  onSelectAbout,
  providerSectionProps,
  archivedSessions,
  archiveCleanupRunning,
  archiveCleanupResult,
  providerLabel,
  onRestoreArchivedSession,
  onCleanupExpiredArchivedSessions,
  appVersion,
  appLogo,
}) {
  const headerMeta = (() => {
    if (settingsSection === 'about') {
      return {
        title: 'About',
        subtitle: 'Application details and system information.',
      };
    }
    if (settingsSection === 'providers') {
      return {
        title: 'Providers',
        subtitle: providerSectionProps?.isEditingOAuthProfile
          ? 'Configure OAuth authentication for AI providers.'
          : 'Configure your AI provider API keys and settings.',
      };
    }
    if (settingsSection === 'archive') {
      return {
        title: 'Archive',
        subtitle: 'Manage archived sessions and restore history.',
      };
    }
    if (settingsSection === 'token-usage') {
      return {
        title: 'Token 统计',
        subtitle: 'Review token usage by project, provider, model, and run segment.',
      };
    }
    return {
      title: 'Providers',
      subtitle: providerSectionProps?.isEditingOAuthProfile
        ? 'Configure OAuth authentication for AI providers.'
        : 'Configure your AI provider API keys and settings.',
    };
  })();

  const onSectionChange = async (value) => {
    if (value === 'archive') {
      await onSelectArchive();
      return;
    }
    if (value === 'about') {
      onSelectAbout();
      return;
    }
    if (value === 'token-usage') {
      onSelectTokenUsage();
      return;
    }
    onSelectProviders();
  };

  if (!settingsOpen) return null;

  return (
    <Dialog
      open={settingsOpen}
      onOpenChange={(open) => {
        if (!open && forceLock) return;
        if (!open) onClose();
      }}
    >
      <DialogContent
        showClose={false}
        className="settings-modal flex flex-col h-[min(763px,calc(100vh-32px))] max-h-[calc(100vh-32px)] p-0 gap-0"
      >
        <div className="settings-modal-header relative border-b border-white/[0.08] px-5 pt-2.5 pb-4">
          {!forceLock && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              className="absolute right-5 top-2 text-[18px] leading-none text-[#8A8A90] transition-opacity duration-150 hover:opacity-80"
            >
              ✕
            </button>
          )}
          <DialogHeader>
            <DialogTitle className="settings-modal-title">{headerMeta.title}</DialogTitle>
            <DialogDescription className="settings-modal-subtitle">
              {headerMeta.subtitle}
            </DialogDescription>
          </DialogHeader>
        </div>

        {forceLock && (
          <div className="provider-guard-banner">
            请先配置并启用至少一个大模型 Provider，方可使用 Cli-Switch
          </div>
        )}

        <Tabs
          value={settingsSection}
          onValueChange={onSectionChange}
          className="grid grid-cols-[240px_minmax(0,1fr)] gap-0 flex-1 min-h-0"
        >
          <SettingsSideNav />

          <div className="settings-panel flex-1 overflow-auto">
            <TabsContent value="providers" className="mt-0 h-full">
              <ProviderSettingsSection {...providerSectionProps} />
            </TabsContent>

            <TabsContent value="archive" className="mt-0 h-full">
              <ArchiveSettingsSection
                archivedSessions={archivedSessions}
                archiveCleanupRunning={archiveCleanupRunning}
                archiveCleanupResult={archiveCleanupResult}
                providerLabel={providerLabel}
                onRestoreArchivedSession={onRestoreArchivedSession}
                onCleanupExpiredArchivedSessions={onCleanupExpiredArchivedSessions}
              />
            </TabsContent>

            <TabsContent value="token-usage" className="mt-0 h-full">
              <TokenUsageSettingsSection />
            </TabsContent>

            <TabsContent value="about" className="mt-0 h-full">
              <AboutSettingsSection appVersion={appVersion} appLogo={appLogo} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
