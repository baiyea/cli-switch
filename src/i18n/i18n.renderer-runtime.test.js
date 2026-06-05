const test = require('node:test');
const assert = require('node:assert/strict');

test('ESM runtime exports createMessageRegistry with findMissingKeys', async () => {
  const { createMessageRegistry } = await import('./i18n.renderer-runtime.js');

  const registry = createMessageRegistry();
  assert.equal(typeof registry.findMissingKeys, 'function');
  assert.equal(typeof registry.registerMessages, 'function');
  assert.equal(typeof registry.t, 'function');
  assert.equal(typeof registry.clear, 'function');
});

test('ESM runtime findMissingKeys reports keys missing from a locale', async () => {
  const { createMessageRegistry } = await import('./i18n.renderer-runtime.js');

  const registry = createMessageRegistry();
  registry.registerMessages('test', {
    'zh-CN': { 'a': '甲', 'b': '乙' },
    'en-US': { 'a': 'A' },
  });

  const missing = registry.findMissingKeys('en-US', 'zh-CN');
  assert.deepEqual(missing, ['b']);
});

test('ESM runtime findMissingKeys returns empty array when locales match', async () => {
  const { createMessageRegistry } = await import('./i18n.renderer-runtime.js');

  const registry = createMessageRegistry();
  registry.registerMessages('test', {
    'zh-CN': { 'a': '甲', 'b': '乙' },
    'en-US': { 'a': 'A', 'b': 'B' },
  });

  const missing = registry.findMissingKeys('en-US', 'zh-CN');
  assert.deepEqual(missing, []);
});

test('ESM I18nService exposes expected API', async () => {
  const { i18nService } = await import('./i18n.renderer-runtime.js');

  assert.equal(typeof i18nService.getLocale, 'function');
  assert.equal(typeof i18nService.setLocale, 'function');
  assert.equal(typeof i18nService.t, 'function');
  assert.equal(typeof i18nService.registerMessages, 'function');
  assert.equal(typeof i18nService.subscribe, 'function');
});

test('ESM I18nService setLocale notifies subscribers', async () => {
  const { i18nService } = await import('./i18n.renderer-runtime.js');

  const calls = [];
  const unsub = i18nService.subscribe((locale) => {
    calls.push(locale);
  });

  i18nService.setLocale('en-US');
  i18nService.setLocale('zh-CN');

  assert.deepEqual(calls, ['en-US', 'zh-CN']);
  unsub();

  i18nService.setLocale('en-US');
  assert.deepEqual(calls, ['en-US', 'zh-CN']);
});

test('ESM I18nService does not notify when same locale is set', async () => {
  const { i18nService } = await import('./i18n.renderer-runtime.js');

  i18nService.setLocale('en-US');

  const calls = [];
  i18nService.subscribe((locale) => calls.push(locale));

  i18nService.setLocale('en-US');
  assert.deepEqual(calls, []);
});

test('ESM I18nService t resolves through locale fallback', async () => {
  const { i18nService } = await import('./i18n.renderer-runtime.js');

  i18nService.registerMessages('test', {
    'zh-CN': { 'test.key': '中文值' },
    'en-US': {},
  });

  i18nService.setLocale('en-US');
  assert.equal(i18nService.t('test.key'), '中文值');
});

test('ESM I18nService registerMessages notifies subscribers', async () => {
  const { i18nService } = await import('./i18n.renderer-runtime.js');

  const calls = [];
  i18nService.subscribe(() => calls.push(1));

  i18nService.registerMessages('test', {
    'zh-CN': { 'x': 'X' },
    'en-US': { 'x': 'X' },
  });

  assert.ok(calls.length >= 1);
});
