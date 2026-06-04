import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { tokenUsageBridge } from './token-usage.bridge';

const DEFAULT_FILTERS = { range: '30d', projectId: '', provider: '', modelName: '' };

const EMPTY_STATUS = {
  running: false,
  lastStartedAt: '',
  lastFinishedAt: '',
  scanned: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
  error: '',
};

const EMPTY_TOTALS = {
  inputTokens: 0,
  outputTokens: 0,
  cachedTokens: 0,
  reasoningTokens: 0,
  toolTokens: 0,
  totalTokens: 0,
  rounds: 0,
  sessionCount: 0,
  runCount: 0,
};

const EMPTY_SUMMARY = {
  filters: DEFAULT_FILTERS,
  totals: EMPTY_TOTALS,
  models: [],
  projects: [],
  daily: [],
  sessions: [],
  status: EMPTY_STATUS,
};

function normalizeSummary(value) {
  const summary = value && typeof value === 'object' ? value : {};
  return {
    ...EMPTY_SUMMARY,
    ...summary,
    filters: { ...DEFAULT_FILTERS, ...(summary.filters || {}) },
    totals: { ...EMPTY_TOTALS, ...(summary.totals || {}) },
    models: Array.isArray(summary.models) ? summary.models : [],
    projects: Array.isArray(summary.projects) ? summary.projects : [],
    daily: Array.isArray(summary.daily) ? summary.daily : [],
    sessions: Array.isArray(summary.sessions) ? summary.sessions : [],
    status: { ...EMPTY_STATUS, ...(summary.status || {}) },
  };
}

function toErrorMessage(error, fallback) {
  if (error instanceof Error) return error.message;
  if (error) return String(error);
  return fallback;
}

export function useTokenUsage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const filtersRef = useRef(filters);
  const didRunInitialEffectRef = useRef(false);
  const didRunFilterEffectRef = useRef(false);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  const loadSummary = useCallback(async (nextFilters = filtersRef.current) => {
    setLoading(true);
    setError('');
    try {
      const result = await tokenUsageBridge.summary(nextFilters);
      if (!result?.ok) throw new Error(result?.reason || 'Token 统计读取失败');
      setSummary(normalizeSummary(result.summary));
    } catch (err) {
      setError(toErrorMessage(err, 'Token 统计读取失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(
    async ({ force = false } = {}) => {
      setRefreshing(true);
      setError('');
      try {
        const result = await tokenUsageBridge.refresh({ force });
        if (!result?.ok) throw new Error(result?.reason || 'Token 统计刷新失败');
        if (result.status) {
          setSummary((prev) => normalizeSummary({ ...prev, status: result.status }));
        }
        await loadSummary(filtersRef.current);
      } catch (err) {
        setError(toErrorMessage(err, 'Token 统计刷新失败'));
      } finally {
        setRefreshing(false);
      }
    },
    [loadSummary],
  );

  useEffect(() => {
    if (didRunInitialEffectRef.current) return;
    didRunInitialEffectRef.current = true;
    void (async () => {
      await loadSummary(filtersRef.current);
      await refresh({ force: false });
    })();
  }, [loadSummary, refresh]);

  useEffect(() => {
    if (!didRunFilterEffectRef.current) {
      didRunFilterEffectRef.current = true;
      return;
    }
    void loadSummary(filters);
  }, [filters, loadSummary]);

  const modelOptions = useMemo(
    () => Array.from(new Set((summary.models || []).map((item) => item?.modelName).filter(Boolean))),
    [summary.models],
  );

  return {
    filters,
    setFilters,
    summary,
    loading,
    refreshing,
    error,
    modelOptions,
    reload: () => loadSummary(filtersRef.current),
    refresh,
  };
}
