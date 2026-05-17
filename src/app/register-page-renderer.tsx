import { terminalRenderer } from "../pages/home/terminal/block.renderer";
import { sidebarRenderer } from "../pages/home/sidebar/block.renderer";
import { fileTreeRenderer } from "../pages/home/file-tree/block.renderer";
import { topToolbarRenderer } from "../pages/home/top-toolbar/block.renderer";
import { providersRenderer } from "../pages/settings/providers/block.renderer";
import { archiveRenderer } from "../pages/settings/archive/block.renderer";
import { aboutRenderer } from "../pages/settings/about/block.renderer";

export const pageRenderers = {
  terminal: terminalRenderer,
  sidebar: sidebarRenderer,
  fileTree: fileTreeRenderer,
  topToolbar: topToolbarRenderer,
  providers: providersRenderer,
  archive: archiveRenderer,
  about: aboutRenderer,
};
