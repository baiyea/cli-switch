import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { useT } from '../../i18n/use-t';
import { Tabs, TabsContent } from '../../ui/tabs';
import { AboutSettingsSection } from './about/block.renderer';
import { AppearanceSettingsSection } from './appearance/block.renderer';
import { ArchiveSettingsSection } from './archive/block.renderer';
import { ProviderSettingsSection } from './providers/block.renderer';
import { SettingsSideNav } from './SettingsSideNav';
import { TokenUsageSettingsSection } from './token-usage/block.renderer';

export function SettingsModal({
  forceLock,
  settingsOpen,
  onClose,
  settingsSection,
  onSelectProviders,
  onSelectArchive,
  onSelectTokenUsage,
  onSelectAppearance,
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
  const t = useT();
  const headerMeta = (() => {
    if (settingsSection === 'about') {
      return {
        title: t('settings.section.about.title'),
        subtitle: t('settings.section.about.subtitle'),
      };
    }
    if (settingsSection === 'appearance') {
      return {
        title: t('settings.appearance.title'),
        subtitle: t('settings.appearance.subtitle'),
      };
    }
    if (settingsSection === 'providers') {
      return {
        title: t('settings.section.providers.title'),
        subtitle: providerSectionProps?.isEditingOAuthProfile
          ? t('settings.section.providers.oauthSubtitle')
          : t('settings.section.providers.subtitle'),
      };
    }
    if (settingsSection === 'archive') {
      return {
        title: t('settings.section.archive.title'),
        subtitle: t('settings.section.archive.subtitle'),
      };
    }
    if (settingsSection === 'token-usage') {
      return {
        title: t('settings.section.tokenUsage.title'),
        subtitle: t('settings.section.tokenUsage.subtitle'),
      };
    }
    return {
      title: t('settings.section.providers.title'),
      subtitle: providerSectionProps?.isEditingOAuthProfile
        ? t('settings.section.providers.oauthSubtitle')
        : t('settings.section.providers.subtitle'),
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
    if (value === 'appearance') {
      onSelectAppearance();
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
        <div className="settings-modal-header relative border-b px-5 pt-2.5 pb-4">
          {!forceLock && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t('settings.modal.close')}
              className="settings-modal-close-btn absolute right-5 top-2 text-[18px] leading-none transition-opacity duration-150 hover:opacity-80"
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
            {t('settings.guard.providerRequired')}
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

            <TabsContent value="appearance" className="mt-0 h-full">
              <AppearanceSettingsSection />
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
