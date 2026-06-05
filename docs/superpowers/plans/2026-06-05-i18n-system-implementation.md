# i18n System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight i18n system for Cli-Switch with `zh-CN` as default, `en-US` support, Settings-first migration, and persisted manual language switching.

**Architecture:** Add `src/i18n` as a cross-page runtime that owns only translation lookup, registration, locale state, React provider, and formatting helpers. Keep page/block text resources with their owning block and register them from Settings aggregation code, so `src/i18n` never imports `src/pages/**`. Persist locale in `appearance_settings.locale` and migrate Settings UI text before Home.

**Tech Stack:** Electron, React, TypeScript/JavaScript, Zustand-adjacent renderer state, SQLite `app_settings`, Node test runner, Playwright E2E.

---

## File Structure

Create:

- `src/i18n/i18n.types.ts`: locale and message type definitions.
- `src/i18n/i18n.registry.js`: message registration, lookup, interpolation, key consistency helpers.
- `src/i18n/i18n.service.js`: renderer-safe locale state, `t()`, `setLocale()`, `subscribe()`.
- `src/i18n/I18nProvider.tsx`: React context provider.
- `src/i18n/use-t.ts`: React hook for `t`, `locale`, `setLocale`.
- `src/i18n/format.js`: locale-aware date, number, and token count helpers.
- `src/i18n/renderer.js`: renderer public entry.
- `src/i18n/main.js`: main-process lightweight i18n.
- `src/i18n/locales/zh-CN.json`: global common messages.
- `src/i18n/locales/en-US.json`: global common messages.
- `src/i18n/i18n.registry.test.js`: registry and service tests.
- `src/i18n/format.test.js`: formatting tests.
- `src/pages/settings/settings.i18n.ts`: Settings page message registration.
- `src/pages/settings/appearance/locales/zh-CN.json`
- `src/pages/settings/appearance/locales/en-US.json`
- `src/pages/settings/appearance/locales/index.ts`
- `src/pages/settings/providers/locales/zh-CN.json`
- `src/pages/settings/providers/locales/en-US.json`
- `src/pages/settings/providers/locales/index.ts`
- `src/pages/settings/archive/locales/zh-CN.json`
- `src/pages/settings/archive/locales/en-US.json`
- `src/pages/settings/archive/locales/index.ts`
- `src/pages/settings/about/locales/zh-CN.json`
- `src/pages/settings/about/locales/en-US.json`
- `src/pages/settings/about/locales/index.ts`
- `src/pages/settings/token-usage/locales/zh-CN.json`
- `src/pages/settings/token-usage/locales/en-US.json`
- `src/pages/settings/token-usage/locales/index.ts`

Modify:

- `src/app/AppShell.jsx`: wrap `HomePage` with `I18nProvider`.
- `src/app/register-page-renderer.tsx`: call global i18n registration first, then Settings i18n registration after Settings bundles exist.
- `src/app/env.d.ts`: add `locale` to appearance API shape.
- `src/kernel/db/repositories/settings.repository.js`: persist and validate `appearance_settings.locale`.
- `src/kernel/db/repositories/settings.repository.test.js`: test locale defaults and validation.
- `src/pages/settings/appearance/shared/appearance.types.ts`: add `AppearanceLocale`.
- `src/pages/settings/appearance/renderer/use-appearance-settings.js`: add locale switching and rollback on save failure.
- `src/pages/settings/appearance/renderer/AppearanceSettingsSection.jsx`: add language UI and migrate text.
- `src/pages/settings/SettingsModal.jsx`: migrate header, close aria label, provider guard text.
- `src/pages/settings/SettingsSideNav.jsx`: migrate nav labels.
- `src/pages/settings/SettingsPage.tsx`: migrate standalone page labels.
- `src/pages/settings/providers/renderer/ProviderSettingsSection.jsx`: migrate provider Settings UI text.
- `src/pages/settings/archive/renderer/ArchiveSettingsSection.jsx`: migrate archive UI text and cleanup messages.
- `src/pages/settings/about/renderer/AboutSettingsSection.jsx`: migrate about UI text and clean runtime dialog.
- `src/pages/settings/token-usage/renderer/TokenUsageSettingsSection.jsx`: migrate token usage text and formatting.
- `src/pages/settings/appearance/e2e/appearance.e2e.js`: add locale persistence and text-switching coverage using stable selectors.
- `scripts/check-architecture.js`: add i18n boundary guards.

Do not modify Home UI text in this implementation.

---

### Task 1: i18n Registry, Service, Formatter

**Files:**
- Create: `src/i18n/i18n.types.ts`
- Create: `src/i18n/i18n.registry.js`
- Create: `src/i18n/i18n.service.js`
- Create: `src/i18n/format.js`
- Create: `src/i18n/renderer.js`
- Create: `src/i18n/locales/zh-CN.json`
- Create: `src/i18n/locales/en-US.json`
- Create: `src/i18n/i18n.registry.test.js`
- Create: `src/i18n/format.test.js`

- [ ] **Step 1: Write registry tests**

Create `src/i18n/i18n.registry.test.js` with:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createMessageRegistry,
  interpolateMessage,
  normalizeLocale,
} = require('./i18n.registry');

test('normalizeLocale accepts supported locales and falls back to zh-CN', () => {
  assert.equal(normalizeLocale('zh-CN'), 'zh-CN');
  assert.equal(normalizeLocale('en-US'), 'en-US');
  assert.equal(normalizeLocale('en'), 'zh-CN');
  assert.equal(normalizeLocale(''), 'zh-CN');
});

test('registry resolves locale messages with zh-CN fallback and key fallback', () => {
  const registry = createMessageRegistry();
  registry.registerMessages('common', {
    'zh-CN': { 'common.save': '保存', 'common.cancel': '取消' },
    'en-US': { 'common.save': 'Save' },
  });

  assert.equal(registry.t('en-US', 'common.save'), 'Save');
  assert.equal(registry.t('en-US', 'common.cancel'), '取消');
  assert.equal(registry.t('en-US', 'common.missing'), 'common.missing');
});

test('interpolateMessage replaces named tokens', () => {
  assert.equal(
    interpolateMessage('已清理 {count} 条记录，跳过 {skipped} 条', {
      count: 3,
      skipped: 1,
    }),
    '已清理 3 条记录，跳过 1 条',
  );
});

test('registry reports locale key mismatches', () => {
  const registry = createMessageRegistry();
  registry.registerMessages('common', {
    'zh-CN': { 'common.save': '保存', 'common.cancel': '取消' },
    'en-US': { 'common.save': 'Save' },
  });

  assert.deepEqual(registry.findMissingKeys('en-US', 'zh-CN'), ['common.cancel']);
});
```

- [ ] **Step 2: Write formatter tests**

Create `src/i18n/format.test.js` with:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { formatDateLabel, formatDateTime, formatNumber, formatTokenCount } = require('./format');

test('formatNumber uses locale-aware grouping', () => {
  assert.equal(formatNumber(1234567, 'en-US'), '1,234,567');
  assert.equal(formatNumber(1234567, 'zh-CN'), '1,234,567');
});

test('formatTokenCount formats values in millions', () => {
  assert.equal(formatTokenCount(2500000, 'en-US'), '2.50M');
  assert.equal(formatTokenCount(undefined, 'zh-CN'), '0.00M');
});

test('formatDate helpers handle valid and invalid dates', () => {
  assert.equal(formatDateLabel('2026-06-05T08:09:00.000Z', 'en-US'), '06/05');
  assert.equal(formatDateLabel('', 'zh-CN'), '--');
  assert.match(formatDateTime('2026-06-05T08:09:00.000Z', 'zh-CN'), /\d{2}\/\d{2}/);
  assert.equal(formatDateTime('', 'zh-CN'), '尚未同步');
  assert.equal(formatDateTime('', 'en-US'), 'Not synced yet');
});
```

