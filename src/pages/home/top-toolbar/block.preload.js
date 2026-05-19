const { createTopToolbarApi } = require('./preload/top-toolbar.api');

function createTopToolbarPreloadApi() {
  return createTopToolbarApi();
}

module.exports = { createTopToolbarPreloadApi };
