const { createAppearanceApi } = require('./preload/appearance.api');

function createAppearancePreloadApi() {
  return createAppearanceApi();
}

module.exports = { createAppearancePreloadApi };