- [ ] **Step 3: Run tests and verify they fail**

Run:

```bash
nvm use .nvmrc
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron --test src/i18n/i18n.registry.test.js src/i18n/format.test.js
```

Expected: fail because `src/i18n/*.js` implementation files do not exist.

- [ ] **Step 4: Implement types, registry, service, formatter, and global messages**

Create `src/i18n/i18n.types.ts`:

```ts
export type Locale = 'zh-CN' | 'en-US';

export type TranslationParams = Record<string, string | number | boolean | null | undefined>;

export type LocaleMessages = Record<string, string>;

export type MessageBundle = Record<Locale, LocaleMessages>;
```

Create `src/i18n/i18n.registry.js`:

```js
const DEFAULT_LOCALE = 'zh-CN';
const SUPPORTED_LOCALES = ['zh-CN', 'en-US'];

function normalizeLocale(value) {
  return value === 'en-US' || value === 'zh-CN' ? value : DEFAULT_LOCALE;
}

function interpolateMessage(message, params = {}) {
  let next = message;
  for (const [key, value] of Object.entries(params)) {
    next = next.replaceAll(`{${key}}`, String(value ?? ''));
  }
  return next;
}

function createMessageRegistry() {
  const messages = {
    'zh-CN': {},
    'en-US': {},
  };

  function registerMessages(_namespace, bundle) {
    for (const locale of SUPPORTED_LOCALES) {
      messages[locale] = {
        ...messages[locale],
        ...(bundle[locale] || {}),
      };
    }
  }

  function t(locale, key, params) {
    const normalizedLocale = normalizeLocale(locale);
    const message = messages[normalizedLocale][key] ?? messages[DEFAULT_LOCALE][key] ?? key;
    return interpolateMessage(message, params);
  }

  function findMissingKeys(locale, baseLocale = DEFAULT_LOCALE) {
    const targetKeys = new Set(Object.keys(messages[normalizeLocale(locale)]));
    return Object.keys(messages[normalizeLocale(baseLocale)])
      .filter((key) => !targetKeys.has(key))
      .sort();
  }

  function clear() {
    messages['zh-CN'] = {};
    messages['en-US'] = {};
  }

  return {
    clear,
    findMissingKeys,
    registerMessages,
    t,
  };
}

const messageRegistry = createMessageRegistry();

module.exports = {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  createMessageRegistry,
  interpolateMessage,
  messageRegistry,
  normalizeLocale,
};
```

Create `src/i18n/i18n.service.js`:

```js
const { messageRegistry, normalizeLocale } = require('./i18n.registry');

class I18nService {
  constructor() {
    this.locale = 'zh-CN';
    this.listeners = new Set();
  }

  getLocale() {
    return this.locale;
  }

  setLocale(locale) {
    const nextLocale = normalizeLocale(locale);
    if (this.locale === nextLocale) return this.locale;
    this.locale = nextLocale;
    for (const listener of this.listeners) listener();
    return this.locale;
  }

  registerMessages(namespace, bundle) {
    messageRegistry.registerMessages(namespace, bundle);
    for (const listener of this.listeners) listener();
  }

  t(key, params) {
    return messageRegistry.t(this.locale, key, params);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

const i18nService = new I18nService();

module.exports = {
  I18nService,
  i18nService,
};
```

Create `src/i18n/format.js`:

```js
function safeDate(value) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatNumber(value, locale) {
  const number = Math.max(0, Math.floor(Number(value || 0)));
  return new Intl.NumberFormat(locale).format(Number.isFinite(number) ? number : 0);
}

function formatTokenCount(value, locale) {
  const number = Number(value || 0);
  const normalized = Number.isFinite(number) ? Math.max(0, number) : 0;
  return `${(normalized / 1_000_000).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}M`;
}

function formatDateLabel(value, _locale) {
  const date = safeDate(value);
  if (!date) return '--';
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(
    2,
    '0',
  )}`;
}

function formatDateTime(value, locale) {
  const date = safeDate(value);
  if (!date) return locale === 'en-US' ? 'Not synced yet' : '尚未同步';
  return `${formatDateLabel(value, locale)} ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

module.exports = {
  formatDateLabel,
  formatDateTime,
  formatNumber,
  formatTokenCount,
};
```

Create `src/i18n/renderer.js`:

```js
import enUS from './locales/en-US.json';
import zhCN from './locales/zh-CN.json';
import { i18nService } from './i18n.service';
import { normalizeLocale } from './i18n.registry';

export { i18nService, normalizeLocale };

export function registerMessages(namespace, bundle) {
  i18nService.registerMessages(namespace, bundle);
}

export function registerGlobalI18n() {
  registerMessages('global', {
    'zh-CN': zhCN,
    'en-US': enUS,
  });
}
```

Create `src/i18n/locales/zh-CN.json`:

```json
{
  "common.save": "保存",
  "common.cancel": "取消",
  "common.close": "关闭",
  "common.delete": "删除",
  "common.restore": "恢复",
  "common.loading": "加载中...",
  "common.saving": "正在保存...",
  "common.saved": "已保存",
  "common.synced": "已同步",
  "common.failed": "失败",
  "language.zhCN": "中文",
  "language.enUS": "English",
  "settings.title": "设置"
}
```

Create `src/i18n/locales/en-US.json`:

```json
{
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.delete": "Delete",
  "common.restore": "Restore",
  "common.loading": "Loading...",
  "common.saving": "Saving...",
  "common.saved": "Saved",
  "common.synced": "Synced",
  "common.failed": "Failed",
  "language.zhCN": "中文",
  "language.enUS": "English",
  "settings.title": "Settings"
}
```

- [ ] **Step 5: Run tests and verify they pass**

Run:

```bash
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron --test src/i18n/i18n.registry.test.js src/i18n/format.test.js
```

Expected: all i18n tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/i18n
git commit -m "feat: add lightweight i18n runtime"
```

---

### Task 2: React Provider and Renderer Registration

**Files:**
- Create: `src/i18n/I18nProvider.tsx`
- Create: `src/i18n/use-t.ts`
- Modify: `src/app/AppShell.jsx`
- Modify: `src/app/register-page-renderer.tsx`

- [ ] **Step 1: Write provider and hook code**

Create `src/i18n/I18nProvider.tsx`:

```tsx
import React, { createContext, useEffect, useMemo, useState } from 'react';

import { i18nService, normalizeLocale } from './renderer';
import type { Locale, TranslationParams } from './i18n.types';

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: unknown) => Locale;
  t: (key: string, params?: TranslationParams) => string;
}

