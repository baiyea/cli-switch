const IPC = Object.freeze({
  PTY_CREATE: "pty:create",
  PTY_INPUT: "pty:input",
  PTY_RESIZE: "pty:resize",
  PTY_DESTROY: "pty:destroy",
  PTY_SNAPSHOT: "pty:snapshot",
  PTY_DATA: "pty:data",
  PTY_EXIT: "pty:exit",
  PROJECT_LIST: "project:list",
  PROJECT_ADD: "project:add",
  PROJECT_REMOVE: "project:remove",
  SESSION_LIST: "session:list",
  SESSION_CREATE: "session:create",
  SESSION_START: "session:start",
  SESSION_RENAME: "session:rename",
  SESSION_SYNC_PROJECT: "session:sync:project",
  SESSION_ARCHIVE: "session:archive",
  SESSION_ARCHIVE_LIST: "session:archive:list",
  SESSION_RESTORE: "session:restore",
  FILE_TREE_READ: "file:tree:read",
  FILE_OPEN_PATH: "file:open:path",
  APP_LOG: "app:log",
  SETTINGS_CLAUDE_GET: "settings:claude:get",
  SETTINGS_CLAUDE_SAVE: "settings:claude:save",
  SETTINGS_PROVIDER_TEST: "settings:provider:test",
  SKILLGEN_RUN: "skillgen:run"
});

module.exports = { IPC };
