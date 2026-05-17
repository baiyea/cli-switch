const { registerTerminalMain } = require("../pages/home/terminal/block.main");
const { registerSidebarMain } = require("../pages/home/sidebar/block.main");
const { registerFileTreeMain } = require("../pages/home/file-tree/block.main");
const { registerProvidersMain } = require("../pages/settings/providers/block.main");
const { registerArchiveMain } = require("../pages/settings/archive/block.main");
const { registerTopToolbarMain } = require("../pages/home/top-toolbar/block.main");

function registerPageMain(context = {}) {
  registerTerminalMain(context);
  registerSidebarMain(context);
  registerFileTreeMain(context);
  registerProvidersMain(context);
  registerArchiveMain(context);
  if (typeof registerTopToolbarMain === "function") registerTopToolbarMain(context);
}

module.exports = { registerPageMain };
