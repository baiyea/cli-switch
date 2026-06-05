import { useT } from '../../i18n/use-t';
import { TabsList, TabsTrigger } from '../../ui/tabs';

const SETTINGS_NAV_TRIGGER_CLASS =
  'h-8 w-full justify-start gap-2 rounded-[4px] bg-transparent px-2.5 text-[13px] font-normal transition-colors duration-150 data-[state=active]:bg-transparent data-[state=active]:font-semibold';

function CpuIcon({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M15 2v2" />
      <path d="M15 20v2" />
      <path d="M2 15h2" />
      <path d="M2 9h2" />
      <path d="M20 15h2" />
      <path d="M20 9h2" />
      <path d="M9 2v2" />
      <path d="M9 20v2" />
    </svg>
  );
}

function ArchiveIcon({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="4" width="20" height="5" rx="1" />
      <path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" />
      <path d="M10 13h4" />
    </svg>
  );
}

function ChartIcon({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 3v18h18" />
      <rect x="7" y="12" width="3" height="5" rx="1" />
      <rect x="12" y="8" width="3" height="9" rx="1" />
      <rect x="17" y="5" width="3" height="12" rx="1" />
    </svg>
  );
}

function AppearanceIcon({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.93 4.93l1.41 1.41" />
      <path d="M17.66 17.66l1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M4.93 19.07l1.41-1.41" />
      <path d="M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function InfoIcon({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

export function SettingsSideNav() {
  const t = useT();

  return (
    <TabsList className="settings-side-nav h-full w-full flex-col items-stretch justify-start gap-1 rounded-none border-r p-1.5">
      <TabsTrigger value="providers" className={SETTINGS_NAV_TRIGGER_CLASS}>
        <CpuIcon />
        {t('settings.sideNav.providers')}
      </TabsTrigger>
      <TabsTrigger value="archive" className={SETTINGS_NAV_TRIGGER_CLASS}>
        <ArchiveIcon />
        {t('settings.sideNav.archive')}
      </TabsTrigger>
      <TabsTrigger value="token-usage" className={SETTINGS_NAV_TRIGGER_CLASS}>
        <ChartIcon />
        {t('settings.sideNav.tokenUsage')}
      </TabsTrigger>
      <TabsTrigger value="appearance" className={SETTINGS_NAV_TRIGGER_CLASS}>
        <AppearanceIcon />
        {t('settings.sideNav.appearance')}
      </TabsTrigger>
      <TabsTrigger value="about" className={SETTINGS_NAV_TRIGGER_CLASS}>
        <InfoIcon />
        {t('settings.sideNav.about')}
      </TabsTrigger>
    </TabsList>
  );
}
