const test = require('node:test');
const assert = require('node:assert/strict');
const z = require('zod');

const { registerArchiveMain } = require('./block.main');
const { ARCHIVE_CHANNELS } = require('./shared/archive.channels');

test('registers cleanup expired archive IPC handler', async () => {
  const handlers = {};
  registerArchiveMain({
    registerIpc: (channel, handler) => {
      handlers[channel] = handler;
      return true;
    },
    z,
    ptyService: { destroy() {} },
    sessionStore: {
      listAllArchived() {
        return [];
      },
      archiveByProviderSessionId() {},
      restoreByProviderSessionId() {},
      listExpiredArchivedSessions() {
        return [];
      },
      deleteArchivedSessionById() {
        return { changes: 0 };
      },
    },
    normalizeProviderId: (value) => value,
    normalizeArchivePayload: (value) => value,
    parseArchiveId: (value) => ({ provider: 'claude', providerSessionId: value }),
    toArchivedView: (value) => value,
  });

  assert.equal(typeof handlers[ARCHIVE_CHANNELS.SESSION_ARCHIVE_CLEANUP_EXPIRED], 'function');
  const result = await handlers[ARCHIVE_CHANNELS.SESSION_ARCHIVE_CLEANUP_EXPIRED]();
  assert.equal(result.ok, true);
});
