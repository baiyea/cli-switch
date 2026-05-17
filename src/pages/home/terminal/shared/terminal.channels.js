const TERMINAL_CHANNELS = {
  START: "pty:create",
  WRITE: "pty:input",
  RESIZE: "pty:resize",
  KILL: "pty:destroy",
  SNAPSHOT: "pty:snapshot",
  DATA: "pty:data",
  EXIT: "pty:exit",
  SESSION_CREATE: "session:create",
  SESSION_START: "session:start",
  SESSION_RENAME: "session:rename",
  SESSION_SUGGEST_TITLE: "session:suggest:title",
  SESSION_STATS: "session:stats",
};

module.exports = { TERMINAL_CHANNELS };
