const test = require("node:test");
const assert = require("node:assert/strict");

const { getLaunchCommandForProvider } = require("./cli-launchers");

test("claude launch command sets ELECTRON_RUN_AS_NODE to avoid dock Electron app", () => {
  const command = getLaunchCommandForProvider("claude");
  assert.equal(typeof command, "string");
  assert.notEqual(command.trim(), "");
  assert.match(command, /ELECTRON_RUN_AS_NODE=['\"]?1['\"]?/i);
});
