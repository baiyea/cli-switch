const { registerTerminalMain } = require("../features/terminal/feature.main");
const { registerSidebarMain } = require("../features/sidebar/feature.main");
const { registerFileTreeMain } = require("../features/file-tree/feature.main");
const { registerProvidersMain } = require("../features/providers/feature.main");
const { registerArchiveMain } = require("../features/archive/feature.main");

function registerFeatureMain() {
  registerTerminalMain();
  registerSidebarMain();
  registerFileTreeMain();
  registerProvidersMain();
  registerArchiveMain();
}

module.exports = { registerFeatureMain };
