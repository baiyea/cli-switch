import { RefreshCcw } from 'lucide-react';

import { Button } from '../../../../ui/button';
import { useTokenUsage } from './use-token-usage';

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.floor(Number(value || 0))));
}

function formatDateLabel(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateTime(value) {
  if (!value) return '尚未同步';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '尚未同步';
  return `${formatDateLabel(value)} ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-3">
      <div className="mb-2 text-[11px] text-[var(--text-muted)]">{label}</div>
      <strong className="block text-[18px] leading-none text-[var(--text-main)]">
        {formatNumber(value)}
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

  return (
    <div className="space-y-3 pb-4 text-[var(--text-main)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-bold leading-tight text-[var(--text-main)]">
            Token 统计
          </h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            只统计当前数据库已登记的项目与会话，模型按运行段快照归属。
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="rounded-lg border border-white/10 bg-white/[0.045] px-2.5 py-1.5 text-[12px] text-[var(--text-muted)]">
            {isRefreshing ? '同步中...' : `上次同步：${formatDateTime(status.lastFinishedAt)}`}
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
            {isRefreshing ? '扫描中...' : '重新扫描'}
          </Button>
        </div>
      </div>

      <div
        aria-label="Token 使用筛选"
        role="group"
        className="flex flex-wrap items-end gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2"
      >
        <FilterField label="项目">
          <select
            aria-label="项目"
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
            <option value="">{projectOptions.length ? '选择项目' : '暂无项目'}</option>
            {projectOptions.map((project) => (
              <option key={project.value} value={project.value}>
                {project.label}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Provider">
          <select
            aria-label="Provider"
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
            <option value="">{providerOptions.length ? '选择 Provider' : '暂无 Provider'}</option>
            {providerOptions.map((provider) => (
              <option key={provider.value} value={provider.value}>
                {provider.label}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Profile">
          <select
            aria-label="Profile"
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
            <option value="">{profileOptions.length ? '选择 Profile' : '暂无 Profile'}</option>
            {profileOptions.map((profile) => (
              <option key={profile.value} value={profile.value}>
                {profile.label}
              </option>
            ))}
          </select>
        </FilterField>

        <div className="grid gap-1 text-[11px] text-[var(--text-muted)]">
          <span>时间</span>
          <div className="flex flex-wrap gap-2">
            {[
              ['7d', '最近 7 天'],
              ['30d', '最近 30 天'],
              ['all', '全部时间'],
            ].map(([range, label]) => (
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
      {loading ? <div className="text-xs text-[var(--text-muted)]">加载中...</div> : null}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
        <MetricCard label="总 Token" value={totals.totalTokens} hint={`${formatNumber(totals.runCount)} 个运行段`} />
        <MetricCard label="输入" value={totals.inputTokens} />
        <MetricCard label="输出" value={totals.outputTokens} />
        <MetricCard label="缓存" value={totals.cachedTokens} />
        <MetricCard label="Reasoning" value={totals.reasoningTokens} />
        <MetricCard label="轮次" value={totals.rounds} hint={`${formatNumber(totals.sessionCount)} 个会话`} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
        <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.035]">
          <div className="flex h-[42px] items-center justify-between border-b border-white/10 px-3">
            <h3 className="text-[13px] font-semibold text-[var(--text-main)]">日趋势</h3>
            <span className="text-[11px] text-[var(--text-muted)]">按最后活跃日期归属</span>
          </div>
          {daily.length ? (
            <div className="grid h-[202px] grid-cols-7 items-end gap-2 p-4 md:grid-cols-14">
              {daily.map((item, index) => (
                <div
                  key={item.date || `daily-${index}`}
                  className="grid h-full items-end gap-1 text-center text-[10px] text-[var(--text-muted)]"
                >
                  <div
                    className="min-h-[5px] rounded-t-[4px] bg-[#6FD6A5] shadow-[0_0_18px_rgba(111,214,165,0.18)]"
                    style={{
                      height: `${Math.max(5, (Number(item.totalTokens || 0) / maxDaily) * 100)}%`,
                    }}
                    title={`${formatDateLabel(item.date)} · ${formatNumber(item.totalTokens)}`}
                  />
                  <span>{formatDateLabel(item.date)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3">
              <EmptyState>暂无趋势数据。完成一次会话扫描后会显示每日 Token 消耗。</EmptyState>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.035]">
          <div className="flex h-[42px] items-center justify-between border-b border-white/10 px-3">
            <h3 className="text-[13px] font-semibold text-[var(--text-main)]">模型汇总</h3>
            <span className="text-[11px] text-[var(--text-muted)]">按运行段聚合</span>
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
                        {item.provider || 'unknown'}
                      </span>
                      {item.modelName || 'unknown'}
                    </div>
                    <div className="mt-1 truncate text-[11px] text-[var(--text-muted)]">
                      {item.profileName || 'unknown'} · {item.apiBaseHost || 'unknown'} ·{' '}
                      {formatNumber(item.runCount)} 段
                    </div>
                  </div>
                  <strong className="text-[13px] text-[var(--text-main)]">
                    {formatNumber(item.totalTokens)}
                  </strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3">
              <EmptyState>暂无模型统计。点击重新扫描或等待后台同步完成。</EmptyState>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
