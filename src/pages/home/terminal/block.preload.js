const { createTerminalApi } = require('./preload/terminal.api');

function createTerminalPreloadApi() {
  return createTerminalApi();
}

module.exports = { createTerminalPreloadApi };
