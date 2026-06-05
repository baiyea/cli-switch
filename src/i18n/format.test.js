const test = require('node:test');
const assert = require('node:assert/strict');

const { formatDateLabel, formatDateTime, formatNumber, formatTokenCount } = require('./format');

test('formatNumber uses locale-aware grouping', () => {
  assert.equal(formatNumber(1234567, 'en-US'), '1,234,567');
  assert.equal(formatNumber(1234567, 'zh-CN'), '1,234,567');
});

test('formatTokenCount formats values in millions', () => {
  assert.equal(formatTokenCount(2500000, 'en-US'), '2.50M');
  assert.equal(formatTokenCount(undefined, 'zh-CN'), '0.00M');
});

test('formatDate helpers handle valid and invalid dates', () => {
  assert.equal(formatDateLabel('2026-06-05T08:09:00.000Z', 'en-US'), '06/05');
  assert.equal(formatDateLabel('', 'zh-CN'), '--');
  assert.match(formatDateTime('2026-06-05T08:09:00.000Z', 'zh-CN'), /\d{2}\/\d{2}/);
  assert.equal(formatDateTime('', 'zh-CN'), '尚未同步');
  assert.equal(formatDateTime('', 'en-US'), 'Not synced yet');
});
