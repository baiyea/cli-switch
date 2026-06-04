import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { tokenUsageBridge } from './token-usage.bridge';

const DEFAULT_FILTERS = { range: '30d', projectId: '', provider: '', modelName: '' };
const REFRESH_POLL_INTERVAL_MS = 1000;
const REFRESH_POLL_MAX_ATTEMPTS = 60;

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

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function useTokenUsage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const filtersRef = useRef(filters);
  const mountedRef = useRef(true);
  const summaryRequestSeqRef = useRef(0);
  const refreshRequestSeqRef = useRef(0);
  const didRunInitialEffectRef = useRef(false);
  const didRunFilterEffectRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  const loadSummary = useCallback(async (nextFilters = filtersRef.current) => {
    const requestSeq = summaryRequestSeqRef.current + 1;
    summaryRequestSeqRef.current = requestSeq;
    if (mountedRef.current) {
      setLoading(true);
      setError('');
    }
    try {
      const result = await tokenUsageBridge.summary(nextFilters);
      if (!result?.ok) throw new Error(result?.reason || 'Token 统计读取失败');
      if (mountedRef.current && summaryRequestSeqRef.current === requestSeq) {
        setSummary(normalizeSummary(result.summary));
      }
    } catch (err) {
      if (mountedRef.current && summaryRequestSeqRef.current === requestSeq) {
        setError(toErrorMessage(err, 'Token 统计读取失败'));
      }
    } finally {
      if (mountedRef.current && summaryRequestSeqRef.current === requestSeq) {
        setLoading(false);
      }
    }
  }, []);

  const refresh = useCallback(
    async ({ force = false } = {}) => {
      const requestSeq = refreshRequestSeqRef.current + 1;
      refreshRequestSeqRef.current = requestSeq;
      const isCurrentRefresh = () => mountedRef.current && refreshRequestSeqRef.current === requestSeq;
      const updateStatus = (status) => {
        if (!status || !isCurrentRefresh()) return;
        setSummary((prev) => normalizeSummary({ ...prev, status }));
      };

      if (mountedRef.current) {
        setRefreshing(true);
        setError('');
      }
      try {
        const result = await tokenUsageBridge.refresh({ force });
        if (!result?.ok) throw new Error(result?.reason || 'Token 统计刷新失败');
        updateStatus(result.status);

        let currentStatus = result.status;
        for (let attempt = 0; currentStatus?.running && attempt < REFRESH_POLL_MAX_ATTEMPTS; attempt += 1) {
          await wait(REFRESH_POLL_INTERVAL_MS);
          if (!isCurrentRefresh()) return;
          const statusResult = await tokenUsageBridge.status();
          if (!statusResult?.ok) throw new Error(statusResult?.reason || 'Token 统计刷新状态读取失败');
          currentStatus = statusResult.status;
          updateStatus(currentStatus);
        }

        if (currentStatus?.running) {
          throw new Error('Token 统计刷新超时，请稍后重试');
        }
        if (currentStatus?.error) {
          throw new Error(currentStatus.error);
        }
        await loadSummary(filtersRef.current);
      } catch (err) {
        if (isCurrentRefresh()) {
          setError(toErrorMessage(err, 'Token 统计刷新失败'));
        }
      } finally {
        if (isCurrentRefresh()) {
          setRefreshing(false);
        }
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
