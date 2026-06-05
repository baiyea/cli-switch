import { useMemo } from 'react';

import { registerMessages } from '../../../../i18n/renderer';
import { useT } from '../../../../i18n/use-t';
import { appearanceMessages } from '../locales';
import { useAppearanceSettings } from './use-appearance-settings';

registerMessages('settings.appearance', appearanceMessages);

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

function TerminalPreview({ variant, active }) {
  return (
    <div
      className={`appearance-terminal-preview appearance-terminal-preview--${variant} rounded-xl border p-3 shadow-[0_18px_60px_rgba(0,0,0,0.18)] ${active ? 'is-active' : ''}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="appearance-window-dot appearance-window-dot--close h-2.5 w-2.5 rounded-full" />
          <span className="appearance-window-dot appearance-window-dot--minimize h-2.5 w-2.5 rounded-full" />
          <span className="appearance-window-dot appearance-window-dot--maximize h-2.5 w-2.5 rounded-full" />
        </div>
        <span className="appearance-terminal-muted text-[11px] uppercase tracking-[0.18em]">
          {variant}
        </span>
      </div>
      <div className="space-y-1.5 font-mono text-[12px] leading-5">
        <div>
          <span className="appearance-terminal-prompt">cli-switch</span>
          <span className="appearance-terminal-muted"> ~/workspace </span>
          <span>pnpm dev</span>
        </div>
        <div>
          <span className="appearance-terminal-accent">vite</span>
          <span className="appearance-terminal-muted"> renderer ready on </span>
          <span>5073</span>
        </div>
        <div>
          <span className="appearance-terminal-muted">terminal </span>
          <span>theme preview active</span>
        </div>
      </div>
    </div>
  );
}

export function AppearanceSettingsSection() {
  const t = useT();
  const {
    effectiveTheme,
    lastSavedMode,
    locale,
    saveError,
    savingLocale,
    savingMode,
    selectLocale,
    selectThemeMode,
    themeMode,
  } = useAppearanceSettings();
  const themeOptions = useMemo(() => getThemeOptions(t), [locale, t]);
  const saving = Boolean(savingMode || savingLocale);

  const statusText = saveError
    ? t('common.failed')
    : saving
      ? t('common.saving')
      : lastSavedMode
        ? t('common.saved')
        : t('common.synced');

  const effectiveThemeName =
    effectiveTheme === 'dark'
      ? t('settings.appearance.theme.dark.name')
      : t('settings.appearance.theme.light.name');

  return (
    <div className="appearance-settings-section h-full px-6 py-5">
      <div className="mx-auto flex max-w-[760px] flex-col gap-5">
        <section className="appearance-card rounded-2xl border p-4">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="appearance-title text-[15px] font-semibold">
                {t('settings.appearance.themeMode')}
              </h2>
              <p className="appearance-subtitle mt-1 text-[13px] leading-5">
                {t('settings.appearance.themeDescription')}
              </p>
            </div>
            <div className="appearance-status shrink-0 rounded-full border px-2.5 py-1 text-[12px]">
              {statusText}
            </div>
          </div>

          <div
            className="space-y-2"
            role="radiogroup"
            aria-label={t('settings.appearance.themeMode')}
          >
            {themeOptions.map((option) => {
              const active = themeMode === option.id;
              const saving = savingMode === option.id;

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => void selectThemeMode(option.id)}
                  className={`appearance-option flex w-full items-center justify-between gap-4 rounded-xl border px-3.5 py-3 text-left transition-colors duration-150 ${active ? 'is-active' : ''}`}
                  role="radio"
                  aria-checked={active}
                  aria-label={option.label}
                >
                  <span className="min-w-0">
                    <span className="appearance-option-label block text-[14px] font-medium">
                      {option.label}
                    </span>
                    <span className="appearance-option-description mt-1 block text-[12px] leading-5">
                      {option.description}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="appearance-option-meta text-[11px] uppercase tracking-[0.18em]">
                      {saving ? t('common.saving') : option.meta}
                    </span>
                    <span
                      className="appearance-option-indicator h-2.5 w-2.5 rounded-full"
                      aria-hidden="true"
                    />
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 rounded-xl border px-3.5 py-3">
            <label
              className="appearance-option-label block text-[14px] font-medium"
              htmlFor="appearance-locale-select"
            >
              {t('settings.appearance.language')}
            </label>
            <p className="appearance-option-description mt-1 text-[12px] leading-5">
              {t('settings.appearance.languageDescription')}
            </p>
            <select
              id="appearance-locale-select"
              data-testid="appearance-locale-select"
              className="mt-3 w-full rounded-lg border bg-transparent px-3 py-2 text-[13px]"
              value={locale}
              disabled={Boolean(savingLocale)}
              onChange={(event) => void selectLocale(event.target.value)}
            >
              <option value="zh-CN">{t('language.zhCN')}</option>
              <option value="en-US">{t('language.enUS')}</option>
            </select>
          </div>

          {saveError && (
            <div className="appearance-error mt-3 rounded-xl border px-3 py-2 text-[12px] leading-5">
              {saveError}
            </div>
          )}
        </section>

        <section className="appearance-card appearance-card--preview rounded-2xl border p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="appearance-title text-[13px] font-semibold">
                {t('settings.appearance.previewTitle')}
              </h3>
              <p className="appearance-subtitle mt-1 text-[12px]">
                {t('settings.appearance.previewCurrent')}: {effectiveThemeName}
              </p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <TerminalPreview variant="dark" active={effectiveTheme === 'dark'} />
            <TerminalPreview variant="light" active={effectiveTheme === 'light'} />
          </div>
        </section>
      </div>
    </div>
  );
}
