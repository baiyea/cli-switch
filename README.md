# Cli-Switch

> [中文版](README.zh.md)

**Cli-Switch** is a desktop terminal workspace that integrates **Claude Code**, **OpenAI Codex CLI**, and **Gemini CLI** natively — no manual CLI installation, no environment variable juggling, just download and start coding.

All three AI CLI tools are pre-bundled for each platform (macOS ARM64/x64, Windows x64). Configure your API keys or sign in via OAuth once, and switch between providers, models, and coding plans instantly.

---

## Why Cli-Switch?

| Problem | Cli-Switch |
|---------|------------|
| Installing and updating 3 CLI tools separately | Pre-bundled runtimes, updated with the app |
| Managing env vars and auth per tool | Visual provider settings with API key / OAuth / proxy |
| Switching between providers mid-project | One click — sidebar provider tabs |
| Tracking past sessions across tools | SQLite-backed session history with archive & restore |
| No way to extract reusable workflows | AI-powered skill generation from session transcripts |

---

## Core Features

### Native AI CLI Integration

- **Claude Code** — `@anthropic-ai/claude-code`
- **Codex CLI** — `@openai/codex`
- **Gemini CLI** — `@google/gemini-cli`

All three ship with the app. No `npm install -g` needed.

### Broad Provider & Model Support

Beyond the default providers, Cli-Switch supports virtually any LLM endpoint via provider profiles:

| Provider | Profile | Example Model |
|----------|---------|---------------|
| Anthropic (Claude) | API Key / OAuth | Claude Opus, Sonnet |
| OpenAI (Codex) | API Key / OAuth | GPT-4o, GPT-5 |
| Google (Gemini) | API Key / OAuth | Gemini 2.5, 2.8 |
| Kimi (Moonshot) | Code Plan via Claude | kimi-for-coding |
| MiniMax | Code Plan via Claude | MiniMax-M2.5 |
| DeepSeek | Code Plan via Claude | deepseek-v4-pro |

Each profile supports **custom base URL**, **custom model name**, and **proxy configuration** — so any OpenAI/Anthropic-compatible endpoint works out of the box.

### Session Management

- **Multi-session**: Run multiple terminal sessions per project, each with its own provider
- **Archive & Restore**: Keep your session list clean without losing history
- **Drag-and-drop reorder**: Organize sessions by priority
- **AI-suggested titles**: Auto-generate meaningful Chinese session names from conversation context
- **Status tracking**: Start → Stream → Await Input → Exited, with visual indicators
- **Auto-discovery**: Sessions created outside the app (in `~/.claude/`, `~/.codex/`, `~/.gemini/`) are automatically detected and imported

### Project Workspace

- **Project-based organization**: Each project gets its own session group
- **Git-aware file explorer**: Browse your workspace with git status badges (M/A/D/U)
- **One-click file open**: Double-click any file to open in your OS default editor
- **Collapsible sidebar**: Keep the file tree or session list focused

### Skill Generation

Analyze past successful coding sessions and extract reusable workflow skills:

- **Rule-based extraction**: Rapid identification of successful command patterns
- **LLM-powered extraction**: Deep transcript analysis with structured JSON output (title, summary, steps, tags, validation criteria, anti-patterns)
- **Deduplication & scoring**: Avoid duplicates, prioritize most effective patterns
- **Output format**: `.skill.json` files ready for AI assistants

### First-Run Guard

No more "where do I put the API key?" confusion. On first launch, Cli-Switch locks the workspace and guides you through provider configuration before anything else.

---

## Getting Started

### Prerequisites

- **macOS** ≥ 12 (ARM64 or x64) or **Windows** ≥ 10 (x64)
- An API key or OAuth access for at least one supported provider

### Download

Get the latest release from the [Releases](https://github.com/baiyea/cli-switch/releases) page:

- `Cli-Switch-0.1.2-arm64.dmg` — macOS Apple Silicon
- `Cli-Switch-0.1.2-x64.dmg` — macOS Intel
- `Cli-Switch-Setup-0.1.2-x64.exe` — Windows x64

### Quick Start

1. **Launch** Cli-Switch
2. **Configure** a provider — enter your API key or sign in via OAuth in the forced setup screen
3. **Create a project** — select a directory to work in
4. **Start a session** — click "New Session" with your preferred AI CLI
5. **Code** — the terminal opens with the CLI ready, just describe what you want to build

### Switching Providers Mid-Project

Click the provider tab (Claude / Codex / Gemini) in the settings, create a session with that provider, and switch anytime. All sessions run concurrently.

---

## Development

```bash
# Install dependencies
pnpm install

# Prepare CLI runtimes (required before dev/build)
pnpm prepare:cli-runtime

# Start development with HMR
pnpm dev

# Run E2E tests
pnpm test:e2e

# Build for distribution
pnpm build
pnpm dist:mac:arm64   # macOS ARM64
pnpm dist:mac:x64     # macOS x64
pnpm dist:win         # Windows x64
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron 35 |
| UI | React 18 + Tailwind CSS + Radix UI |
| Terminal | xterm.js + node-pty |
| Database | SQLite (better-sqlite3) |
| State | Zustand |
| Build | Vite + electron-builder |
| Test | Playwright (E2E) |

---

## License

MIT
