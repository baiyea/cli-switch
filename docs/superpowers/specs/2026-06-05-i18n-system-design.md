# i18n 体系设计

## 背景

Cli-Switch 当前没有成体系的国际化能力，用户可见文案主要分散在 `HomePage`、Settings 页面和各 page/block 的 renderer 文件中。第一版 i18n 的目标是建立完整本地化体系，并先迁移 Settings 相关 UI，使语言切换、语言持久化和 Settings 文案刷新形成闭环。

本设计参考 `/Users/zeelin/WorkCode/LobsterAI/` 的轻量 i18n service 思路，包括 service、订阅刷新、fallback、main/renderer 分离和插值能力。但 Cli-Switch 需要遵守 Page Block Capsule，不能把所有 page/block 文案集中到单个大字典文件。

## 目标

- 默认语言为 `zh-CN`。
- 首批支持 `zh-CN` 和 `en-US`。
- 不跟随系统语言，用户在 Settings 的 Appearance 区手动切换语言。
- 语言偏好持久化到 `app_settings` 中的 `appearance_settings.locale`。
- 第一轮迁移 Settings 相关 UI 文案、用户可见提示、日期数字和 token 数量格式化。
- 建立 renderer 和 main 可复用的轻量 i18n 运行时。
- 语言包采用混合模式：全局通用词集中维护，page/block 私有文案跟随对应 block。

## 非目标

- 第一轮不迁移 Home 页面文案。
- 不翻译 Terminal 输出、CLI 原始输出、provider 原始响应。
- 不迁移开发日志和主进程内部日志。
- 不迁移 E2E 测试名称。
- 不引入 `i18next`、`react-i18next` 或 FormatJS。
- 不做系统语言自动识别和自动切换。

## 架构

新增 `src/i18n` 作为跨页面基础能力，只放语言运行时、全局通用词和格式化工具，不放页面业务逻辑。

```text
src/i18n/
├── i18n.types.ts
├── i18n.registry.ts
├── i18n.service.ts
├── I18nProvider.tsx
├── use-t.ts
├── format.ts
├── renderer.ts
├── main.js
└── locales/
    ├── zh-CN.json
    └── en-US.json
```

Settings block 自己维护私有语言包。

```text
src/pages/settings/appearance/locales/
├── zh-CN.json
├── en-US.json
└── index.ts

src/pages/settings/providers/locales/
src/pages/settings/archive/locales/
src/pages/settings/about/locales/
src/pages/settings/token-usage/locales/
```

边界规则：

- `src/i18n` 可以被 renderer、page/block renderer 和必要 main 代码使用。
- `src/i18n` 禁止 import `src/pages/**`。
- block 私有 locale 只能由对应 block 或 Settings 聚合入口注册。
- block 之间禁止 import 对方 `locales`。
- `src/i18n/locales` 只放通用词，例如 `common.save`、`common.cancel`、`settings.title`、`language.zhCN`。
- Settings 业务文案放在对应 block，例如 `settings.providers.testConnection`、`settings.archive.retentionDays`。
- main 进程只加载少量用户可见 main 文案，不复用 renderer React 上下文。

## 语言包注册

block 的 `locales/index.ts` 只导出静态 messages，不操作状态。

```ts
import zhCN from './zh-CN.json';
import enUS from './en-US.json';

export const appearanceMessages = {
  'zh-CN': zhCN,
  'en-US': enUS,
};
```

Settings 页面聚合 Settings 内部 block 的语言包并注册。

```ts
import { registerMessages } from '../../i18n/renderer';
import { appearanceMessages } from './appearance/locales';
import { providersMessages } from './providers/locales';

export function registerSettingsI18n() {
  registerMessages('settings.appearance', appearanceMessages);
  registerMessages('settings.providers', providersMessages);
}
```

应用 renderer 启动时调用 Settings i18n 注册入口。

```ts
import { registerSettingsI18n } from './settings/settings.i18n';

export function registerPageRenderer() {
  registerSettingsI18n();
}
```

组件只使用统一运行时。

```tsx
import { useT } from '../../../../i18n/use-t';

export function AppearanceSettingsSection() {
  const t = useT();
  return <h2>{t('settings.appearance.title')}</h2>;
}
```

## 数据流

语言状态链路：

```text
app_settings.appearance_settings.locale
        ↓ 启动读取
settings repository / appearance API
        ↓ renderer 初始化
I18nProvider initialLocale
        ↓ 用户在 Appearance 切换
setLocale('en-US')
        ↓
i18n service 更新内存语言 + 通知订阅者重渲染
        ↓
appearance_settings.locale 持久化
```

具体约定：

