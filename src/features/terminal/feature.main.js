const { registerTerminalIpc } = require("./main/terminal.ipc");

function registerTerminalMain() {
  registerTerminalIpc();
}

module.exports = { registerTerminalMain };
