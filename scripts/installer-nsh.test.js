const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const installerScript = fs.readFileSync(path.join(__dirname, 'installer.nsh'), 'utf8');
const closeScript = fs.readFileSync(path.join(__dirname, 'close-cli-switch-processes.ps1'), 'utf8');

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

test('installer close script closes windows then force-kills process trees and waits', () => {
  assert.match(closeScript, /CloseMainWindow\(\)/);
  assert.match(closeScript, /taskkill\.exe\s+\/PID\s+\$proc\.ProcessId\s+\/T\s+\/F/);
  assert.match(closeScript, /\$deadline\s*=\s*\(Get-Date\)\.AddSeconds\(8\)/);
  assert.match(closeScript, /all Cli-Switch processes closed/);
});

test('installer renames previous install directory to a unique old path before extraction', () => {
  assert.match(installerScript, /CreateDirectory "\$APPDATA\\Cli-Switch"/);
  assert.match(installerScript, /install-timing\.log/);
  assert.match(installerScript, /!insertmacro\s+writeCliSwitchInstallLog\s+"old-install-cleanup-start"/);
  assert.match(installerScript, /StrCpy \$3 "\$INSTDIR\.old\.\$4"/);
  assert.match(installerScript, /Rename "\$INSTDIR" "\$3"/);
  assert.match(installerScript, /cmd \/c start "" \/b cmd \/c rd \/s \/q "\$3"/);
  assert.match(installerScript, /!insertmacro\s+writeCliSwitchInstallLog\s+"old-install-cleanup-complete"/);
});
