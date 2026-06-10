const { contextBridge } = require('electron');
const { createPageApis } = require('./register-page-preload');

function resolveIsPackaged() {
  const arg = process.argv.find((item) => item.startsWith('--cli-switch-is-packaged='));
  if (arg) return arg.slice('--cli-switch-is-packaged='.length) !== '0';
  if (process.env.CLI_SWITCH_IS_PACKAGED === '1') return true;
  if (process.env.CLI_SWITCH_IS_PACKAGED === '0') return false;
  if (process.defaultApp === true) return false;
  return true;
}

contextBridge.exposeInMainWorld('electronAPI', createPageApis({ isPackaged: resolveIsPackaged() }));
