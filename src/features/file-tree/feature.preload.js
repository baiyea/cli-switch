const { createFileTreeApi } = require("./preload/file-tree.api");

function createFileTreePreloadApi() {
  return createFileTreeApi();
}

module.exports = { createFileTreePreloadApi };
