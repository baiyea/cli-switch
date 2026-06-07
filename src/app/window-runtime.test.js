const test = require('node:test');
const assert = require('node:assert/strict');

const { getDefaultWindowBounds } = require('./window-runtime');

test('Windows main window starts with a compact default size', () => {
  assert.deepEqual(getDefaultWindowBounds('win32'), {
    width: 1180,
    height: 760,
    minWidth: 1000,
    minHeight: 680,
  });
});

test('non-Windows main window keeps the existing default size', () => {
  assert.deepEqual(getDefaultWindowBounds('darwin'), {
    width: 1360,
    height: 860,
    minWidth: 1000,
    minHeight: 680,
  });
  assert.deepEqual(getDefaultWindowBounds('linux'), {
    width: 1360,
    height: 860,
    minWidth: 1000,
    minHeight: 680,
  });
});
