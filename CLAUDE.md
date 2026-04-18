# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `pnpm dev` — Start development. Launches Vite dev server (port 5073) and Electron concurrently.
- `pnpm dev:renderer` — Start Vite dev server only.
- `pnpm dev:electron` — Start Electron only (waits for port 5073).
- `pnpm build` — Build renderer for production (`dist/renderer`).
- `pnpm start` — Run Electron in production mode (loads from `dist/renderer`).
- `pnpm test` — Run unit tests with `node:test` (`src/**/*.test.js`).
- `pnpm test:e2e` — Build then run Playwright E2E tests (`e2e/**/*.e2e.spec.js`).

## Architecture

### Electron Process Model

Three layers separated by IPC:

- **Main** (`src/main/index.js`) — Window lifecycle, IPC handlers, SQLite DB, PTY orchestration. All business logic lives here.
- **Preload** (`src/preload/index.js`) — `contextBridge` exposes a whitelisted `window.api` to the renderer. No Node APIs reach the renderer directly.
- **Renderer** (`src/renderer/`) — React 18 + Vite. Single-page UI with a left sidebar (projects, sessions) and right panel (xterm.js terminal or settings form).

### Session & PTY Lifecycle

`SessionManager` (`src/main/session/session-manager.js`) is the central coordinator:

- Owns a `Map<sessionId, { adapter, runtime }>` for active PTY processes.
- Delegates start/resume/stop/input to **provider adapters**.
- Buffers output per session (max 200KB) and forwards it to the renderer via IPC.
- Shell resolution: `zsh -l` on macOS/Linux, `powershell.exe -NoLogo` on Windows.

`ClaudeAdapter` (`src/main/providers/claude.adapter.js`) is the only active provider. It spawns `claude` (or `ZEELIN_CLAUDE_START_CMD`) via `node-pty`. Resume uses `claude resume <sid>` (or `ZEELIN_CLAUDE_RESUME_CMD_TEMPLATE` with `{sessionId}` placeholder). Other providers (`codex`, `gemini`, `kimi`) are stubs that throw "Provider not enabled".

### Data Layer

SQLite via `better-sqlite3` (`src/main/db/database.js`). Tables:

- `projects` — folder path, name, default provider.
- `sessions` — project link, title, provider, `provider_session_id`, status (`idle`/`running`/`stopped`), cwd.
- `app_settings` — key/value store (JSON). Currently holds `claude_startup_settings`.

No chat content is persisted. Only metadata is stored. `provider_session_id` enables session recovery across app restarts.

### IPC Protocol (renderer ↔ main)

Exposed on `window.api`:

- `projects.list()`, `projects.add()`, `projects.remove(id)`
- `sessions.list(projectId)`, `sessions.create({ projectId, title, provider })`, `sessions.start(sessionId)`, `sessions.resume(sessionId)`, `sessions.stop(sessionId)`, `sessions.buffer(sessionId)`
- `terminal.input(sessionId, text)`, `terminal.onOutput(listener)`, `terminal.onExit(listener)`
- `settings.getClaude()`, `settings.saveClaude(payload)`

All settings payloads are validated with `zod` in the main process.

### Environment Variables

- `ZEELIN_DB_PATH` — Override SQLite database file path.
- `ZEELIN_CLAUDE_START_CMD` — Override the command used to start a Claude session.
- `ZEELIN_CLAUDE_RESUME_CMD_TEMPLATE` — Override resume command; `{sessionId}` is interpolated.
- `VITE_DEV_SERVER_URL` — Dev-only; URL the Electron window loads.

### Testing

**Unit tests** use `node:test` and `node:assert/strict`. They create temp SQLite files and clean up manually.

**E2E tests** use Playwright with `electron.launch()`. Each test:
1. Creates a temp directory and SQLite DB.
2. Seeds `projects` and `sessions` via `node:sqlite` (`DatabaseSync`).
3. Launches Electron with `ZEELIN_DB_PATH` pointing at the temp DB.
4. Uses `window.__ZEELIN_TEST__` (exposed in `App.jsx`) to read session buffers and active session IDs for assertions.
5. E2E tests that exercise Claude session startup override the command via `ZEELIN_CLAUDE_START_CMD` (e.g., `cat` or `printenv`) to avoid needing the real CLI.

Playwright config: single worker (`workers: 1`), `fullyParallel: false`, 120s timeout.

## Native Dependencies

`better-sqlite3` and `node-pty` are native Node modules. `pnpm-workspace.yaml` marks them as allowed builds for `electron-builder`/`electron-rebuild`. After installing dependencies, these may need a rebuild for the current Electron Node version.

## Security Notes

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false` (required for `node-pty` preload).
- IPC input validated with `zod`.
- API keys and env vars entered in settings are stored in local SQLite and injected into the PTY environment at session start.
