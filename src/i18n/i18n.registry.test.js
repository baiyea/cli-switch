const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createMessageRegistry,
  interpolateMessage,
  normalizeLocale,
} = require('./i18n.registry');

test('normalizeLocale accepts supported locales and falls back to zh-CN', () => {
  assert.equal(normalizeLocale('zh-CN'), 'zh-CN');
  assert.equal(normalizeLocale('en-US'), 'en-US');
  assert.equal(normalizeLocale('en'), 'zh-CN');
  assert.equal(normalizeLocale(''), 'zh-CN');
});

test('registry resolves locale messages with zh-CN fallback and key fallback', () => {
  const registry = createMessageRegistry();
  registry.registerMessages('common', {
    'zh-CN': { 'common.save': '保存', 'common.cancel': '取消' },
    'en-US': { 'common.save': 'Save' },
  });

  assert.equal(registry.t('en-US', 'common.save'), 'Save');
  assert.equal(registry.t('en-US', 'common.cancel'), '取消');
  assert.equal(registry.t('en-US', 'common.missing'), 'common.missing');
});

test('interpolateMessage replaces named tokens and emptyish values', () => {
  assert.equal(
    interpolateMessage('已清理 {count} 条记录，跳过 {skipped} 条，备注 {note}', {
      count: 3,
      skipped: 1,
      note: null,
    }),
    '已清理 3 条记录，跳过 1 条，备注 ',
  );
  assert.equal(interpolateMessage('未知 {missing}', { missing: undefined }), '未知 ');
});

test('registry reports locale key mismatches', () => {
  const registry = createMessageRegistry();
  registry.registerMessages('common', {
    'zh-CN': { 'common.save': '保存', 'common.cancel': '取消' },
    'en-US': { 'common.save': 'Save' },
  });

  assert.deepEqual(registry.findMissingKeys('en-US', 'zh-CN'), ['common.cancel']);
});