export const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  children,
  initialLocale = 'zh-CN',
}: {
  children: React.ReactNode;
  initialLocale?: unknown;
}) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const normalized = normalizeLocale(initialLocale);
    i18nService.setLocale(normalized);
    return normalized;
  });

  useEffect(() => i18nService.subscribe(() => setLocaleState(i18nService.getLocale())), []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale: (nextLocale) => i18nService.setLocale(nextLocale),
      t: (key, params) => i18nService.t(key, params),
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
```

Create `src/i18n/use-t.ts`:

```ts
import { useContext } from 'react';

import { I18nContext } from './I18nProvider';
import { i18nService } from './renderer';

export function useI18n() {
  const context = useContext(I18nContext);
  if (context) return context;
  return {
    locale: i18nService.getLocale(),
    setLocale: (locale: unknown) => i18nService.setLocale(locale),
    t: (key: string, params?: Record<string, string | number | boolean | null | undefined>) =>
      i18nService.t(key, params),
  };
}

export function useT() {
  return useI18n().t;
}
```

- [ ] **Step 2: Register global messages**

Modify `src/app/register-page-renderer.tsx`:

```tsx
import { registerGlobalI18n } from '../i18n/renderer';
import { fileTreeRenderer } from '../pages/home/file-tree/block.renderer';
import { sidebarRenderer } from '../pages/home/sidebar/block.renderer';
import { terminalRenderer } from '../pages/home/terminal/block.renderer';
import { topToolbarRenderer } from '../pages/home/top-toolbar/block.renderer';
import { aboutRenderer } from '../pages/settings/about/block.renderer';
import { appearanceRenderer } from '../pages/settings/appearance/block.renderer';
import { archiveRenderer } from '../pages/settings/archive/block.renderer';
import { providersRenderer } from '../pages/settings/providers/block.renderer';
import { tokenUsageRenderer } from '../pages/settings/token-usage/block.renderer';

registerGlobalI18n();

export const pageRenderers = {
  terminal: terminalRenderer,
  sidebar: sidebarRenderer,
  fileTree: fileTreeRenderer,
  topToolbar: topToolbarRenderer,
  providers: providersRenderer,
  appearance: appearanceRenderer,
  archive: archiveRenderer,
  about: aboutRenderer,
  tokenUsage: tokenUsageRenderer,
};
```

- [ ] **Step 3: Wrap the app**

Modify `src/app/AppShell.jsx`:

```jsx
import { I18nProvider } from '../i18n/I18nProvider';
import { HomePage } from '../pages/home/HomePage';

export function AppShell() {
  return (
    <I18nProvider initialLocale="zh-CN">
      <HomePage />
    </I18nProvider>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/i18n/I18nProvider.tsx src/i18n/use-t.ts src/app/AppShell.jsx src/app/register-page-renderer.tsx
git commit -m "feat: wire i18n provider into renderer"
```

---

### Task 3: Persist Locale in Appearance Settings

**Files:**
- Modify: `src/kernel/db/repositories/settings.repository.js`
- Modify: `src/kernel/db/repositories/settings.repository.test.js`
- Modify: `src/pages/settings/appearance/shared/appearance.types.ts`
- Modify: `src/app/env.d.ts`

- [ ] **Step 1: Update repository tests**

Modify existing `src/kernel/db/repositories/settings.repository.test.js` assertions so all appearance settings include `locale`, then append the locale-specific tests.

Replace:

```js
assert.deepEqual(repo.getAppearanceSettings(), { themeMode: 'system' });
```

with:

```js
assert.deepEqual(repo.getAppearanceSettings(), { themeMode: 'system', locale: 'zh-CN' });
```

Replace every existing expected `{ themeMode: 'dark' }` with:

```js
{ themeMode: 'dark', locale: 'zh-CN' }
```

Replace every existing expected `{ themeMode: 'system' }` with:

```js
{ themeMode: 'system', locale: 'zh-CN' }
```

Then append:

```js
test('appearance settings persists locale and keeps theme mode', () => {
  const { repo } = createRepo();
  repo.setAppearanceSettings({ themeMode: 'dark', locale: 'en-US' });
  assert.deepEqual(repo.getAppearanceSettings(), {
    themeMode: 'dark',
    locale: 'en-US',
  });
});

test('appearance settings falls back invalid locale to zh-CN', () => {
  const { repo } = createRepo();
  repo.setAppearanceSettings({ themeMode: 'light', locale: 'fr-FR' });
  assert.deepEqual(repo.getAppearanceSettings(), {
    themeMode: 'light',
    locale: 'zh-CN',
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
pnpm exec electron --test src/kernel/db/repositories/settings.repository.test.js
```

Expected: fail because `locale` is not yet returned.

- [ ] **Step 3: Update repository shape**

Modify `src/kernel/db/repositories/settings.repository.js`:

```js
  const defaultAppearanceValue = { themeMode: 'system', locale: 'zh-CN' };
  const validThemeModes = new Set(['system', 'dark', 'light']);
  const validLocales = new Set(['zh-CN', 'en-US']);
```

Replace `ensureAppearanceShape()` with:

```js
  function ensureAppearanceShape(input) {
    const themeMode = validThemeModes.has(input?.themeMode) ? input.themeMode : 'system';
    const locale = validLocales.has(input?.locale) ? input.locale : 'zh-CN';
    return { themeMode, locale };
  }
```

- [ ] **Step 4: Update renderer-facing types**

Modify `src/pages/settings/appearance/shared/appearance.types.ts`:

```ts
export type AppearanceThemeMode = 'system' | 'dark' | 'light';
export type AppearanceLocale = 'zh-CN' | 'en-US';

export interface AppearanceSettings {
  themeMode: AppearanceThemeMode;
  locale: AppearanceLocale;
}
```

Modify `src/app/env.d.ts` so `electronAPI.appearance.get()` and `.set()` use the new `locale?: 'zh-CN' | 'en-US'` shape. Keep existing `themeMode` typing intact.

- [ ] **Step 5: Run repository tests**

Run:

```bash
pnpm exec electron --test src/kernel/db/repositories/settings.repository.test.js
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/kernel/db/repositories/settings.repository.js src/kernel/db/repositories/settings.repository.test.js src/pages/settings/appearance/shared/appearance.types.ts src/app/env.d.ts
git commit -m "feat: persist appearance locale"
```

---

### Task 4: Settings Locale Bundles and Registration

**Files:**
- Create: `src/pages/settings/settings.i18n.ts`
- Create locale files and `index.ts` files under Settings blocks.
- Modify: `src/app/register-page-renderer.tsx`

- [ ] **Step 1: Create block locale exports**

For each Settings block, create `locales/index.ts` with this pattern:

```ts
import enUS from './en-US.json';
import zhCN from './zh-CN.json';

export const appearanceMessages = {
  'zh-CN': zhCN,
  'en-US': enUS,
};
```

Use export names:

- `appearanceMessages`
- `providersMessages`
- `archiveMessages`
- `aboutMessages`
- `tokenUsageMessages`

- [ ] **Step 2: Create initial Appearance messages**

Create `src/pages/settings/appearance/locales/zh-CN.json`:

```json
{
  "settings.appearance.title": "外观",
  "settings.appearance.subtitle": "选择 Cli-Switch 的显示方式，并预览终端对比度。",
  "settings.appearance.themeMode": "主题模式",
  "settings.appearance.themeDescription": "选择设置界面与终端工作区的显示方式。点击后立即预览，并在后台保存。",
  "settings.appearance.theme.system.label": "跟随系统",
  "settings.appearance.theme.system.description": "自动匹配系统深浅色偏好。",
  "settings.appearance.theme.dark.label": "暗色系",
  "settings.appearance.theme.dark.description": "适合长时间终端工作和低光环境。",
  "settings.appearance.theme.light.label": "亮色系",
  "settings.appearance.theme.light.description": "提高白天阅读、审阅与演示时的清晰度。",
  "settings.appearance.language": "语言",
  "settings.appearance.languageDescription": "切换 Settings 界面显示语言。默认使用中文。",
  "settings.appearance.previewTitle": "终端预览",
  "settings.appearance.previewCurrent": "当前生效：{theme}",
  "settings.appearance.theme.dark.name": "暗色系",
  "settings.appearance.theme.light.name": "亮色系",
  "settings.appearance.saveFailed": "外观设置保存失败，请稍后重试。",
  "settings.appearance.saveLocaleFailed": "语言设置保存失败，已回滚到上一次语言。"
}
```

Create `src/pages/settings/appearance/locales/en-US.json`:

```json
{
  "settings.appearance.title": "Appearance",
  "settings.appearance.subtitle": "Choose how Cli-Switch looks and preview terminal contrast.",
  "settings.appearance.themeMode": "Theme mode",
  "settings.appearance.themeDescription": "Choose how the settings UI and terminal workspace are displayed. Changes preview immediately and save in the background.",
  "settings.appearance.theme.system.label": "System",
  "settings.appearance.theme.system.description": "Automatically match the system light or dark preference.",
  "settings.appearance.theme.dark.label": "Dark",
  "settings.appearance.theme.dark.description": "Designed for long terminal sessions and low-light environments.",
  "settings.appearance.theme.light.label": "Light",
  "settings.appearance.theme.light.description": "Improves clarity for daytime reading, review, and demos.",
  "settings.appearance.language": "Language",
  "settings.appearance.languageDescription": "Switch the Settings interface language. Chinese is the default.",
  "settings.appearance.previewTitle": "Terminal preview",
  "settings.appearance.previewCurrent": "Current: {theme}",
  "settings.appearance.theme.dark.name": "Dark",
  "settings.appearance.theme.light.name": "Light",
  "settings.appearance.saveFailed": "Failed to save appearance settings. Try again later.",
  "settings.appearance.saveLocaleFailed": "Failed to save language setting. Reverted to the previous language."
}
```

- [ ] **Step 3: Create Settings shell messages**

Create block JSON entries for shared Settings shell text in `src/pages/settings/appearance/locales/*.json` or global `src/i18n/locales/*.json`; use global for these keys:

`src/i18n/locales/zh-CN.json` add:

```json
{
  "settings.sideNav.providers": "Providers",
  "settings.sideNav.archive": "归档",
  "settings.sideNav.tokenUsage": "Token 统计",
  "settings.sideNav.appearance": "外观",
  "settings.sideNav.about": "关于",
  "settings.modal.close": "关闭设置",
  "settings.guard.providerRequired": "请先配置并启用至少一个大模型 Provider，方可使用 Cli-Switch"
}
```

`src/i18n/locales/en-US.json` add:

```json
{
  "settings.sideNav.providers": "Providers",
  "settings.sideNav.archive": "Archive",
  "settings.sideNav.tokenUsage": "Token Usage",
  "settings.sideNav.appearance": "Appearance",
  "settings.sideNav.about": "About",
  "settings.modal.close": "Close settings",
  "settings.guard.providerRequired": "Configure and enable at least one model provider before using Cli-Switch."
}
```

When editing JSON, merge these keys into the existing object; do not create duplicate top-level objects.

- [ ] **Step 4: Create Settings registration**

Create `src/pages/settings/settings.i18n.ts`:

```ts
import { registerMessages } from '../../i18n/renderer';
import { aboutMessages } from './about/locales';
import { appearanceMessages } from './appearance/locales';
import { archiveMessages } from './archive/locales';
import { providersMessages } from './providers/locales';
import { tokenUsageMessages } from './token-usage/locales';

export function registerSettingsI18n() {
  registerMessages('settings.appearance', appearanceMessages);
  registerMessages('settings.providers', providersMessages);
  registerMessages('settings.archive', archiveMessages);
  registerMessages('settings.about', aboutMessages);
  registerMessages('settings.tokenUsage', tokenUsageMessages);
}
```

- [ ] **Step 5: Add minimal empty bundle files for non-Appearance blocks**

Create `zh-CN.json` and `en-US.json` for providers, archive, about, and token-usage with `{}` as the initial content. Later tasks fill them before migrating each block.

- [ ] **Step 6: Register Settings messages from the app renderer entry**

Modify `src/app/register-page-renderer.tsx`:

```tsx
import { registerSettingsI18n } from '../pages/settings/settings.i18n';
```

Call it immediately after `registerGlobalI18n()`:

```tsx
registerGlobalI18n();
registerSettingsI18n();
```

- [ ] **Step 7: Run build**

Run:

```bash
pnpm build
```

Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/i18n/locales src/app/register-page-renderer.tsx src/pages/settings/settings.i18n.ts src/pages/settings/*/locales
git commit -m "feat: register settings i18n bundles"
```

---

### Task 5: Appearance Language Switching

**Files:**
- Modify: `src/pages/settings/appearance/renderer/use-appearance-settings.js`
- Modify: `src/pages/settings/appearance/renderer/AppearanceSettingsSection.jsx`
- Modify: `src/pages/settings/appearance/e2e/appearance.e2e.js`

- [ ] **Step 1: Extend E2E helper to read locale**

In `src/pages/settings/appearance/e2e/appearance.e2e.js`, replace `readAppearanceThemeMode()` with:

```js
function readAppearanceSettings(dbPath) {
  const db = new DatabaseSync(dbPath);
  try {
    const row = db
      .prepare("SELECT value FROM app_settings WHERE key = 'appearance_settings'")
      .get();
    if (!row?.value) return {};

    try {
      return JSON.parse(String(row.value)) || {};
    } catch {
      return {};
    }
  } finally {
    db.close();
  }
}

function readAppearanceThemeMode(dbPath) {
  return readAppearanceSettings(dbPath).themeMode || '';
}

function readAppearanceLocale(dbPath) {
  return readAppearanceSettings(dbPath).locale || '';
}
```

Add an E2E test:

```js
test('switches settings language and persists locale', async () => {
  const launched = await launchApp({
    cwd: path.resolve(__dirname, '../../../../../'),
    rootPrefix: 'cliswitch-locale-',
    projectDirName: 'locale-project',
    projectId: 'p-locale',
    projectName: 'LocaleProject',
    unsetEnvKeys: ['VITE_DEV_SERVER_URL'],
  });

  try {
    const { window: win } = launched;
    await win.getByRole('button', { name: 'Settings' }).click();
    await expect(win.locator('.settings-modal')).toBeVisible({ timeout: 90000 });
    await win.getByRole('tab', { name: 'Appearance' }).click();

    const panel = win.getByRole('tabpanel', { name: /Appearance|外观/ });
    await panel.getByTestId('appearance-locale-select').selectOption('en-US');
    await expect(win.getByRole('tab', { name: 'Token Usage' })).toBeVisible();
    await expect
      .poll(() => readAppearanceLocale(launched.dbPath), {
        message: 'appearance settings persist en-US locale',
        timeout: 30000,
      })
      .toBe('en-US');

    await panel.getByTestId('appearance-locale-select').selectOption('zh-CN');
    await expect(win.getByRole('tab', { name: 'Token 统计' })).toBeVisible();
    await expect
      .poll(() => readAppearanceLocale(launched.dbPath), {
        message: 'appearance settings persist zh-CN locale',
        timeout: 30000,
      })
      .toBe('zh-CN');
  } finally {
    await closeApp(launched);
  }
});
```

- [ ] **Step 2: Run E2E and verify it fails**

Run:

```bash
pnpm test:e2e -- --grep "@appearance|switches settings language"
```

Expected: fail because `appearance-locale-select` and language switching do not exist yet.

- [ ] **Step 3: Extend appearance hook**

Modify `src/pages/settings/appearance/renderer/use-appearance-settings.js`:

- Import `useI18n`:

```js
import { useI18n } from '../../../../i18n/use-t';
```

- Add locale values inside `useAppearanceSettings()`:

```js
  const { locale, setLocale, t } = useI18n();
  const [savingLocale, setSavingLocale] = useState(false);
```

- Add function before return:

```js
  const selectLocale = useCallback(
    async (nextLocale) => {
      const previousLocale = locale;
      setLocale(nextLocale);
      setSavingLocale(true);
      setSaveError('');
      setLastSavedMode(null);

      try {
        const currentSettings = await window.electronAPI.appearance.get();
        const savedSettings = await window.electronAPI.appearance.set({
          ...currentSettings,
          locale: nextLocale,
        });
        setLocale(savedSettings?.locale || nextLocale);
      } catch {
        setLocale(previousLocale);
        setSaveError(t('settings.appearance.saveLocaleFailed'));
      } finally {
        setSavingLocale(false);
      }
    },
    [locale, setLocale, t],
  );
```

- Ensure theme save preserves locale:

```js
        const currentSettings = await window.electronAPI.appearance.get();
        const savedSettings = await window.electronAPI.appearance.set({
          ...currentSettings,
          themeMode: normalizedThemeMode,
        });
```

- Return:

```js
    locale,
    savingLocale,
    selectLocale,
```

- [ ] **Step 4: Migrate Appearance component**

Modify `src/pages/settings/appearance/renderer/AppearanceSettingsSection.jsx`:

- Import `useT` if the hook return does not already expose `t`:

```js
import { useT } from '../../../../i18n/use-t';
```

- Replace `THEME_OPTIONS` with a function:

```js
function getThemeOptions(t) {
  return [
    {
      id: 'system',
      label: t('settings.appearance.theme.system.label'),
      description: t('settings.appearance.theme.system.description'),
      meta: 'System',
    },
    {
      id: 'dark',
      label: t('settings.appearance.theme.dark.label'),
      description: t('settings.appearance.theme.dark.description'),
      meta: 'Dark',
    },
    {
      id: 'light',
      label: t('settings.appearance.theme.light.label'),
      description: t('settings.appearance.theme.light.description'),
      meta: 'Light',
    },
  ];
}
```

- Add language select in the first card after theme radio group:

```jsx
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.035] p-3">
            <label className="grid gap-1 text-[13px] text-[var(--text-main)]">
              <span className="font-semibold">{t('settings.appearance.language')}</span>
              <span className="text-[12px] leading-5 text-[var(--text-muted)]">
                {t('settings.appearance.languageDescription')}
              </span>
              <select
                data-testid="appearance-locale-select"
                className="mt-2 h-8 rounded-lg border border-white/10 bg-[#15181D] px-3 text-[12px] text-[var(--text-main)]"
                disabled={savingLocale}
                value={locale}
                onChange={(event) => void selectLocale(event.target.value)}
              >
                <option value="zh-CN">{t('language.zhCN')}</option>
                <option value="en-US">{t('language.enUS')}</option>
              </select>
            </label>
          </div>
```

- Replace hardcoded Appearance text with keys from Task 4.

- [ ] **Step 5: Run appearance E2E**

Run:

```bash
pnpm test:e2e -- --grep "@appearance|switches settings language"
```

Expected: appearance theme and locale tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/pages/settings/appearance/renderer src/pages/settings/appearance/e2e/appearance.e2e.js
git commit -m "feat: add appearance locale switching"
```

---

### Task 6: Settings Shell Text Migration

**Files:**
- Modify: `src/pages/settings/SettingsModal.jsx`
- Modify: `src/pages/settings/SettingsSideNav.jsx`
- Modify: `src/pages/settings/SettingsPage.tsx`

- [ ] **Step 1: Add missing shell keys**

Ensure global locale files contain these keys:

`src/i18n/locales/zh-CN.json`:

```json
{
  "settings.section.providers.title": "Providers",
  "settings.section.providers.subtitle": "配置 AI Provider 的 API Key、OAuth 与环境变量。",
  "settings.section.providers.oauthSubtitle": "配置 AI Provider 的 OAuth 认证。",
  "settings.section.archive.title": "归档",
  "settings.section.archive.subtitle": "管理已归档会话并恢复历史记录。",
  "settings.section.tokenUsage.title": "Token 统计",
  "settings.section.tokenUsage.subtitle": "按项目、Provider、模型和运行段查看 token 使用量。",
  "settings.section.about.title": "关于",
  "settings.section.about.subtitle": "应用详情与系统信息。",
  "settings.page.back": "返回主页"
}
```

`src/i18n/locales/en-US.json`:

```json
{
  "settings.section.providers.title": "Providers",
  "settings.section.providers.subtitle": "Configure API keys, OAuth, and environment variables for AI providers.",
  "settings.section.providers.oauthSubtitle": "Configure OAuth authentication for AI providers.",
  "settings.section.archive.title": "Archive",
  "settings.section.archive.subtitle": "Manage archived sessions and restore history.",
  "settings.section.tokenUsage.title": "Token Usage",
  "settings.section.tokenUsage.subtitle": "Review token usage by project, provider, model, and run segment.",
  "settings.section.about.title": "About",
  "settings.section.about.subtitle": "Application details and system information.",
  "settings.page.back": "Back to home"
}
```

- [ ] **Step 2: Migrate `SettingsSideNav`**

Add import:

```jsx
import { useT } from '../../i18n/use-t';
```

Inside `SettingsSideNav()`:

```jsx
  const t = useT();
```

Replace nav labels:

```jsx
{t('settings.sideNav.providers')}
{t('settings.sideNav.archive')}
{t('settings.sideNav.tokenUsage')}
{t('settings.sideNav.appearance')}
{t('settings.sideNav.about')}
```

- [ ] **Step 3: Migrate `SettingsModal`**

Add import:

```jsx
import { useT } from '../../i18n/use-t';
```

Inside `SettingsModal()`:

```jsx
  const t = useT();
```

Replace `headerMeta` titles and subtitles with `t()` calls:

```jsx
title: t('settings.section.about.title'),
subtitle: t('settings.section.about.subtitle'),
```

Use:

```jsx
aria-label={t('settings.modal.close')}
```

Replace guard banner:

```jsx
{t('settings.guard.providerRequired')}
```

- [ ] **Step 4: Migrate `SettingsPage`**

Add import:

```tsx
import { useT } from '../../i18n/use-t';
```

Inside `SettingsPage()`:

```tsx
  const t = useT();
```

Update `SettingsSection` type to include `appearance` if this standalone page needs parity with modal:

```ts
type SettingsSection = 'providers' | 'archive' | 'token-usage' | 'appearance' | 'about';
```

Replace header title, back labels, and nav labels with `t()`.

- [ ] **Step 5: Run build and appearance E2E list**

Run:

```bash
pnpm build
pnpm test:e2e --list
```

Expected: build succeeds and E2E collection succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/i18n/locales src/pages/settings/SettingsModal.jsx src/pages/settings/SettingsSideNav.jsx src/pages/settings/SettingsPage.tsx
git commit -m "feat: localize settings shell"
```

---

### Task 7: Archive and About Text Migration

**Files:**
- Modify: `src/pages/settings/archive/locales/zh-CN.json`
- Modify: `src/pages/settings/archive/locales/en-US.json`
- Modify: `src/pages/settings/archive/renderer/ArchiveSettingsSection.jsx`
- Modify: `src/pages/settings/about/locales/zh-CN.json`
- Modify: `src/pages/settings/about/locales/en-US.json`
- Modify: `src/pages/settings/about/renderer/AboutSettingsSection.jsx`

- [ ] **Step 1: Fill archive locale keys**

`src/pages/settings/archive/locales/zh-CN.json`:

```json
{
  "settings.archive.title": "已归档会话",
  "settings.archive.description": "一键清理只会删除归档超过 30 天的 provider 原始会话文件和数据库记录。",
  "settings.archive.cleanup": "一键清理",
  "settings.archive.cleaning": "清理中...",
  "settings.archive.cleanupFailed": "归档清理失败",
  "settings.archive.cleanupResult": "已清理 {deletedRecords} 条过期归档，删除 {deletedFiles} 个原始会话文件",
  "settings.archive.cleanupMissingFiles": "，{missingFiles} 个文件已不存在",
  "settings.archive.cleanupSkipped": "，跳过 {skipped} 条",
  "settings.archive.empty": "暂无已归档会话。"
}
```

`src/pages/settings/archive/locales/en-US.json`:

```json
{
  "settings.archive.title": "Archived Sessions",
  "settings.archive.description": "One-click cleanup only removes provider session files and database records archived for more than 30 days.",
  "settings.archive.cleanup": "Clean up",
  "settings.archive.cleaning": "Cleaning...",
  "settings.archive.cleanupFailed": "Archive cleanup failed",
  "settings.archive.cleanupResult": "Cleaned {deletedRecords} expired archive records and deleted {deletedFiles} original session files",
  "settings.archive.cleanupMissingFiles": ", {missingFiles} files were already missing",
  "settings.archive.cleanupSkipped": ", skipped {skipped}",
  "settings.archive.empty": "No archived sessions yet."
}
```

- [ ] **Step 2: Migrate archive component**

Import:

```jsx
import { useT } from '../../../../i18n/use-t';
```

Inside component:

```jsx
  const t = useT();
```

Build cleanup message with `t()`:

```jsx
  const cleanupMessage = archiveCleanupResult
    ? archiveCleanupResult.ok === false
      ? archiveCleanupResult.message || t('settings.archive.cleanupFailed')
      : `${t('settings.archive.cleanupResult', {
          deletedRecords: archiveCleanupResult.deletedRecords || 0,
          deletedFiles: archiveCleanupResult.deletedFiles || 0,
        })}${
          archiveCleanupResult.missingFiles
            ? t('settings.archive.cleanupMissingFiles', {
                missingFiles: archiveCleanupResult.missingFiles,
              })
            : ''
        }${
          archiveCleanupResult.skipped
            ? t('settings.archive.cleanupSkipped', { skipped: archiveCleanupResult.skipped })
            : ''
        }。`
    : '';
```

Replace static labels with archive keys and `common.restore`.

- [ ] **Step 3: Fill about locale keys**

`src/pages/settings/about/locales/zh-CN.json`:

```json
{
  "settings.about.tagline": "在多个 AI 编码助手之间无缝切换。",
  "settings.about.platform": "平台",
  "settings.about.terminalCore": "终端核心",
  "settings.about.storage": "存储",
  "settings.about.version": "版本",
  "settings.about.appData": "应用数据",
  "settings.about.cleanRuntimeData": "一键清理",
  "settings.about.cleaning": "清理中...",
  "settings.about.cleanFailed": "运行数据清理失败",
  "settings.about.cleanSuccess": "运行数据已清理完成",
  "settings.about.checkUpdates": "检查更新",
  "settings.about.documentation": "文档",
  "settings.about.github": "GitHub",
  "settings.about.confirmCleanTitle": "确认清理运行数据",
  "settings.about.confirmCleanDescription": "这会清理本地运行数据库和缓存文件（正式环境通常位于 ~/.cli-switch，开发环境通常位于 ~/.cli-switch-dev），该操作不可撤销。",
  "settings.about.continueClean": "继续清理"
}
```

`src/pages/settings/about/locales/en-US.json`:

```json
{
  "settings.about.tagline": "Seamlessly switch between AI coding assistants.",
  "settings.about.platform": "Platform",
  "settings.about.terminalCore": "Terminal Core",
  "settings.about.storage": "Storage",
  "settings.about.version": "Version",
  "settings.about.appData": "App Data",
  "settings.about.cleanRuntimeData": "Clean up",
  "settings.about.cleaning": "Cleaning...",
  "settings.about.cleanFailed": "Failed to clean runtime data",
  "settings.about.cleanSuccess": "Runtime data cleanup completed",
  "settings.about.checkUpdates": "Check for Updates",
  "settings.about.documentation": "Documentation",
  "settings.about.github": "GitHub",
  "settings.about.confirmCleanTitle": "Clean runtime data?",
  "settings.about.confirmCleanDescription": "This removes the local runtime database and cache files. Production data usually lives in ~/.cli-switch and development data usually lives in ~/.cli-switch-dev. This action cannot be undone.",
  "settings.about.continueClean": "Continue cleanup"
}
```

- [ ] **Step 4: Migrate about component**

Import `useT`, call `const t = useT();`, and replace all user-visible static labels with about keys. Replace runtime cleanup fallback errors:

```js
throw new Error(result?.message || t('settings.about.cleanFailed'));
```

Set success message:

```js
message: t('settings.about.cleanSuccess'),
```

- [ ] **Step 5: Run build**

Run:

```bash
pnpm build
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/pages/settings/archive src/pages/settings/about
git commit -m "feat: localize archive and about settings"
```

---

### Task 8: Token Usage Text and Formatting Migration

**Files:**
- Modify: `src/pages/settings/token-usage/locales/zh-CN.json`
- Modify: `src/pages/settings/token-usage/locales/en-US.json`
- Modify: `src/pages/settings/token-usage/renderer/TokenUsageSettingsSection.jsx`

- [ ] **Step 1: Fill token usage locale keys**

`src/pages/settings/token-usage/locales/zh-CN.json`:

```json
{
  "settings.tokenUsage.title": "Token 统计",
  "settings.tokenUsage.description": "只统计当前数据库已登记的项目与会话，模型按运行段快照归属。",
  "settings.tokenUsage.syncing": "同步中...",
  "settings.tokenUsage.lastSync": "上次同步：{time}",
  "settings.tokenUsage.scan": "重新扫描",
  "settings.tokenUsage.scanning": "扫描中...",
  "settings.tokenUsage.filters": "Token 使用筛选",
  "settings.tokenUsage.project": "项目",
  "settings.tokenUsage.provider": "Provider",
  "settings.tokenUsage.profile": "Profile",
  "settings.tokenUsage.time": "时间",
  "settings.tokenUsage.selectProject": "选择项目",
  "settings.tokenUsage.noProjects": "暂无项目",
  "settings.tokenUsage.selectProvider": "选择 Provider",
  "settings.tokenUsage.noProviders": "暂无 Provider",
  "settings.tokenUsage.selectProfile": "选择 Profile",
  "settings.tokenUsage.noProfiles": "暂无 Profile",
  "settings.tokenUsage.range7d": "最近 7 天",
  "settings.tokenUsage.range30d": "最近 30 天",
  "settings.tokenUsage.rangeAll": "全部时间",
  "settings.tokenUsage.totalTokens": "总 Token",
  "settings.tokenUsage.input": "输入",
  "settings.tokenUsage.output": "输出",
  "settings.tokenUsage.cache": "缓存",
  "settings.tokenUsage.reasoning": "Reasoning",
  "settings.tokenUsage.rounds": "轮次",
  "settings.tokenUsage.runCount": "{count} 个运行段",
  "settings.tokenUsage.sessionCount": "{count} 个会话",
  "settings.tokenUsage.dailyTrend": "日趋势",
  "settings.tokenUsage.byLastActiveDate": "按最后活跃日期归属",
  "settings.tokenUsage.loading": "加载中...",
  "settings.tokenUsage.empty": "暂无 token 使用数据。"
}
```

`src/pages/settings/token-usage/locales/en-US.json`:

```json
{
  "settings.tokenUsage.title": "Token Usage",
  "settings.tokenUsage.description": "Counts projects and sessions recorded in the current database. Models are attributed by run segment snapshots.",
  "settings.tokenUsage.syncing": "Syncing...",
  "settings.tokenUsage.lastSync": "Last sync: {time}",
  "settings.tokenUsage.scan": "Rescan",
  "settings.tokenUsage.scanning": "Scanning...",
  "settings.tokenUsage.filters": "Token usage filters",
  "settings.tokenUsage.project": "Project",
  "settings.tokenUsage.provider": "Provider",
  "settings.tokenUsage.profile": "Profile",
  "settings.tokenUsage.time": "Time",
  "settings.tokenUsage.selectProject": "Select project",
  "settings.tokenUsage.noProjects": "No projects",
  "settings.tokenUsage.selectProvider": "Select provider",
  "settings.tokenUsage.noProviders": "No providers",
  "settings.tokenUsage.selectProfile": "Select profile",
  "settings.tokenUsage.noProfiles": "No profiles",
  "settings.tokenUsage.range7d": "Last 7 days",
  "settings.tokenUsage.range30d": "Last 30 days",
  "settings.tokenUsage.rangeAll": "All time",
  "settings.tokenUsage.totalTokens": "Total Tokens",
  "settings.tokenUsage.input": "Input",
  "settings.tokenUsage.output": "Output",
  "settings.tokenUsage.cache": "Cache",
  "settings.tokenUsage.reasoning": "Reasoning",
  "settings.tokenUsage.rounds": "Rounds",
  "settings.tokenUsage.runCount": "{count} run segments",
  "settings.tokenUsage.sessionCount": "{count} sessions",
  "settings.tokenUsage.dailyTrend": "Daily Trend",
  "settings.tokenUsage.byLastActiveDate": "By last active date",
  "settings.tokenUsage.loading": "Loading...",
  "settings.tokenUsage.empty": "No token usage data yet."
}
```

- [ ] **Step 2: Replace local formatters with i18n formatters**

In `TokenUsageSettingsSection.jsx`, import:

```jsx
import { formatDateLabel, formatDateTime, formatNumber, formatTokenCount } from '../../../../i18n/format';
import { useI18n } from '../../../../i18n/use-t';
```

Remove local `formatCount`, `formatTokenValue`, `formatDateLabel`, and `formatDateTime` functions.

Inside component:

```jsx
  const { locale, t } = useI18n();
  const formatCount = (value) => formatNumber(value, locale);
  const formatTokenValue = (value) => formatTokenCount(value, locale);
```

Replace calls to `formatDateTime(status.lastFinishedAt)` with:

```jsx
t('settings.tokenUsage.lastSync', { time: formatDateTime(status.lastFinishedAt, locale) })
```

Replace calls to `formatDateLabel(item.date)` with:

```jsx
formatDateLabel(item.date, locale)
```

- [ ] **Step 3: Migrate static text**

Replace all hardcoded user-visible token usage text with keys from Step 1. Keep provider/model/project names dynamic and untranslated.

- [ ] **Step 4: Run build**

Run:

```bash
pnpm build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/pages/settings/token-usage
git commit -m "feat: localize token usage settings"
```

---

### Task 9: Provider Settings Text Migration

**Files:**
- Modify: `src/pages/settings/providers/locales/zh-CN.json`
- Modify: `src/pages/settings/providers/locales/en-US.json`
- Modify: `src/pages/settings/providers/renderer/ProviderSettingsSection.jsx`

- [ ] **Step 1: Fill provider locale keys**

`src/pages/settings/providers/locales/zh-CN.json`:

```json
{
  "settings.providers.title": "Provider Settings",
  "settings.providers.addProvider": "+ 新增供应商",
  "settings.providers.enabled": "已启用",
  "settings.providers.default": "默认",
  "settings.providers.providerName": "供应商名称",
  "settings.providers.setDefault": "设为默认",
  "settings.providers.deleteProvider": "删除供应商",
  "settings.providers.oauthLogin": "OAuth 登录",
  "settings.providers.envVars": "环境变量（启动时预设和自定义环境变量）",
  "settings.providers.cliOAuthLogin": "使用 CLI OAuth 登录",
  "settings.providers.getOAuthUrl": "获取 OAuth 登录链接",
  "settings.providers.googleOAuth": "一、Google OAuth 鉴权",
  "settings.providers.openUrl": "点击浏览器打开 URL",
  "settings.providers.geminiCode": "二、填写 Google OAuth 验证码",
  "settings.providers.geminiCodePlaceholder": "粘贴 Gemini 页面显示的 authorization code",
  "settings.providers.submitCode": "提交验证码",
  "settings.providers.noPresetKeys": "当前 Provider 暂无预设键名。",
  "settings.providers.key": "键名",
  "settings.providers.value": "值",
  "settings.providers.addEnv": "+ 添加环境变量",
  "settings.providers.proxy": "代理",
  "settings.providers.proxyUrl": "代理地址",
  "settings.providers.testConnection": "测试连接",
  "settings.providers.testing": "测试中...",
  "settings.providers.save": "保存设置",
  "settings.providers.saved": "已保存",
  "settings.providers.saveFailed": "保存失败"
}
```

`src/pages/settings/providers/locales/en-US.json`:

```json
{
  "settings.providers.title": "Provider Settings",
  "settings.providers.addProvider": "+ Add provider",
  "settings.providers.enabled": "Enabled",
  "settings.providers.default": "Default",
  "settings.providers.providerName": "Provider name",
  "settings.providers.setDefault": "Set default",
  "settings.providers.deleteProvider": "Delete provider",
  "settings.providers.oauthLogin": "OAuth login",
  "settings.providers.envVars": "Environment variables (startup presets and custom variables)",
  "settings.providers.cliOAuthLogin": "Use CLI OAuth login",
  "settings.providers.getOAuthUrl": "Get OAuth login URL",
  "settings.providers.googleOAuth": "1. Google OAuth authorization",
  "settings.providers.openUrl": "Open URL in browser",
  "settings.providers.geminiCode": "2. Enter Google OAuth verification code",
  "settings.providers.geminiCodePlaceholder": "Paste the authorization code shown on the Gemini page",
  "settings.providers.submitCode": "Submit code",
  "settings.providers.noPresetKeys": "This provider has no preset key names.",
  "settings.providers.key": "Key",
  "settings.providers.value": "Value",
  "settings.providers.addEnv": "+ Add environment variable",
  "settings.providers.proxy": "Proxy",
  "settings.providers.proxyUrl": "Proxy URL",
  "settings.providers.testConnection": "Test connection",
  "settings.providers.testing": "Testing...",
  "settings.providers.save": "Save settings",
  "settings.providers.saved": "Saved",
  "settings.providers.saveFailed": "Save failed"
}
```

- [ ] **Step 2: Migrate provider component**

Import:

```jsx
import { useT } from '../../../../i18n/use-t';
```

Inside component:

```jsx
  const t = useT();
```

Replace the known labels from Step 1. For hardcoded text not covered by the Step 1 list, add a key under `settings.providers.*` in both locale files before replacing it. Do not translate provider names such as `Claude Code`, `Codex CLI`, `Gemini CLI`.

- [ ] **Step 3: Verify no remaining Chinese/English UI literals in provider component**

Run:

```bash
rg -n "新增|供应商|已启用|默认|环境变量|OAuth|验证码|保存|测试|Provider Settings|Test connection|Save settings" src/pages/settings/providers/renderer/ProviderSettingsSection.jsx
```

Expected: matches are either translation keys, provider names, comments, or dynamic values. No raw user-visible labels remain.

- [ ] **Step 4: Run build**

Run:

```bash
pnpm build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/pages/settings/providers
git commit -m "feat: localize provider settings"
```

---

### Task 10: Main i18n and Locale Synchronization

**Files:**
- Create: `src/i18n/main.js`
- Modify: `src/pages/settings/appearance/main/appearance.ipc.js`

- [ ] **Step 1: Create main i18n module**

Create `src/i18n/main.js`:

```js
const DEFAULT_LOCALE = 'zh-CN';
const supportedLocales = new Set(['zh-CN', 'en-US']);

const messages = {
  'zh-CN': {
    'main.settings.appearanceUnavailable': '外观设置不可用',
  },
  'en-US': {
    'main.settings.appearanceUnavailable': 'Appearance settings are unavailable',
  },
};

let currentLocale = DEFAULT_LOCALE;

function normalizeLocale(locale) {
  return supportedLocales.has(locale) ? locale : DEFAULT_LOCALE;
}

function setMainLocale(locale) {
  currentLocale = normalizeLocale(locale);
}

function getMainLocale() {
  return currentLocale;
}

function t(key, params = {}) {
  let text = messages[currentLocale]?.[key] || messages[DEFAULT_LOCALE]?.[key] || key;
  for (const [name, value] of Object.entries(params)) {
    text = text.replaceAll(`{${name}}`, String(value ?? ''));
  }
  return text;
}

module.exports = {
  getMainLocale,
  normalizeLocale,
  setMainLocale,
  t,
};
```

- [ ] **Step 2: Sync main locale after appearance get/set**

Modify `src/pages/settings/appearance/main/appearance.ipc.js`:

```js
const { setMainLocale, t } = require('../../../../i18n/main');
```

Replace unavailable reason:

```js
reason: t('main.settings.appearanceUnavailable'),
```

For get:

```js
  registerIpc(APPEARANCE_CHANNELS.APPEARANCE_GET, async () => {
    const settings = appSettingsStore.getAppearanceSettings();
    setMainLocale(settings?.locale);
    return settings;
  });
```

For set:

```js
  registerIpc(APPEARANCE_CHANNELS.APPEARANCE_SET, async (_event, payload) => {
    const settings = appSettingsStore.setAppearanceSettings(payload);
    setMainLocale(settings?.locale);
    return settings;
  });
```

- [ ] **Step 3: Run architecture check and build**

Run:

```bash
node scripts/check-architecture.js
pnpm build
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/main.js src/pages/settings/appearance/main/appearance.ipc.js
git commit -m "feat: sync main i18n locale"
```

---

### Task 11: Architecture Guard and Key Consistency Tests

**Files:**
- Modify: `scripts/check-architecture.js`
- Modify: `src/i18n/i18n.registry.test.js`

- [ ] **Step 1: Add global key consistency test**

Append to `src/i18n/i18n.registry.test.js`:

```js
const enUSGlobalMessages = require('./locales/en-US.json');
const zhCNGlobalMessages = require('./locales/zh-CN.json');

test('global zh-CN and en-US locale files contain the same keys', () => {
  assert.deepEqual(
    Object.keys(enUSGlobalMessages).sort(),
    Object.keys(zhCNGlobalMessages).sort(),
  );
});
```

- [ ] **Step 2: Add architecture checks**

In `scripts/check-architecture.js`, add after `resolveImportPath()`:

```js
function sameSettingsBlock(ownerRelativePath, targetRelativePath) {
  const owner = ownerRelativePath.match(/^src\/pages\/settings\/([^/]+)\//)?.[1];
  const target = targetRelativePath.match(/^src\/pages\/settings\/([^/]+)\//)?.[1];
  return owner && target && owner === target;
}
```

Inside the import loop:

```js
    if (relative.startsWith('src/i18n/') && resolved.startsWith('src/pages/')) {
      violations.push(`${relative}: src/i18n must not import page or block implementation`);
    }

    if (
      resolved.includes('/locales') &&
      resolved.startsWith('src/pages/settings/') &&
      relative.startsWith('src/pages/settings/') &&
      !sameSettingsBlock(relative, resolved) &&
      relative !== 'src/pages/settings/settings.i18n.ts'
    ) {
      violations.push(
        `${relative}: settings block locale imports must stay inside the owning block or settings.i18n.ts`,
      );
    }
```

- [ ] **Step 3: Run tests and guard**

Run:

```bash
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron --test src/i18n/i18n.registry.test.js src/i18n/format.test.js
node scripts/check-architecture.js
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add scripts/check-architecture.js src/i18n/i18n.registry.test.js
git commit -m "test: guard i18n boundaries"
```

---

### Task 12: Final Verification

**Files:**
- No new files. This task verifies the whole branch.

- [ ] **Step 1: Run required commands**

Run:

```bash
nvm use .nvmrc
pnpm build
pnpm test
node scripts/check-architecture.js
pnpm test:e2e --list
```

Expected:

- `pnpm build` succeeds.
- `pnpm test` succeeds, including i18n and settings repository tests.
- architecture check prints `[architecture] ok`.
- E2E list command exits 0 and collects page/block E2E files.

- [ ] **Step 2: Run targeted appearance E2E**

Run:

```bash
pnpm test:e2e -- --grep "@appearance|switches settings language"
```

Expected: Appearance theme and locale switching tests pass.

- [ ] **Step 3: Inspect worktree**

Run:

```bash
git status --short
```

Expected: only intentional i18n implementation files are modified or added. Do not revert unrelated existing changes.

- [ ] **Step 4: Commit final verification note if needed**

If final fixes were needed during verification:

```bash
git add <changed-files>
git commit -m "chore: finalize settings i18n migration"
```

If no fixes were needed, do not create an empty commit.
