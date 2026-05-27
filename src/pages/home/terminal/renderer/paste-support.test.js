const test = require('node:test');
const assert = require('node:assert/strict');

async function loadModule() {
  return import('./paste-support.mjs');
}

test('supportsImagePasteForProvider allows Claude image paste on macOS', async () => {
  const { supportsImagePasteForProvider } = await loadModule();
  assert.equal(supportsImagePasteForProvider('claude', 'MacIntel'), true);
});

test('supportsImagePasteForProvider allows all built-in providers', async () => {
  const { supportsImagePasteForProvider } = await loadModule();
  for (const provider of ['claude', 'codex', 'gemini']) {
    assert.equal(supportsImagePasteForProvider(provider, 'MacIntel'), true);
    assert.equal(supportsImagePasteForProvider(provider, 'Win32'), true);
  }
});
