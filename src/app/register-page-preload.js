const { createTerminalPreloadApi } = require('../pages/home/terminal/block.preload');
const { createSidebarPreloadApi } = require('../pages/home/sidebar/block.preload');
const { createFileTreePreloadApi } = require('../pages/home/file-tree/block.preload');
const { createTopToolbarPreloadApi } = require('../pages/home/top-toolbar/block.preload');
const { createProvidersPreloadApi } = require('../pages/settings/providers/block.preload');
const { createAppearancePreloadApi } = require('../pages/settings/appearance/block.preload');
const { createArchivePreloadApi } = require('../pages/settings/archive/block.preload');
const { createTokenUsagePreloadApi } = require('../pages/settings/token-usage/block.preload');
const { createImChannelPreloadApi } = require('../pages/settings/im-channel/block.preload');

function mergeApis(...parts) {
  const target = {};
  for (const part of parts) {
    for (const [key, value] of Object.entries(part || {})) {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        target[key] &&
        typeof target[key] === 'object' &&
        !Array.isArray(target[key])
      ) {
        target[key] = { ...target[key], ...value };
        continue;
      }
      target[key] = value;
    }
  }
  return target;
}

function createPageApis(options = {}) {
  return mergeApis(
    createTerminalPreloadApi(),
    createSidebarPreloadApi(),
    createFileTreePreloadApi(),
    createTopToolbarPreloadApi(),
    createProvidersPreloadApi(),
    createAppearancePreloadApi(),
    createArchivePreloadApi(),
    createTokenUsagePreloadApi(),
    createImChannelPreloadApi(options),
  );
}

module.exports = { createPageApis };
