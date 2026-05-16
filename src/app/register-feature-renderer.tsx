import { terminalRenderer } from "../features/terminal/feature.renderer";
import { sidebarRenderer } from "../features/sidebar/feature.renderer";
import { fileTreeRenderer } from "../features/file-tree/feature.renderer";
import { providersRenderer } from "../features/providers/feature.renderer";
import { archiveRenderer } from "../features/archive/feature.renderer";
import { aboutRenderer } from "../features/about/feature.renderer";

export const featureRenderers = {
  terminal: terminalRenderer,
  sidebar: sidebarRenderer,
  fileTree: fileTreeRenderer,
  providers: providersRenderer,
  archive: archiveRenderer,
  about: aboutRenderer,
};
