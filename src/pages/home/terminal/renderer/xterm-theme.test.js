const assert = require('node:assert/strict');
const test = require('node:test');

async function loadModule() {
  return import('./xterm-theme.ts');
}

const darkPalette = {
  background: '#0b0d10',
  foreground: '#d9e1ee',
  cursor: '#e8eefc',
  selectionBackground: 'rgba(120, 145, 190, 0.35)',
  black: '#0b0d10',
  red: '#ff6b6b',
  green: '#39d98a',
  yellow: '#f5c86a',
  blue: '#6aa9ff',
  magenta: '#c792ea',
  cyan: '#66d9ef',
  white: '#d9e1ee',
  brightBlack: '#5e6a7f',
  brightRed: '#ff8a8a',
  brightGreen: '#5ae7a1',
  brightYellow: '#ffd98a',
  brightBlue: '#8cc0ff',
  brightMagenta: '#ddb0ff',
  brightCyan: '#8ae8ff',
  brightWhite: '#f3f6fc',
};

const ansiKeys = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
];

test('getXtermTheme returns the existing dark terminal palette unchanged', async () => {
  const { getXtermTheme } = await loadModule();
  assert.deepEqual(getXtermTheme('dark'), darkPalette);
});

test('getXtermTheme returns a complete light palette with light background and dark foreground', async () => {
  const { getXtermTheme } = await loadModule();
  const theme = getXtermTheme('light');

  assert.equal(theme.background, '#f8fafc');
  assert.equal(theme.foreground, '#1f2937');
  for (const key of ansiKeys) {
    assert.equal(typeof theme[key], 'string', `${key} should be defined`);
    assert.notEqual(theme[key], '', `${key} should not be empty`);
  }
});
