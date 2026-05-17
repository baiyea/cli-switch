import React from "react";
import { TabsList, TabsTrigger } from "../../../../ui/tabs";

function CpuIcon({ size = 14 }) {
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

function ArchiveIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="5" rx="1" />
      <path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" />
      <path d="M10 13h4" />
    </svg>
  );
}

function InfoIcon({ size = 14 }) {
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
    <TabsList className="settings-side-nav h-full w-full flex-col items-stretch justify-start gap-1 rounded-none border-r border-white/[0.08] bg-white/[0.08] p-1.5">
      <TabsTrigger value="providers" className="h-8 w-full justify-start gap-2 rounded-[4px] bg-transparent px-2.5 text-[13px] font-normal text-[#8A8A90] transition-colors duration-150 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-[#EDEDEF]">
        <CpuIcon />
        Providers
      </TabsTrigger>
      <TabsTrigger value="archive" className="h-8 w-full justify-start gap-2 rounded-[4px] bg-transparent px-2.5 text-[13px] font-normal text-[#8A8A90] transition-colors duration-150 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-[#EDEDEF]">
        <ArchiveIcon />
        Archive
      </TabsTrigger>
      <TabsTrigger value="about" className="h-8 w-full justify-start gap-2 rounded-[4px] bg-transparent px-2.5 text-[13px] font-normal text-[#8A8A90] transition-colors duration-150 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-[#EDEDEF]">
        <InfoIcon />
        About
      </TabsTrigger>
    </TabsList>
  );
}
