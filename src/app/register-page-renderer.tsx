import { fileTreeRenderer } from '../pages/home/file-tree/block.renderer';
import { sidebarRenderer } from '../pages/home/sidebar/block.renderer';
import { terminalRenderer } from '../pages/home/terminal/block.renderer';
import { topToolbarRenderer } from '../pages/home/top-toolbar/block.renderer';
import { aboutRenderer } from '../pages/settings/about/block.renderer';
import { archiveRenderer } from '../pages/settings/archive/block.renderer';
import { providersRenderer } from '../pages/settings/providers/block.renderer';
import { tokenUsageRenderer } from '../pages/settings/token-usage/block.renderer';

export const pageRenderers = {
  terminal: terminalRenderer,
  sidebar: sidebarRenderer,
  fileTree: fileTreeRenderer,
  topToolbar: topToolbarRenderer,
  providers: providersRenderer,
  archive: archiveRenderer,
  about: aboutRenderer,
  tokenUsage: tokenUsageRenderer,
};
