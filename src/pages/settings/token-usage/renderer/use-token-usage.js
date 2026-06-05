import { useCallback, useEffect, useRef, useState } from 'react';

import { tokenUsageBridge } from './token-usage.bridge';
import { i18nService } from '../../../../i18n/renderer';

const FILTER_STORAGE_KEY = 'cli-switch.token-usage.filters';
const DEFAULT_FILTERS = { range: '30d', projectId: '', provider: '', profileId: '', modelName: '' };
const RANGE_VALUES = new Set(['7d', '30d', 'all']);
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

function text(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function numberOrZero(value) {
  const next = Number(value || 0);
  if (!Number.isFinite(next)) return 0;
  return Math.max(0, Math.floor(next));
}

function normalizeFilters(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const range = RANGE_VALUES.has(source.range) ? source.range : DEFAULT_FILTERS.range;
  return {
    range,
    projectId: text(source.projectId),
    provider: text(source.provider),
    profileId: text(source.profileId),
    modelName: text(source.modelName),
  };
}

function sameFilters(left, right) {
  const a = normalizeFilters(left);
  const b = normalizeFilters(right);
  return (
    a.range === b.range &&
    a.projectId === b.projectId &&
    a.provider === b.provider &&
    a.profileId === b.profileId &&
    a.modelName === b.modelName
  );
}

function normalizeSummary(value) {
  const summary = value && typeof value === 'object' ? value : {};
  return {
    ...EMPTY_SUMMARY,
    ...summary,
    filters: normalizeFilters(summary.filters || {}),
    totals: { ...EMPTY_TOTALS, ...(summary.totals || {}) },
    models: Array.isArray(summary.models) ? summary.models : [],
    projects: Array.isArray(summary.projects) ? summary.projects : [],
    daily: Array.isArray(summary.daily) ? summary.daily : [],
    sessions: Array.isArray(summary.sessions) ? summary.sessions : [],
    status: { ...EMPTY_STATUS, ...(summary.status || {}) },
  };
}

function readStoredFilters() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_FILTERS;
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return DEFAULT_FILTERS;
    return normalizeFilters(JSON.parse(raw));
  } catch {
    return DEFAULT_FILTERS;
  }
}

function writeStoredFilters(filters) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(normalizeFilters(filters)));
  } catch {
    // Ignore storage failures; filters still work for the current render session.
  }
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

function pickOptionValue(value, options) {
  const current = text(value);
  if (current && options.some((option) => option.value === current)) return current;
  return options[0]?.value || '';
}

function buildProjectOptions(projects = []) {
  return projects
    .map((project) => ({
      value: text(project?.projectId),
      label: text(project?.projectName || project?.projectId || 'unknown'),
      totalTokens: numberOrZero(project?.totalTokens),
      sessionCount: numberOrZero(project?.sessionCount),
    }))
    .filter((option) => option.value);
}

function buildProviderOptions(models = []) {
  const providers = new Map();
  for (const item of models || []) {
    const value = text(item?.provider);
    if (!value) continue;
    const prev = providers.get(value) || { value, label: value, totalTokens: 0, runCount: 0 };
    prev.totalTokens += numberOrZero(item?.totalTokens);
    prev.runCount += numberOrZero(item?.runCount);
    providers.set(value, prev);
  }
  return Array.from(providers.values()).sort(
    (left, right) => right.totalTokens - left.totalTokens || left.label.localeCompare(right.label),
  );
}

function buildProfileOptions(models = []) {
  const profiles = new Map();
  for (const item of models || []) {
    const value = text(item?.profileId);
    if (!value) continue;
    const label = text(item?.profileName || item?.profileId || 'unknown');
    const prev = profiles.get(value) || { value, label, totalTokens: 0, runCount: 0 };
    prev.totalTokens += numberOrZero(item?.totalTokens);
    prev.runCount += numberOrZero(item?.runCount);
    profiles.set(value, prev);
  }
  return Array.from(profiles.values()).sort(
    (left, right) => right.totalTokens - left.totalTokens || left.label.localeCompare(right.label),
  );
}

async function fetchSummary(filters) {
  const result = await tokenUsageBridge.summary(normalizeFilters(filters));
  if (!result?.ok) throw new Error(result?.reason || i18nService.t('settings.tokenUsage.readFailed'));
  return normalizeSummary(result.summary);
}

