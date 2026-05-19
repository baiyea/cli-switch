const { createProvidersApi } = require('./preload/providers.api');

function createProvidersPreloadApi() {
  return createProvidersApi();
}

module.exports = { createProvidersPreloadApi };
