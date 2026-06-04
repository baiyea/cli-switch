const { createTokenUsageApi } = require('./preload/token-usage.api');

function createTokenUsagePreloadApi() {
  return createTokenUsageApi();
}

module.exports = { createTokenUsagePreloadApi };
