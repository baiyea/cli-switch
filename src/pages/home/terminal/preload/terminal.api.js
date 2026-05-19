const { ipcRenderer } = require('electron');
const { TERMINAL_CHANNELS } = require('../shared/terminal.channels');

function createTerminalApi() {
  const pty = {
    create: (payload) => ipcRenderer.invoke(TERMINAL_CHANNELS.START, payload),
    snapshot: (payload) => ipcRenderer.invoke(TERMINAL_CHANNELS.SNAPSHOT, payload),
    input: (payload) => ipcRenderer.send(TERMINAL_CHANNELS.WRITE, payload),
    resize: (payload) => ipcRenderer.send(TERMINAL_CHANNELS.RESIZE, payload),
    destroy: (payload) => ipcRenderer.send(TERMINAL_CHANNELS.KILL, payload),
    onData: (listener) => {
      const wrapped = (_event, payload) => listener(payload);
      ipcRenderer.on(TERMINAL_CHANNELS.DATA, wrapped);
      return () => ipcRenderer.removeListener(TERMINAL_CHANNELS.DATA, wrapped);
    },
    onExit: (listener) => {
      const wrapped = (_event, payload) => listener(payload);
      ipcRenderer.on(TERMINAL_CHANNELS.EXIT, wrapped);
      return () => ipcRenderer.removeListener(TERMINAL_CHANNELS.EXIT, wrapped);
    },
  };
  return {
    pty,
    terminal: {
      start: pty.create,
      snapshot: pty.snapshot,
      write: pty.input,
      resize: pty.resize,
      kill: pty.destroy,
      onData: pty.onData,
      onExit: pty.onExit,
    },
  };
}

module.exports = { createTerminalApi };
