export enum IPC {
  PTY_CREATE = "pty:create",
  PTY_INPUT = "pty:input",
  PTY_RESIZE = "pty:resize",
  PTY_DESTROY = "pty:destroy",
  PTY_DATA = "pty:data",
  PTY_EXIT = "pty:exit",
  PROJECT_LIST = "project:list",
  PROJECT_ADD = "project:add",
  PROJECT_REMOVE = "project:remove",
  SESSION_LIST = "session:list",
  SESSION_CREATE = "session:create",
  SESSION_START = "session:start",
  SESSION_SYNC_PROJECT = "session:sync:project",
  SESSION_ARCHIVE = "session:archive",
  SESSION_ARCHIVE_LIST = "session:archive:list",
  SESSION_RESTORE = "session:restore",
  FILE_TREE_READ = "file:tree:read",
  FILE_OPEN_PATH = "file:open:path",
  APP_LOG = "app:log",
  SETTINGS_CLAUDE_GET = "settings:claude:get",
  SETTINGS_CLAUDE_SAVE = "settings:claude:save",
  SKILLGEN_RUN = "skillgen:run"
}

export type PtySessionStatus = "creating" | "running" | "exited";

export interface PtySessionMeta {
  sessionId: string;
  name: string;
  cwd: string;
  status: PtySessionStatus;
  createdAt: number;
  exitCode?: number;
}

export interface PtyCreateRequest {
  cwd: string;
  name?: string;
}

export interface PtyCreateResponse {
  sessionId: string;
  name: string;
}

export interface PtyInputRequest {
  sessionId: string;
  data: string;
}

export interface PtyResizeRequest {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface PtyDestroyRequest {
  sessionId: string;
}

export interface PtyDataEvent {
  sessionId: string;
  data: string;
}

export interface PtyExitEvent {
  sessionId: string;
  exitCode: number;
}

export interface IpcInvokeContract {
  [IPC.PTY_CREATE]: {
    request: PtyCreateRequest;
    response: PtyCreateResponse;
  };
}

export interface IpcSendContract {
  [IPC.PTY_INPUT]: PtyInputRequest;
  [IPC.PTY_RESIZE]: PtyResizeRequest;
  [IPC.PTY_DESTROY]: PtyDestroyRequest;
}

export interface IpcPushContract {
  [IPC.PTY_DATA]: PtyDataEvent;
  [IPC.PTY_EXIT]: PtyExitEvent;
}
