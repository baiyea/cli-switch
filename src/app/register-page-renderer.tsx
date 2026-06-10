import { registerGlobalI18n } from '../i18n/renderer';
import { fileTreeRenderer } from '../pages/home/file-tree/block.renderer';
import { sidebarRenderer } from '../pages/home/sidebar/block.renderer';
import { terminalRenderer } from '../pages/home/terminal/block.renderer';
import { topToolbarRenderer } from '../pages/home/top-toolbar/block.renderer';
import { registerSettingsI18n } from '../pages/settings/settings.i18n';
import { aboutRenderer } from '../pages/settings/about/block.renderer';
import { appearanceRenderer } from '../pages/settings/appearance/block.renderer';
import { archiveRenderer } from '../pages/settings/archive/block.renderer';
import { imChannelRenderer } from '../pages/settings/im-channel/block.renderer';
import { providersRenderer } from '../pages/settings/providers/block.renderer';
import { tokenUsageRenderer } from '../pages/settings/token-usage/block.renderer';

registerGlobalI18n();
registerSettingsI18n();

export const pageRenderers = {
  terminal: terminalRenderer,
  sidebar: sidebarRenderer,
  fileTree: fileTreeRenderer,
  topToolbar: topToolbarRenderer,
  providers: providersRenderer,
  appearance: appearanceRenderer,
  archive: archiveRenderer,
  about: aboutRenderer,
  tokenUsage: tokenUsageRenderer,
  imChannel: imChannelRenderer,
};
