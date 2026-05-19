const { createArchiveApi } = require('./preload/archive.api');

function createArchivePreloadApi() {
  return createArchiveApi();
}

module.exports = { createArchivePreloadApi };
