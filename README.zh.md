# Cli-Switch

> [English](README.md)

**Cli-Switch** 是一款桌面终端工作台，原生集成了 **Claude Code**、**OpenAI Codex CLI** 和 **Gemini CLI** —— 无需手动安装 CLI 工具，无需折腾环境变量，下载即用。

三款 AI CLI 工具已针对各平台（macOS ARM64/x64、Windows x64）预构建打包。一次配置 API Key 或 OAuth 登录，即可随时切换供应商、模型和编程计划。

---

## 为什么选择 Cli-Switch？

| 痛点                           | Cli-Switch                                                |
| ------------------------------ | --------------------------------------------------------- |
| 三套 CLI 分别安装和升级        | 运行时预打包，随应用一起更新                              |
| 每个工具单独管理环境变量和认证 | 可视化配置界面，支持 API Key / OAuth / 代理               |
| 项目中途切换供应商             | 一键点击侧栏供应商标签                                    |
| 跨工具的会话历史难以追溯       | SQLite 持久化，支持归档与恢复                             |
| 无法复用成功的工作模式         | AI 驱动的技能萃取，从会话记录中提炼可复用技能，实现自进化 |

---

## 核心功能

### 原生 AI CLI 集成

- **Claude Code** — `@anthropic-ai/claude-code`
- **Codex CLI** — `@openai/codex`
- **Gemini CLI** — `@google/gemini-cli`

三款工具随应用打包，无需 `npm install -g`。

### 广泛的大模型供应商支持

除默认供应商外，Cli-Switch 通过 Profile 机制支持几乎所有大模型接口：

| 供应商              | Profile 类型             | 可用模型示例        |
| ------------------- | ------------------------ | ------------------- |
| Anthropic（Claude） | API Key / OAuth          | Claude Opus、Sonnet |
| OpenAI（Codex）     | API Key / OAuth          | GPT-4o、GPT-5       |
| Google（Gemini）    | API Key / OAuth          | Gemini 2.5、2.8     |
| Kimi（月之暗面）    | Code Plan（基于 Claude） | kimi-for-coding     |
| MiniMax             | Code Plan（基于 Claude） | MiniMax-M2.5        |
| DeepSeek            | Code Plan（基于 Claude） | deepseek-v4-pro     |

每个 Profile 支持**自定义 Base URL**、**自定义模型名称**和**代理配置** —— 任何兼容 OpenAI/Anthropic 协议的接口均可开箱即用。

### 会话管理

- **多会话并行**：每个项目可运行多个终端会话，各自对应不同供应商
- **归档与恢复**：保持会话列表清爽，历史记录不丢失
- **拖拽排序**：按优先级自由排列会话顺序
- **AI 智能标题**：从对话上下文中自动提取中文会话标题
- **状态追踪**：启动 → 输出中 → 等待输入 → 已退出，全程可视化
- **自动发现**：在应用外创建的会话（`~/.claude/`、`~/.codex/`、`~/.gemini/`）自动检测和导入

### 项目工作区

- **按项目分组**：每个项目拥有独立的会话集合
- **Git 感知的文件树**：浏览工作区文件，实时显示 Git 状态标记（M/A/D/U）
- **一键打开文件**：双击文件即可用系统默认编辑器打开
- **可折叠侧栏**：灵活切换文件树和会话列表的显示空间

### 技能萃取（Skillgen）

分析历史成功会话，自动提炼可复用的工作流技能：

- **规则萃取**：快速识别成功的命令模式
- **LLM 深度萃取**：结构化 JSON 输出（标题、摘要、步骤、标签、验证条件、反模式）
- **去重与评分**：自动去重，优先保留最有效的模式
- **输出格式**：`.skill.json` 文件，可直接供 AI 助手使用

### 首次启动守卫

不再困惑"API Key 该填在哪里"。首次启动时，Cli-Switch 会锁定工作区并引导你完成供应商配置，配置完成前无法进入主界面。

---

## 快速开始

### 环境要求

- **macOS** ≥ 12（ARM64 或 x64）或 **Windows** ≥ 10（x64）
- 至少一个受支持供应商的 API Key 或 OAuth 账号

### 下载

从 [Releases](https://github.com/baiyea/cli-switch/releases) 页面获取最新版本：

- `Cli-Switch-0.1.2-arm64.dmg` — macOS Apple Silicon
- `Cli-Switch-0.1.2-x64.dmg` — macOS Intel
- `Cli-Switch-Setup-0.1.2-x64.exe` — Windows x64

### 快速上手

1. **启动** Cli-Switch
2. **配置供应商** — 在引导界面中输入 API Key 或通过 OAuth 登录
3. **创建项目** — 选择工作目录
4. **新建会话** — 选择 AI CLI 工具并点击"新建会话"
5. **开始编程** — 终端自动启动对应 CLI，直接描述你想构建的功能即可

### 项目中途切换供应商

在设置中点击供应商标签（Claude / Codex / Gemini），用对应供应商创建新会话，随时切换。所有会话并发运行。

---

## 开发指南

```bash
# 安装依赖
pnpm install

# 准备 CLI 运行时（dev/build 前必须执行）
pnpm prepare:cli-runtime

# 启动开发环境（HMR 热更新）
pnpm dev

# 运行 E2E 测试
pnpm test:e2e

# 构建分发版本
pnpm build
pnpm dist:mac:arm64   # macOS ARM64
pnpm dist:mac:x64     # macOS x64
pnpm dist:win         # Windows x64
```

### 技术栈

| 层级     | 技术                               |
| -------- | ---------------------------------- |
| 桌面框架 | Electron 35                        |
| UI       | React 18 + Tailwind CSS + Radix UI |
| 终端     | xterm.js + node-pty                |
| 数据库   | SQLite（better-sqlite3）           |
| 状态管理 | Zustand                            |
| 构建     | Vite + electron-builder            |
| 测试     | Playwright（E2E）                  |

---

## License

MIT
