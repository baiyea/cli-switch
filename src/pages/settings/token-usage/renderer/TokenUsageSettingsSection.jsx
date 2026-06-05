import { RefreshCcw } from 'lucide-react';

import {
  formatDateLabel,
  formatDateTime,
  formatNumber,
  formatTokenCount,
} from '../../../../i18n/format.renderer';
import { useI18n } from '../../../../i18n/use-t';
import { Button } from '../../../../ui/button';
import { useTokenUsage } from './use-token-usage';

function MetricCard({ label, value, hint, formatter }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-3">
      <div className="mb-2 text-[11px] text-[var(--text-muted)]">{label}</div>
      <strong className="block text-[18px] leading-none text-[var(--text-main)]">
        {formatter ? formatter(value) : value}
      </strong>
      {hint ? <div className="mt-2 text-[11px] text-[var(--text-muted)]">{hint}</div> : null}
    </div>
  );
}

function SelectButton({ children, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-[31px] rounded-lg border px-3 text-[12px] transition-colors duration-150 ${
        active
          ? 'border-[#3D4D72] bg-[#3D4D72] text-white'
          : 'border-white/10 bg-white/[0.055] text-[var(--text-muted)] hover:bg-white/[0.08] hover:text-[var(--text-main)]'
      }`}
    >
      {children}
    </button>
  );
}

function FilterField({ label, children }) {
  return (
    <label className="grid min-w-[150px] gap-1 text-[11px] text-[var(--text-muted)]">
      <span>{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ children }) {
  return (
    <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.025] px-3 py-6 text-center text-[12px] text-[var(--text-muted)]">
      {children}
    </div>
  );
}

export function TokenUsageSettingsSection() {
  const { locale, t } = useI18n();
  const {
    filters,
    setFilters,
    summary,
    projectOptions,
    providerOptions,
    profileOptions,
    loading,
    refreshing,
    error,
    refresh,
  } = useTokenUsage();
  const totals = summary?.totals || {};
  const daily = Array.isArray(summary?.daily) ? summary.daily : [];
  const models = Array.isArray(summary?.models) ? summary.models : [];
  const status = summary?.status || {};
  const isRefreshing = refreshing || Boolean(status.running);
  const maxDaily = Math.max(1, ...daily.map((item) => Number(item?.totalTokens || 0)));
  const selectClassName =
    'h-[31px] rounded-lg border border-white/10 bg-[#15181D] px-3 text-[12px] text-[var(--text-muted)] outline-none transition-colors duration-150 hover:text-[var(--text-main)] disabled:cursor-not-allowed disabled:opacity-55';
  const formatCount = (value) => formatNumber(value, locale);
  const formatTokenValue = (value) => formatTokenCount(value, locale);
  const rangeOptions = [
    ['7d', t('settings.tokenUsage.range7d')],
    ['30d', t('settings.tokenUsage.range30d')],
    ['all', t('settings.tokenUsage.rangeAll')],
  ];
  const unknownLabel = t('settings.tokenUsage.unknown');

  return (
    <div className="space-y-3 pb-4 text-[var(--text-main)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-bold leading-tight text-[var(--text-main)]">
            {t('settings.tokenUsage.title')}
          </h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {t('settings.tokenUsage.description')}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="rounded-lg border border-white/10 bg-white/[0.045] px-2.5 py-1.5 text-[12px] text-[var(--text-muted)]">
            {isRefreshing
              ? t('settings.tokenUsage.syncing')
              : t('settings.tokenUsage.lastSync', {
                  time: formatDateTime(status.lastFinishedAt, locale),
                })}
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 shrink-0 gap-2 rounded-lg border border-white/10 bg-white/[0.08] px-[14px] text-[13px] font-medium text-[#EDEDEF] transition-opacity duration-150 hover:bg-white/[0.12]"
            disabled={refreshing}
            onClick={() => refresh({ force: true })}
          >
            <RefreshCcw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            {isRefreshing ? t('settings.tokenUsage.scanning') : t('settings.tokenUsage.scan')}
          </Button>
        </div>
      </div>

      <div
        aria-label={t('settings.tokenUsage.filters')}
        role="group"
        className="flex flex-wrap items-end gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2"
      >
        <FilterField label={t('settings.tokenUsage.project')}>
          <select
            aria-label={t('settings.tokenUsage.project')}
            className={selectClassName}
            disabled={!projectOptions.length}
            value={filters.projectId || ''}
            onChange={(event) => {
              const projectId = event.target.value;
              setFilters((prev) =>
                prev.projectId === projectId
                  ? prev
                  : { ...prev, projectId, provider: '', profileId: '', modelName: '' },
              );
            }}
          >
            <option value="">
              {projectOptions.length
                ? t('settings.tokenUsage.selectProject')
                : t('settings.tokenUsage.noProjects')}
            </option>
            {projectOptions.map((project) => (
              <option key={project.value} value={project.value}>
                {project.label}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label={t('settings.tokenUsage.provider')}>
          <select
            aria-label={t('settings.tokenUsage.provider')}
            className={selectClassName}
            disabled={!filters.projectId || !providerOptions.length}
            value={filters.provider || ''}
            onChange={(event) => {
              const provider = event.target.value;
              setFilters((prev) =>
                prev.provider === provider ? prev : { ...prev, provider, profileId: '', modelName: '' },
              );
            }}
          >
            <option value="">
              {providerOptions.length
                ? t('settings.tokenUsage.selectProvider')
                : t('settings.tokenUsage.noProviders')}
            </option>
            {providerOptions.map((provider) => (
              <option key={provider.value} value={provider.value}>
                {provider.label}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label={t('settings.tokenUsage.profile')}>
          <select
            aria-label={t('settings.tokenUsage.profile')}
            className={`${selectClassName} min-w-[190px]`}
            disabled={!filters.provider || !profileOptions.length}
            value={filters.profileId || ''}
            onChange={(event) => {
              const profileId = event.target.value;
              setFilters((prev) =>
                prev.profileId === profileId ? prev : { ...prev, profileId, modelName: '' },
              );
            }}
          >
            <option value="">
              {profileOptions.length
                ? t('settings.tokenUsage.selectProfile')
                : t('settings.tokenUsage.noProfiles')}
            </option>
            {profileOptions.map((profile) => (
              <option key={profile.value} value={profile.value}>
                {profile.label}
              </option>
            ))}
          </select>
        </FilterField>

        <div className="grid gap-1 text-[11px] text-[var(--text-muted)]">
          <span>{t('settings.tokenUsage.time')}</span>
          <div className="flex flex-wrap gap-2">
            {rangeOptions.map(([range, label]) => (
              <SelectButton
                key={range}
                active={filters.range === range}
                onClick={() =>
                  setFilters((prev) => (prev.range === range ? prev : { ...prev, range, modelName: '' }))
                }
              >
                {label}
              </SelectButton>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-[#f6a3ad]/30 bg-[#f6a3ad]/10 px-3 py-2 text-xs text-[#f6a3ad]">
          {error}
        </div>
      ) : null}
      {loading ? (
        <div className="text-xs text-[var(--text-muted)]">{t('settings.tokenUsage.loading')}</div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
        <MetricCard
          label={t('settings.tokenUsage.totalTokens')}
          value={totals.totalTokens}
          hint={t('settings.tokenUsage.runCount', { count: formatCount(totals.runCount) })}
          formatter={formatTokenValue}
        />
        <MetricCard
          label={t('settings.tokenUsage.input')}
          value={totals.inputTokens}
          formatter={formatTokenValue}
        />
        <MetricCard
          label={t('settings.tokenUsage.output')}
          value={totals.outputTokens}
          formatter={formatTokenValue}
        />
        <MetricCard
          label={t('settings.tokenUsage.cache')}
          value={totals.cachedTokens}
          formatter={formatTokenValue}
        />
        <MetricCard
          label={t('settings.tokenUsage.reasoning')}
          value={totals.reasoningTokens}
          formatter={formatTokenValue}
        />
        <MetricCard
          label={t('settings.tokenUsage.rounds')}
          value={totals.rounds}
          hint={t('settings.tokenUsage.sessionCount', { count: formatCount(totals.sessionCount) })}
          formatter={formatCount}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
        <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.035]">
          <div className="flex h-[42px] items-center justify-between border-b border-white/10 px-3">
            <h3 className="text-[13px] font-semibold text-[var(--text-main)]">
              {t('settings.tokenUsage.dailyTrend')}
            </h3>
            <span className="text-[11px] text-[var(--text-muted)]">
              {t('settings.tokenUsage.byLastActiveDate')}
            </span>
          </div>
          {daily.length ? (
            <div className="grid h-[202px] grid-cols-7 items-end gap-2 p-4 md:grid-cols-14">
              {daily.map((item, index) => {
                const dailyLabel = t('settings.tokenUsage.dailyPointLabel', {
                  date: formatDateLabel(item.date, locale),
                  tokens: formatTokenValue(item.totalTokens),
                });
                return (
                  <div
                    key={item.date || `daily-${index}`}
                    className="group relative grid h-full items-end gap-1 text-center text-[10px] text-[var(--text-muted)]"
                  >
                    <span className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 rounded-md border border-white/10 bg-[#11151A] px-2 py-1 text-[10px] font-medium text-[var(--text-main)] opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
                      {formatTokenValue(item.totalTokens)}
                    </span>
                    <div
                      aria-label={dailyLabel}
                      className="min-h-[5px] rounded-t-[4px] bg-[#6FD6A5] shadow-[0_0_18px_rgba(111,214,165,0.18)]"
                      style={{
                        height: `${Math.max(5, (Number(item.totalTokens || 0) / maxDaily) * 100)}%`,
                      }}
                      title={dailyLabel}
                    />
                    <span>{formatDateLabel(item.date, locale)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-3">
              <EmptyState>{t('settings.tokenUsage.emptyTrend')}</EmptyState>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.035]">
          <div className="flex h-[42px] items-center justify-between border-b border-white/10 px-3">
            <h3 className="text-[13px] font-semibold text-[var(--text-main)]">
              {t('settings.tokenUsage.modelSummary')}
            </h3>
            <span className="text-[11px] text-[var(--text-muted)]">
              {t('settings.tokenUsage.byRunSegment')}
            </span>
          </div>
          {models.length ? (
            <div className="grid gap-2 p-2.5">
              {models.map((item) => (
                <div
                  key={`${item.provider || 'unknown'}:${item.modelName || 'unknown'}:${item.apiBaseHost || 'unknown'}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-semibold text-[var(--text-main)]">
                      <span className="mr-2 rounded-[5px] border border-white/10 bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                        {item.provider || unknownLabel}
                      </span>
                      {item.modelName || unknownLabel}
                    </div>
                    <div className="mt-1 truncate text-[11px] text-[var(--text-muted)]">
                      {item.profileName || unknownLabel} · {item.apiBaseHost || unknownLabel} ·{' '}
                      {t('settings.tokenUsage.segmentCount', { count: formatCount(item.runCount) })}
                    </div>
                  </div>
                  <strong className="text-[13px] text-[var(--text-main)]">
                    {formatTokenValue(item.totalTokens)}
                  </strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3">
              <EmptyState>{t('settings.tokenUsage.emptyModels')}</EmptyState>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
