import React from "react";
import { AboutSettingsSection } from "./AboutSettingsSection";
import { ArchiveSettingsSection } from "./ArchiveSettingsSection";
import { AppearanceSettingsSection } from "./AppearanceSettingsSection";
import { ProviderSettingsSection } from "./ProviderSettingsSection";
import { SettingsSideNav } from "./SettingsSideNav";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Tabs, TabsContent } from "../ui/tabs";

export function SettingsModal({
  settingsOpen,
  onClose,
  settingsSection,
  onSelectProviders,
  onSelectArchive,
  onSelectAppearance,
  onSelectAbout,
  providerSectionProps,
  archivedSessions,
  providerLabel,
  onRestoreArchivedSession,
  appVersion,
  appLogo
}) {
  const onSectionChange = async (value) => {
    if (value === "archive") {
      await onSelectArchive();
      return;
    }
    if (value === "appearance") {
      onSelectAppearance();
      return;
    }
    if (value === "about") {
      onSelectAbout();
      return;
    }
    onSelectProviders();
  };

  if (!settingsOpen) return null;

  return (
    <Dialog open={settingsOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="settings-modal flex flex-col h-[min(763px,calc(100vh-32px))] max-h-[calc(100vh-32px)] p-0 gap-0">
        <div className="settings-modal-header border-b border-white/10 px-7 py-5">
          <DialogHeader>
            <DialogTitle className="settings-modal-title">Settings</DialogTitle>
            <DialogDescription className="settings-modal-subtitle">
              Configure environments and manage archives.
            </DialogDescription>
          </DialogHeader>
        </div>

        <Tabs value={settingsSection} onValueChange={onSectionChange} className="grid grid-cols-[250px_minmax(0,1fr)] gap-5 flex-1 min-h-0 p-5">
          <SettingsSideNav />

          <div className="settings-panel overflow-auto rounded-lg border border-white/10 bg-white/[0.03]">
            <TabsContent value="providers" className="mt-0">
              <ProviderSettingsSection {...providerSectionProps} />
            </TabsContent>

            <TabsContent value="archive" className="mt-0">
              <ArchiveSettingsSection
                archivedSessions={archivedSessions}
                providerLabel={providerLabel}
                onRestoreArchivedSession={onRestoreArchivedSession}
              />
            </TabsContent>

            <TabsContent value="appearance" className="mt-0">
              <AppearanceSettingsSection />
            </TabsContent>

            <TabsContent value="about" className="mt-0">
              <AboutSettingsSection appVersion={appVersion} appLogo={appLogo} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
