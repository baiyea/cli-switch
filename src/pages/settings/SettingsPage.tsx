import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';

import { Button } from '../../ui/button';
import { AboutSettingsSection } from './about/renderer/AboutSettingsSection';
import { ArchiveSettingsSection } from './archive/renderer/ArchiveSettingsSection';
import { ProviderSettingsSection } from './providers/renderer/ProviderSettingsSection';
import { TokenUsageSettingsSection } from './token-usage/block.renderer';

type SettingsSection = 'providers' | 'archive' | 'token-usage' | 'about';

export interface SettingsPageProps {
  onBack: () => void;
  settingsSection?: SettingsSection;
  providerSectionProps: {
    providerTab: string;
    setProviderTab: (tab: string) => void;
    currentProviderSettings: any;
    isFixedProfileProvider: boolean;
    addProviderProfile: () => void;
    editingProfile: any;
    onSelectEditingProfile: (profileId: string) => void;
    onSelectProfileItem: (profileId: string) => void;
    renameProviderProfile: (profileId: string, name: string) => void;
    setDefaultProviderProfile: (profileId: string) => void;
    removeProviderProfile: (profileId: string) => void;
    currentProviderTestState: any;
    isEditingOAuthProfile: boolean;
    oauthProviderHint: (providerId: string) => string;
    oauthCommandHint: string;
    onStartOAuthLogin: (profileId: string) => Promise<void>;
    hasCurrentOauthDisplayUrl: boolean;
    currentOauthDisplayUrl: string;
    openOAuthLink: (url: string) => void;
    currentOauthCode: string;
    onOauthCodeChange: (value: string) => void;
    submitOAuthCode: (providerId: string, profileId: string, code: string) => Promise<void>;
    regularEnvVars: { pair: any; index: number }[];
    updateEnvVar: (index: number, key: string, value: string) => void;
    removeEnvVar: (index: number) => void;
    addEnvVar: () => void;
    onToggleProviderProfile: (profileId: string, nextEnabled: boolean) => Promise<void>;
    currentProxyTestState: any;
    proxyState: { enabled: boolean; url: string };
    setProxyConfig: (config: { enabled: boolean; url: string }) => void;
    onToggleProxyEnabled: (nextEnabled: boolean) => Promise<void>;
    settingsSavedAt: number;
    onSaveSettings: () => Promise<void>;
    settingsError: string;
  };
  archivedSessions: any[];
  archiveCleanupRunning?: boolean;
  archiveCleanupResult?: any;
  providerLabel: Record<string, string>;
  onRestoreArchivedSession: (archiveId: string) => Promise<void>;
  onCleanupExpiredArchivedSessions?: () => Promise<any>;
  appVersion: string;
  appLogo: string;
}

export function SettingsPage({
  onBack,
  settingsSection: initialSection,
  providerSectionProps,
  archivedSessions,
  archiveCleanupRunning,
  archiveCleanupResult,
  providerLabel,
  onRestoreArchivedSession,
  onCleanupExpiredArchivedSessions,
  appVersion,
  appLogo,
}: SettingsPageProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection || 'providers');

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-md"
          onClick={onBack}
          aria-label="返回主页"
          title="返回主页"
        >
          <ArrowLeft size={18} />
        </Button>
        <h1 className="text-[16px] font-semibold text-[var(--text-main)]">Settings</h1>
      </header>

      {/* Body: sidebar nav + content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar navigation */}
        <nav className="flex w-[180px] shrink-0 flex-col gap-1 border-r border-white/[0.08] bg-white/[0.04] p-2">
          {[
            { id: 'providers' as const, label: 'Providers' },
            { id: 'archive' as const, label: 'Archive' },
            { id: 'token-usage' as const, label: 'Token 统计' },
            { id: 'about' as const, label: 'About' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              className={`flex items-center gap-2 rounded-[4px] px-3 py-2 text-left text-[13px] transition-colors duration-150 ${
                section === item.id
                  ? 'bg-white/[0.1] font-semibold text-[#EDEDEF]'
                  : 'font-normal text-[#8A8A90] hover:bg-white/[0.06] hover:text-[#EDEDEF]'
              }`}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Right content area */}
        <div className="flex-1 overflow-y-auto p-6">
          {section === 'providers' && <ProviderSettingsSection {...providerSectionProps} />}
          {section === 'archive' && (
            <ArchiveSettingsSection
              archivedSessions={archivedSessions}
              archiveCleanupRunning={archiveCleanupRunning}
              archiveCleanupResult={archiveCleanupResult}
              providerLabel={providerLabel}
              onRestoreArchivedSession={onRestoreArchivedSession}
              onCleanupExpiredArchivedSessions={onCleanupExpiredArchivedSessions}
            />
          )}
          {section === 'token-usage' && <TokenUsageSettingsSection />}
          {section === 'about' && (
            <AboutSettingsSection appVersion={appVersion} appLogo={appLogo} />
          )}
        </div>
      </div>
    </div>
  );
}
