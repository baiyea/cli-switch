'use strict';

const { createImChannelApi } = require('./preload/im-channel.api');

function createImChannelPreloadApi(options = {}) {
  return createImChannelApi(options);
}

module.exports = { createImChannelPreloadApi };
