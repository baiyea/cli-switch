# CLAUDE.md
始终以中文简体方式回答、编写文档

# ZeeLinCode · 迭代与更新规范

---

## 1. 需求变更流程

```
产品想法
  → 更新对应 flow-*.md（先改文档，不得先改代码）
  → 如涉及新依赖，更新 docs/constraints.md Section 1
  → 如涉及新 IPC channel，更新 shared/types.ts 的 IPC 枚举
  → 将变更 diff 作为 context 注入 AI，执行对应 Task
```

**黄金规则：文档是代码的 source of truth。代码与文档不一致时，以文档为准，修代码。**

---

## 2. 每次向 AI 下达任务的标准 Prompt 结构

```
## 全局约束（必须每次携带）
{粘贴 @docs/constraints.md 全文}

## 当前流程
{粘贴对应 docs/flow-*.md 全文，或仅相关 Section}

## 本次任务
实现 docs/flow-*.md Section 8 中的 Task N：
{粘贴 Task 描述}

## 相关上下文
{粘贴与该 Task 直接相关的 Section，如 Section 5 IPC 接口 + Section 6 实现约束}

## 要求
- 只实现本 Task，不超出范围
- 输出完整可运行代码，不使用省略号或 TODO
- 如有歧义，先列出问题，等确认后再编码
- 严格遵守 docs/constraints.md 中的进程边界约束
```

---

## 3. Task 执行顺序约束

- 同一 flow 内的 Task **必须按编号顺序执行**，后序 Task 依赖前序 Task 的类型定义
- 特别是：Task 1（types）→ Task 2-4（主进程）→ Task 5（preload）→ Task 6（bridge）→ Task 7（store）→ Task 8+（组件）
- 跨 flow 的依赖在 flow 文件的 `依赖` 字段中声明，被依赖 flow 必须先完成

---

## 4. 代码修改规范

### 修改已有文件时，AI 必须：

1. 复述当前文件的关键逻辑和对外接口
2. 说明本次修改的影响范围
3. 输出修改后的完整文件（不得用 `// ...` 省略）

### 禁止的修改模式：

- 禁止直接修改 `shared/types.ts` 的 IPC 枚举而不同步更新 preload.ts 和 bridge 层
- 禁止修改 PtyService 的公共方法签名而不同步更新 pty.handler.ts
- 禁止在渲染进程新增对 Node.js 模块的 import

---

## 5. 版本与分支策略

```
main          ← 稳定版本，只接受来自 feature/* 的 PR
feature/*     ← 每个 flow 对应一个 feature 分支，如 feature/terminal
fix/*         ← bug 修复，从 main 切出，合回 main
```

### Commit 规范（Conventional Commits）

```
feat(terminal): add QuickLaunch component
fix(pty): handle resize when terminal is hidden
refactor(bridge): extract pty.bridge from session.bridge
docs(flow): update terminal flow task list
```

格式：`{type}({scope}): {description}`

scope 对应目录：`terminal`、`sidebar`、`explorer`、`pty`、`bridge`、`store`、`ipc`

---

## 6. 变更分类与处理方式

| 变更类型 | 影响范围 | 处理方式 |
|----------|----------|----------|
| 新增 UI 组件 | 仅渲染进程 | 更新对应 flow，执行对应 Task |
| 新增 IPC channel | `shared/types.ts` + preload + bridge + handler | 严格按 Task 1→5→6→4 顺序执行 |
| 修改 PTY 行为 | 主进程 services + ipc | 更新 flow-terminal.md Section 5/6 |
| 新增 QuickLaunch 预设 | 仅 `shared/constants.ts` | 单文件修改，无依赖 |
| 新增项目功能（文件树等）| 需新建 flow-*.md | 走完整流程 |
| 性能优化 | 视范围 | 在对应 flow 中新增 Task，注明性能目标 |
| 依赖升级 | `package.json` + docs/constraints.md | 必须评审，不得 AI 自行升级 |


## 7. 参考文档
Gemini Cli：https://geminicli.org.cn/docs/get-started/configuration/#available-settings-in-settingsjson
Codex Cli：https://developers.openai.com/codex/cli/reference
Claude Code：https://code.claude.com/docs/zh-CN/cli-reference


---

## 7. 上线验收清单

每个 feature 分支合并前，逐项检查：

- [ ] 对应 flow 文件的 Section 7 验收条件全部通过
- [ ] 无 `console.log` 残留（使用 electron-log）
- [ ] 无 `any` 类型（TypeScript strict 模式下无 error）
- [ ] 渲染进程无 Node.js 模块 import（检查 `require`、`import fs`、`import pty`）
- [ ] 所有 IPC channel 使用 `IPC.XXX` 枚举，无字符串字面量
- [ ] 多 session 切换无内存泄漏（xterm 实例不被重复创建）
- [ ] 应用退出时 PTY 进程全部被 kill（`destroyAll` 被调用）
- [ ] CSS 无硬编码颜色值（全部使用 CSS 变量）
