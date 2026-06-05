const { registerAppearanceIpc } = require('./main/appearance.ipc');

function registerAppearanceMain(context = {}) {
  return registerAppearanceIpc(context);
}

module.exports = { registerAppearanceMain };
