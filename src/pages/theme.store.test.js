const assert = require('node:assert/strict');
const test = require('node:test');

const { normalizeThemeMode, resolveEffectiveTheme } = require('./theme-runtime');

test('normalizeThemeMode keeps supported theme modes', () => {
  assert.equal(normalizeThemeMode('system'), 'system');
  assert.equal(normalizeThemeMode('dark'), 'dark');
  assert.equal(normalizeThemeMode('light'), 'light');
});

test('normalizeThemeMode falls back to system for unsupported input', () => {
  assert.equal(normalizeThemeMode('sepia'), 'system');
  assert.equal(normalizeThemeMode(''), 'system');
  assert.equal(normalizeThemeMode(null), 'system');
  assert.equal(normalizeThemeMode(undefined), 'system');
});

test('resolveEffectiveTheme resolves explicit dark and light modes directly', () => {
  assert.equal(resolveEffectiveTheme('dark', false), 'dark');
  assert.equal(resolveEffectiveTheme('dark', true), 'dark');
  assert.equal(resolveEffectiveTheme('light', false), 'light');
  assert.equal(resolveEffectiveTheme('light', true), 'light');
});

test('resolveEffectiveTheme resolves system mode from system preference', () => {
  assert.equal(resolveEffectiveTheme('system', true), 'dark');
  assert.equal(resolveEffectiveTheme('system', false), 'light');
});

test('resolveEffectiveTheme normalizes unsupported mode before resolving', () => {
  assert.equal(resolveEffectiveTheme('sepia', true), 'dark');
  assert.equal(resolveEffectiveTheme('sepia', false), 'light');
});
