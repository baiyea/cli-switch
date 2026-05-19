const { createSidebarApi } = require('./preload/sidebar.api');

function createSidebarPreloadApi() {
  return createSidebarApi();
}

module.exports = { createSidebarPreloadApi };