export function useTokenUsage() {
  const [filters, setFiltersState] = useState(readStoredFilters);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [projectOptions, setProjectOptions] = useState([]);
  const [providerOptions, setProviderOptions] = useState([]);
  const [profileOptions, setProfileOptions] = useState([]);
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
    filtersRef.current = normalizeFilters(filters);
    writeStoredFilters(filtersRef.current);
  }, [filters]);

  const setFilters = useCallback((next) => {
    setFiltersState((prev) => {
      const value = normalizeFilters(typeof next === 'function' ? next(prev) : next);
      return sameFilters(prev, value) ? prev : value;
    });
  }, []);

  const applyResolvedFilters = useCallback((nextFilters) => {
    const resolvedFilters = normalizeFilters(nextFilters);
    filtersRef.current = resolvedFilters;
    writeStoredFilters(resolvedFilters);
    setFiltersState((prev) => (sameFilters(prev, resolvedFilters) ? prev : resolvedFilters));
    return resolvedFilters;
  }, []);

  const loadSummary = useCallback(
    async (nextFilters = filtersRef.current) => {
      const requestSeq = summaryRequestSeqRef.current + 1;
      summaryRequestSeqRef.current = requestSeq;
      if (mountedRef.current) {
        setLoading(true);
        setError('');
      }
      try {
        const requestedFilters = normalizeFilters({ ...nextFilters, modelName: '' });
        const rangeFilters = normalizeFilters({ range: requestedFilters.range });
        const projectSummary = await fetchSummary(rangeFilters);
        const nextProjectOptions = buildProjectOptions(projectSummary.projects);
        const projectId = pickOptionValue(requestedFilters.projectId, nextProjectOptions);

        const projectFilters = normalizeFilters({ range: requestedFilters.range, projectId });
        const providerSummary = projectId ? await fetchSummary(projectFilters) : projectSummary;
        const nextProviderOptions = projectId ? buildProviderOptions(providerSummary.models) : [];
        const provider = pickOptionValue(requestedFilters.provider, nextProviderOptions);

        const providerFilters = normalizeFilters({
          range: requestedFilters.range,
          projectId,
          provider,
        });
        const profileSummary = projectId && provider ? await fetchSummary(providerFilters) : providerSummary;
        const nextProfileOptions = projectId && provider ? buildProfileOptions(profileSummary.models) : [];
        const profileId = pickOptionValue(requestedFilters.profileId, nextProfileOptions);

        const resolvedFilters = normalizeFilters({
          range: requestedFilters.range,
          projectId,
          provider,
          profileId,
          modelName: '',
        });
        const displaySummary = await fetchSummary(resolvedFilters);

        if (mountedRef.current && summaryRequestSeqRef.current === requestSeq) {
          setProjectOptions(nextProjectOptions);
          setProviderOptions(nextProviderOptions);
          setProfileOptions(nextProfileOptions);
          applyResolvedFilters(resolvedFilters);
          setSummary(displaySummary);
        }
      } catch (err) {
        if (mountedRef.current && summaryRequestSeqRef.current === requestSeq) {
          setError(toErrorMessage(err, i18nService.t('settings.tokenUsage.readFailed')));
        }
      } finally {
        if (mountedRef.current && summaryRequestSeqRef.current === requestSeq) {
          setLoading(false);
        }
      }
    },
    [applyResolvedFilters],
  );

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
        if (!result?.ok) throw new Error(result?.reason || i18nService.t('settings.tokenUsage.refreshFailed'));
        updateStatus(result.status);

        let currentStatus = result.status;
        for (let attempt = 0; currentStatus?.running && attempt < REFRESH_POLL_MAX_ATTEMPTS; attempt += 1) {
          await wait(REFRESH_POLL_INTERVAL_MS);
          if (!isCurrentRefresh()) return;
          const statusResult = await tokenUsageBridge.status();
          if (!statusResult?.ok) throw new Error(statusResult?.reason || i18nService.t('settings.tokenUsage.refreshStatusFailed'));
          currentStatus = statusResult.status;
          updateStatus(currentStatus);
        }

        if (currentStatus?.running) {
          throw new Error(i18nService.t('settings.tokenUsage.refreshTimeout'));
        }
        if (currentStatus?.error) {
          throw new Error(currentStatus.error);
        }
        await loadSummary(filtersRef.current);
      } catch (err) {
        if (isCurrentRefresh()) {
          setError(toErrorMessage(err, i18nService.t('settings.tokenUsage.refreshFailed')));
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

  return {
    filters,
    setFilters,
    summary,
    projectOptions,
    providerOptions,
    profileOptions,
    loading,
    refreshing,
    error,
    reload: () => loadSummary(filtersRef.current),
    refresh,
  };
}
