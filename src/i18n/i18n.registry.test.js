const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const enUSGlobalMessages = require('./locales/en-US.json');
const zhCNGlobalMessages = require('./locales/zh-CN.json');

const {
  createMessageRegistry,
  interpolateMessage,
  normalizeLocale,
} = require('./i18n.registry');
const { I18nService } = require('./i18n.service');

test('global zh-CN and en-US locale files contain the same keys', () => {
  assert.deepEqual(
    Object.keys(enUSGlobalMessages).sort(),
    Object.keys(zhCNGlobalMessages).sort(),
  );
});

test('settings block zh-CN and en-US locale files contain the same keys', () => {
  const blocks = ['about', 'appearance', 'archive', 'providers', 'token-usage'];

  for (const block of blocks) {
    const enUSMessages = require(path.join('..', 'pages', 'settings', block, 'locales', 'en-US.json'));
    const zhCNMessages = require(path.join('..', 'pages', 'settings', block, 'locales', 'zh-CN.json'));

    assert.deepEqual(
      Object.keys(enUSMessages).sort(),
      Object.keys(zhCNMessages).sort(),
      `${block} locale keys should match`,
    );
  }
});

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

test('same namespace can update same key', () => {
  const registry = createMessageRegistry();
  registry.registerMessages('settings', {
    'zh-CN': { 'settings.title': '设置' },
    'en-US': { 'settings.title': 'Settings' },
  });
  registry.registerMessages('settings', {
    'zh-CN': { 'settings.title': '偏好设置' },
    'en-US': { 'settings.title': 'Preferences' },
  });

  assert.equal(registry.t('zh-CN', 'settings.title'), '偏好设置');
  assert.equal(registry.t('en-US', 'settings.title'), 'Preferences');
});

test('different namespace duplicate key throws', () => {
  const registry = createMessageRegistry();
  registry.registerMessages('settings', {
    'zh-CN': { 'common.save': '保存' },
    'en-US': { 'common.save': 'Save' },
  });

  assert.throws(
    () =>
      registry.registerMessages('appearance', {
        'zh-CN': { 'common.save': '保存' },
      }),
    /Duplicate i18n key "common\.save" from namespace "appearance"; already registered by "settings"/,
  );
});

test('empty namespace and global namespace are the same owner', () => {
  const registry = createMessageRegistry();
  registry.registerMessages('', {
    'zh-CN': { 'common.save': '保存' },
  });
  registry.registerMessages('global', {
    'en-US': { 'common.save': 'Save' },
  });

  assert.equal(registry.t('zh-CN', 'common.save'), '保存');
  assert.equal(registry.t('en-US', 'common.save'), 'Save');
});

test('other namespace cannot reuse key first registered by empty namespace', () => {
  const registry = createMessageRegistry();
  registry.registerMessages('', {
    'zh-CN': { 'common.save': '保存' },
  });

  assert.throws(
    () =>
      registry.registerMessages('settings', {
        'zh-CN': { 'common.save': '保存' },
      }),
    /Duplicate i18n key "common\.save" from namespace "settings"; already registered by "global"/,
  );
});

test('different namespaces cannot register the same key in different locales', () => {
  const registry = createMessageRegistry();
  registry.registerMessages('settings', {
    'zh-CN': { 'settings.title': '设置' },
  });

  assert.throws(
    () =>
      registry.registerMessages('appearance', {
        'en-US': { 'settings.title': 'Settings' },
      }),
    /Duplicate i18n key "settings\.title" from namespace "appearance"; already registered by "settings"/,
  );
});

test('service does not notify when same locale is set', () => {
  const service = new I18nService(createMessageRegistry());
  let calls = 0;
  service.subscribe(() => {
    calls += 1;
  });

  service.setLocale('zh-CN');

  assert.equal(calls, 0);
});

test('unsubscribe 后不通知', () => {
  const service = new I18nService(createMessageRegistry());
  let calls = 0;
  const unsubscribe = service.subscribe(() => {
    calls += 1;
  });

  unsubscribe();
  service.setLocale('en-US');

  assert.equal(calls, 0);
});

test('listener added during notify is not called until next notify', () => {
  const service = new I18nService(createMessageRegistry());
  const calls = [];

  service.subscribe((locale) => {
    calls.push(`first:${locale}`);
    service.subscribe((nextLocale) => {
      calls.push(`second:${nextLocale}`);
    });
  });

  service.setLocale('en-US');
  assert.deepEqual(calls, ['first:en-US']);

  service.setLocale('zh-CN');
  assert.deepEqual(calls, ['first:en-US', 'first:zh-CN', 'second:zh-CN']);
});

test('listener throwing does not prevent later listeners', () => {
  const service = new I18nService(createMessageRegistry());
  const originalWarn = console.warn;
  const warnings = [];
  const calls = [];
  console.warn = (...args) => {
    warnings.push(args);
  };

  try {
    service.subscribe(() => {
      throw new Error('boom');
    });
    service.subscribe((locale) => {
      calls.push(locale);
    });

    service.setLocale('en-US');
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(calls, ['en-US']);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][0], '[i18n] listener failed');
  assert.match(warnings[0][1].message, /boom/);
});

test('registerMessages notifies subscribers', () => {
  const service = new I18nService(createMessageRegistry());
  const calls = [];
  service.subscribe((locale) => {
    calls.push(locale);
  });

  service.registerMessages('global', {
    'zh-CN': { 'common.save': '保存' },
  });

  assert.deepEqual(calls, ['zh-CN']);
});
