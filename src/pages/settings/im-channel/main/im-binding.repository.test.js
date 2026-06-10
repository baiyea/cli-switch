const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { createImBindingRepository, ensureImBindingTable } = require('./im-binding.repository');

function createDb() {
  const db = new DatabaseSync(':memory:');
  ensureImBindingTable(db);
  return db;
}

test('upserts one binding per platform and im user', () => {
  const db = createDb();
  const repo = createImBindingRepository({ db, now: () => '2026-06-09T00:00:00.000Z' });
  repo.setBinding({
    platform: 'feishu',
    imUserId: 'ou_1',
    sessionId: 'session-a',
    sessionDbId: 12,
  });
  repo.setBinding({
    platform: 'feishu',
    imUserId: 'ou_1',
    sessionId: 'session-b',
    sessionDbId: 18,
  });
  assert.deepEqual(repo.getBinding({ platform: 'feishu', imUserId: 'ou_1' }), {
    platform: 'feishu',
    imUserId: 'ou_1',
    sessionId: 'session-b',
    sessionDbId: 18,
    updatedAt: '2026-06-09T00:00:00.000Z',
  });
});

test('does not mix different users', () => {
  const db = createDb();
  const repo = createImBindingRepository({ db, now: () => '2026-06-09T00:00:00.000Z' });
  repo.setBinding({ platform: 'feishu', imUserId: 'ou_1', sessionId: 'a', sessionDbId: 1 });
  assert.equal(repo.getBinding({ platform: 'feishu', imUserId: 'ou_2' }), null);
});

test('keeps bindings separate for the same im user on different platforms', () => {
  const db = createDb();
  const repo = createImBindingRepository({ db, now: () => '2026-06-09T00:00:00.000Z' });
  repo.setBinding({ platform: 'feishu', imUserId: 'ou_1', sessionId: 'session-a', sessionDbId: 12 });
  repo.setBinding({ platform: 'lark', imUserId: 'ou_1', sessionId: 'session-b', sessionDbId: 18 });

  assert.deepEqual(repo.getBinding({ platform: 'feishu', imUserId: 'ou_1' }), {
    platform: 'feishu',
    imUserId: 'ou_1',
    sessionId: 'session-a',
    sessionDbId: 12,
    updatedAt: '2026-06-09T00:00:00.000Z',
  });
  assert.deepEqual(repo.getBinding({ platform: 'lark', imUserId: 'ou_1' }), {
    platform: 'lark',
    imUserId: 'ou_1',
    sessionId: 'session-b',
    sessionDbId: 18,
    updatedAt: '2026-06-09T00:00:00.000Z',
  });
});