- locale 类型固定为 `'zh-CN' | 'en-US'`。
- 默认值固定为 `'zh-CN'`。
- `appearance_settings` 从 `{ themeMode }` 扩展为 `{ themeMode, locale }`。
- `ensureAppearanceShape()` 校验非法 locale，非法值回落 `zh-CN`。
- `I18nProvider` 在 renderer 根部包裹应用，让 `useT()` 能触发 React 重渲染。
- `i18nService.t(key, params?)` 提供给非 React renderer 逻辑使用。
- 语言切换后先更新内存并刷新 UI，再调用现有 Settings 持久化 API 保存。
- 保存失败时显示本地化错误提示，并回滚到保存前的 locale，避免 UI 与持久化状态长期不一致。

main 进程：

- main 不参与 React 语言切换。
- main 需要用户可见文案时使用独立的 `src/i18n/main.js`。
- main 当前语言由 `appearance_settings.locale` 初始化。
- Settings 保存 locale 后，如果主进程文案需要立即更新，可在 appearance 保存 IPC 的成功路径顺带调用 `setMainLocale(locale)`，不新增全局语言 IPC。

## 首轮迁移范围

第一轮只覆盖 Settings 相关 UI。

纳入：

- `src/pages/settings/SettingsModal.jsx`
- `src/pages/settings/SettingsSideNav.jsx`
- `src/pages/settings/SettingsPage.tsx`
- `src/pages/settings/appearance`
- `src/pages/settings/providers`
- `src/pages/settings/archive`
- `src/pages/settings/about`
- `src/pages/settings/token-usage`
- Settings 里用户可见的错误、成功提示、按钮、placeholder、tab、section 标题。
- Settings 中日期、数字、token 数量显示，使用 `formatDate()`、`formatNumber()` 或 `formatTokenCount()`。

暂不纳入：

- Home 页面文案。
- Terminal 输出内容。
- CLI/provider 原始输出。
- 开发日志和主进程内部日志。
- E2E 测试名称。
- 非 Settings 的用户错误提示。

## Key 规范

key 使用点分命名，按归属组织。

```text
common.save
common.cancel
common.loading
language.zhCN
language.enUS

settings.title
settings.sideNav.appearance
settings.appearance.title
settings.appearance.language
settings.providers.testConnection
settings.archive.restore
settings.tokenUsage.totalTokens
```

插值格式参考 LobsterAI，但 renderer 和 main 统一支持 `{param}`。

```ts
t('settings.archive.deleteConfirm', { name: archive.name });
```

```json
{
  "settings.archive.deleteConfirm": "确定删除归档 {name} 吗？"
}
```

fallback 规则：

1. 当前 locale 找 key。
2. 找不到时回退 `zh-CN`。
3. 仍找不到就返回 key。
4. dev 模式下记录 missing key warning。
5. 提供测试工具校验 `zh-CN` 与 `en-US` key 集合一致。

## 错误处理

- 用户可见错误尽量变成 key，例如 `{ key: 'settings.providers.connectionFailed', params: { reason } }`。
- 来自外部 CLI/API 的原始错误不强行翻译，作为 `{reason}` 插入。
- 日志保持中文或原始内容，不纳入首轮。
- 保存语言失败显示 `settings.appearance.saveLocaleFailed`。
- 格式化失败回退原始字符串或 `0`，不让 UI 崩溃。

## E2E 策略

- 不依赖翻译后的 visible text 作为核心定位。
- 首轮如果已有用例依赖 Settings 文案，优先补 `data-testid` 或改成结构/role 定位。
- 不为了 i18n 大量改 E2E 行为。
- 第一轮至少保证 `pnpm test:e2e --list` 可收集。
- 必要时运行 Settings 相关 E2E 或 renderer 测试。

## 测试与验收

单元测试：

- `i18n`：覆盖 `t()` fallback、插值、注册覆盖、locale 校验、`formatDate()`、`formatNumber()`、`formatTokenCount()`。
- `settings.repository`：覆盖 `appearance_settings.locale` 默认值、非法值回退、保存后读取。

架构守卫：

- `scripts/check-architecture.js` 禁止 block 之间 import 对方 `locales`。
- 禁止 `src/i18n` import `src/pages/**`。
- 通过 `i18n` 单元测试检查 `src/i18n/locales/zh-CN.json` 和 `en-US.json` key 一致；block 私有 locale 的 key 一致性在对应 block 测试中覆盖。

验收命令：

```bash
nvm use .nvmrc
pnpm build
pnpm test
node scripts/check-architecture.js
pnpm test:e2e --list
```

第一轮不要求全量 `pnpm test:e2e` 通过；全量 E2E 稳定化作为后续任务处理。

## 实施顺序建议

1. 建立 `src/i18n` runtime、registry、provider、hook、format 工具和基础测试。
2. 扩展 `appearance_settings.locale` 的 repository shape 和测试。
3. 在 renderer 根部接入 `I18nProvider`，注册全局通用 messages。
4. 为 Settings 各 block 增加 `locales` 并通过 Settings 聚合入口注册。
5. 迁移 Appearance 区，加入语言切换 UI 和保存失败提示。
6. 迁移 SettingsModal、SettingsSideNav、SettingsPage。
7. 迁移 providers、archive、about、token-usage 文案和格式化。
8. 调整 Settings 相关测试与架构守卫。
