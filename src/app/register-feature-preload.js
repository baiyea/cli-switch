const { createTerminalPreloadApi } = require("../features/terminal/feature.preload");
const { createSidebarPreloadApi } = require("../features/sidebar/feature.preload");
const { createFileTreePreloadApi } = require("../features/file-tree/feature.preload");
const { createProvidersPreloadApi } = require("../features/providers/feature.preload");
const { createArchivePreloadApi } = require("../features/archive/feature.preload");

function createFeatureApis() {
  return {
    ...createTerminalPreloadApi(),
    ...createSidebarPreloadApi(),
    ...createFileTreePreloadApi(),
    ...createProvidersPreloadApi(),
    ...createArchivePreloadApi(),
  };
}

module.exports = { createFeatureApis };
