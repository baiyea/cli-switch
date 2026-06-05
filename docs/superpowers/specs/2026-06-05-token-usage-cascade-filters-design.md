# Token 统计级联筛选设计

日期：2026-06-05

## 背景

当前 Settings 的 Token 统计页顶部筛选顺序是：

`时间` → `Provider` → `项目` → `模型`

这个顺序不符合实际查看路径。用户希望先确定项目，再在该项目内查看 provider 和配置 profile 的消耗，最后选择时间范围。页面下方的指标卡、日趋势、模型汇总现阶段不需要重做。

## 目标

只调整 Token 统计页顶部筛选条，改为级联筛选：

`项目` → `Provider` → `Profile` → `时间`

筛选结果继续驱动现有统计内容：

- 总 Token、输入、输出、缓存、Reasoning、轮次指标卡。
- 日趋势。
- 模型汇总。

## 非目标

- 不重做下方统计布局。
- 不新增项目排行、会话排行 UI。
- 不新增第 4 级模型筛选。
- 不从当前 provider 配置表展示无历史用量的 profile。
- 不改变 token 同步、运行段归属、快照累计语义。

## 用户体验

顶部筛选条按固定顺序展示：

1. `项目` 下拉。
2. `Provider` 下拉或按钮组。
3. `Profile` 下拉。
4. `时间` 按钮组：`最近 7 天`、`最近 30 天`、`全部时间`。

级联规则：

- `项目` 列表来自当前时间范围内有 token 记录的项目汇总。
- 选择项目后，`Provider` 只显示该项目下有 token 记录的 provider。
- 选择 provider 后，`Profile` 只显示该项目 + provider 下有 token 记录的 profile。
- 选择 profile 后，下方现有统计内容按该 profile 过滤。
- 模型不作为筛选项；模型仍在“模型汇总”中展示。

默认值规则：

- 页面记住上次选择的项目、provider、profile、时间范围。
- 首次进入且没有历史选择时，默认选择 token 消耗最高的项目。
- 如果上次选择在当前数据里已不存在，则回退到当前级联上下文下的第一个可用项。
- 当上级筛选变化导致下级筛选无效时，自动选择新的第一个可用下级项。

空状态规则：

- 没有任何 token 记录时，项目下拉显示“暂无项目”，Provider/Profile 禁用。
- 选定项目但无 provider 时，Provider 显示“暂无 Provider”，Profile 禁用。
- 选定 provider 但无 profile 时，Profile 显示“暂无 Profile”，下方沿用现有空态。

## 数据与 API

`TokenUsageFilters` 增加：

- `profileId?: string`

保留：

- `range`
- `projectId`
- `provider`

移除 UI 层的 `modelName` 筛选，但后端是否保留 `modelName` 兼容字段由实现阶段决定。为避免破坏已有 IPC 调用，推荐先保留后端兼容，只是不再在 UI 暴露。

`TokenUsageModelSummary` 增加：

- `profileId: string`

Profile 下拉项从 `summary.models` 派生：

- 在当前 `projectId + provider + range` 上下文下，按 `profileId + profileName` 去重。
- 只展示有历史用量的 profile。
- label 优先使用 `profileName`，为空时显示 `unknown`。

Repository 聚合查询需要支持：

- `filters.profileId` 对应 `token_usage_runs.profile_id = ?`。
- 模型聚合结果返回 `profile_id`。

## 数据流

1. 页面加载时读取持久化筛选偏好。
2. 调用 `tokenUsage.summary(filters)` 获取统计 summary。
3. Renderer 从 summary 中派生可选项目、provider、profile。
4. 用户修改 `项目` 后，清理或重置无效的 `provider/profile`。
5. 用户修改 `Provider` 后，清理或重置无效的 `profile`。
6. 用户修改 `Profile` 或 `时间` 后，重新请求 summary。
7. 下方现有统计卡片、日趋势、模型汇总继续读取同一个 summary。

## 组件边界

修改保持在 Settings token-usage block 内：

- `src/pages/settings/token-usage/renderer/TokenUsageSettingsSection.jsx`
- `src/pages/settings/token-usage/renderer/use-token-usage.js`
- `src/pages/settings/token-usage/shared/token-usage.types.ts`
- `src/app/ipc-schemas.js`
- `src/kernel/db/repositories/token-usage.repository.js`
- 对应 repository / IPC / renderer 测试

不得跨 block import provider、terminal、sidebar 的内部实现。Profile 选项只从 token usage summary 派生，不读取 provider 配置 block。

## 错误处理

- summary 请求失败时沿用当前错误横幅。
- refresh 失败时沿用当前错误横幅。
- 筛选偏好解析失败时丢弃偏好，使用默认级联选择。
- 下级选项为空时不发送无效 profile/provider 值。

## 测试

需要覆盖：

- Repository：`getSummary({ profileId })` 只统计指定 profile。
- Repository：models 聚合返回 `profileId`。
- IPC schema：允许 `profileId`，保持旧字段兼容。
- Renderer：项目、provider、profile 级联重置行为。
- E2E：Token 统计页面展示 `项目 → Provider → Profile → 时间` 顺序，选择 profile 后统计结果变化。

## 验收标准

- 顶部筛选顺序为 `项目 → Provider → Profile → 时间`。
- Profile 下拉只显示当前项目 + provider 下有历史 token 用量的 profile。
- 选择 profile 后，下方现有统计内容按 profile 过滤。
- 模型筛选不再出现在顶部筛选条中。
- 下方统计布局保持现状。
- `pnpm build` 通过。
- token usage 相关单元测试和 E2E 通过。
