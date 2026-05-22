const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('ExplorerPane does not mount a React DnD backed tree', () => {
  const source = fs.readFileSync(path.join(__dirname, 'ExplorerPane.jsx'), 'utf8');

  assert.doesNotMatch(source, /react-arborist/);
  assert.doesNotMatch(source, /DndProvider|HTML5Backend/);
});
