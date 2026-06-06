const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const installerScript = fs.readFileSync(path.join(__dirname, 'installer.nsh'), 'utf8');

test('installer overrides electron-builder app-running check with Cli-Switch close script', () => {
  assert.match(installerScript, /!macro\s+customCheckAppRunning\b/);
  assert.match(
    installerScript,
    /!macro\s+customCheckAppRunning\b[\s\S]*?!insertmacro\s+closeCliSwitchProcesses[\s\S]*?!macroend/,
  );
  // Must NOT call _CHECK_APP_RUNNING — its dependencies (getProcessInfo.nsh, Var pid)
  // are guarded by !ifmacrondef customCheckAppRunning and unavailable here.
  assert.doesNotMatch(installerScript, /!insertmacro\s+_CHECK_APP_RUNNING/);
});
