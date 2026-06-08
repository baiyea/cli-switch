import { SidebarProjectsPanel } from './renderer/SidebarProjectsPanel';
import { useHomeWorkspace } from './renderer/use-home-workspace';
import { useSessionLauncher } from './renderer/use-session-launcher';

export { SidebarProjectsPanel, useHomeWorkspace, useSessionLauncher };

export const sidebarRenderer = {
  panels: {
    main: SidebarProjectsPanel,
  },
};
