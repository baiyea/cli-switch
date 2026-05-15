import React from "react";
import { TabsList, TabsTrigger } from "../ui/tabs";

function CpuIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

function ArchiveIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="5" rx="1" />
      <path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" />
      <path d="M10 13h4" />
    </svg>
  );
}

function SunMoonIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function InfoIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

export function SettingsSideNav() {
  return (
    <TabsList className="settings-side-nav h-full w-full flex-col items-stretch justify-start gap-1 bg-white/[0.02] p-2 rounded-lg">
      <TabsTrigger value="providers" className="w-full justify-start gap-2 text-sm font-medium data-[state=active]:text-[var(--text-main)] text-[var(--text-muted)] rounded-lg h-9 px-3 bg-transparent data-[state=active]:bg-white/[0.05]">
        <CpuIcon />
        Providers
      </TabsTrigger>
      <TabsTrigger value="archive" className="w-full justify-start gap-2 text-sm font-normal data-[state=active]:text-[var(--text-main)] text-[var(--text-muted)] rounded-lg h-9 px-3 bg-transparent data-[state=active]:bg-white/[0.05]">
        <ArchiveIcon />
        Archive
      </TabsTrigger>
      <TabsTrigger value="appearance" className="w-full justify-start gap-2 text-sm font-normal data-[state=active]:text-[var(--text-main)] text-[var(--text-muted)] rounded-lg h-9 px-3 bg-transparent data-[state=active]:bg-white/[0.05]">
        <SunMoonIcon />
        Appearance
      </TabsTrigger>
      <TabsTrigger value="about" className="w-full justify-start gap-[10px] text-sm font-normal data-[state=active]:text-[var(--text-main)] text-[var(--text-muted)] rounded-lg h-9 px-3 bg-transparent data-[state=active]:bg-white/[0.05]">
        <InfoIcon />
        About
      </TabsTrigger>
    </TabsList>
  );
}
