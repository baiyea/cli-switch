import { useCallback, useEffect, useRef, useState } from 'react';

import { imChannelBridge } from './im-channel.bridge';

const DEFAULT_CONFIG = {
  enabled: false,
  domain: 'feishu',
  appId: '',
  appSecret: '',
  allowedUsers: [],
};

const DEFAULT_STATUS = {
  running: false,
  lastError: '',
  lastInboundAt: null,
  lastOutboundAt: null,
};

const DEFAULT_INSTALL_STATE = {
  phase: 'idle',
  url: '',
  deviceCode: '',
  expiresIn: 0,
  timeLeft: 0,
  error: '',
};

function text(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function normalizeAllowedUsers(value) {
  const users = [];
  const seen = new Set();
  const source = Array.isArray(value) ? value : text(value).split(/\r?\n/);

  for (const item of source) {
    const normalized = text(item).trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    users.push(normalized);
  }

  return users;
}

function allowedUsersToText(value) {
  return normalizeAllowedUsers(value).join('\n');
}

function normalizeConfig(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    enabled: source.enabled === true,
    domain: source.domain === 'lark' ? 'lark' : 'feishu',
    appId: text(source.appId).trim(),
    appSecret: text(source.appSecret).trim(),
    allowedUsers: normalizeAllowedUsers(source.allowedUsers),
  };
}

function normalizeStatus(value) {
  const source = value && typeof value === 'object' ? value : {};
  const lastInboundAt = source.lastInboundAt === null || source.lastInboundAt === undefined
    ? null
    : Number(source.lastInboundAt);
  const lastOutboundAt = source.lastOutboundAt === null || source.lastOutboundAt === undefined
    ? null
    : Number(source.lastOutboundAt);
  return {
    running: source.running === true,
    lastError: text(source.lastError),
    lastInboundAt: Number.isFinite(lastInboundAt) ? lastInboundAt : null,
    lastOutboundAt: Number.isFinite(lastOutboundAt) ? lastOutboundAt : null,
  };
}

function getErrorMessage(error, fallback) {
  if (error instanceof Error) return error.message || fallback;
  if (error) return String(error);
  return fallback;
}

export function useImChannelSettings() {
  const mountedRef = useRef(true);
  const requestSeqRef = useRef(0);
  const saveSeqRef = useRef(0);
  const pollTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [allowedUsersText, setAllowedUsersText] = useState('');
  const [status, setStatus] = useState(DEFAULT_STATUS);
  const [installState, setInstallState] = useState(DEFAULT_INSTALL_STATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState(0);

  const clearInstallTimers = useCallback(() => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearInstallTimers();
    };
  }, [clearInstallTimers]);

  const applyConfig = useCallback((nextConfig) => {
    const normalized = normalizeConfig(nextConfig);
    setConfig(normalized);
    setAllowedUsersText(allowedUsersToText(normalized.allowedUsers));
    return normalized;
  }, []);

  const load = useCallback(async () => {
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    setLoading(true);
    setError('');

    try {
      const [configResult, statusResult] = await Promise.all([
        imChannelBridge.getConfig(),
        imChannelBridge.status(),
      ]);

      if (!configResult?.ok) throw new Error(configResult?.message || 'read-failed');
      if (!statusResult?.ok) throw new Error(statusResult?.message || 'status-failed');
      if (!mountedRef.current || requestSeqRef.current !== requestSeq) return;

      applyConfig(configResult.config);
      setStatus(normalizeStatus(statusResult.status));
    } catch (loadError) {
      if (!mountedRef.current || requestSeqRef.current !== requestSeq) return;
      setError(getErrorMessage(loadError, 'read-failed'));
    } finally {
      if (mountedRef.current && requestSeqRef.current === requestSeq) {
        setLoading(false);
      }
    }
  }, [applyConfig]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateConfig = useCallback((patch) => {
    setConfig((prev) => normalizeConfig({ ...prev, ...patch }));
    setSavedAt(0);
    setError('');
  }, []);

  const updateAllowedUsersText = useCallback((value) => {
    setAllowedUsersText(text(value));
    setSavedAt(0);
    setError('');
  }, []);

  const save = useCallback(async (overrideConfig) => {
    const saveSeq = saveSeqRef.current + 1;
    saveSeqRef.current = saveSeq;
    const payload = normalizeConfig(
      overrideConfig || {
        ...config,
        allowedUsers: normalizeAllowedUsers(allowedUsersText),
      },
    );

    setSaving(true);
    setError('');
    setSavedAt(0);

    try {
      const result = await imChannelBridge.saveConfig(payload);
      if (!result?.ok) throw new Error(result?.message || 'save-failed');
      if (!mountedRef.current || saveSeqRef.current !== saveSeq) return result;

      if (result.config) applyConfig(result.config);
      if (result.status) setStatus(normalizeStatus(result.status));
      setSavedAt(Date.now());
      return result;
    } catch (saveError) {
      if (!mountedRef.current || saveSeqRef.current !== saveSeq) return undefined;
      setError(getErrorMessage(saveError, 'save-failed'));
    } finally {
      if (mountedRef.current && saveSeqRef.current === saveSeq) {
        setSaving(false);
      }
    }
  }, [allowedUsersText, applyConfig, config]);

  const startInstall = useCallback(async () => {
    clearInstallTimers();
    setError('');
    setSavedAt(0);
    setInstallState({
      ...DEFAULT_INSTALL_STATE,
      phase: 'loading',
    });

    try {
      const qrcodeResult = await imChannelBridge.installQrcode({ domain: config.domain });
      if (!qrcodeResult?.ok) throw new Error(qrcodeResult?.message || 'install-qrcode-failed');
      const deviceCode = text(qrcodeResult.deviceCode).trim();
      const installUrl = text(qrcodeResult.url);
      if (!deviceCode) throw new Error('missing-device-code');
      if (!installUrl) throw new Error('install-qrcode-failed');

      const intervalMs = Math.max(1, Number(qrcodeResult.interval) || 5) * 1000;
      const expiresIn = Math.max(1, Number(qrcodeResult.expireIn) || 300);

      if (!mountedRef.current) return;
      setInstallState({
        phase: 'showing',
        url: installUrl,
        deviceCode,
        expiresIn,
        timeLeft: expiresIn,
        error: '',
      });

      countdownTimerRef.current = window.setInterval(() => {
        setInstallState((prev) => {
          if (prev.phase !== 'showing') return prev;
          const nextTimeLeft = Math.max(0, prev.timeLeft - 1);
          if (nextTimeLeft === 0) {
            clearInstallTimers();
            return {
              ...prev,
              phase: 'error',
              timeLeft: 0,
              error: 'install-expired',
            };
          }
          return { ...prev, timeLeft: nextTimeLeft };
        });
      }, 1000);

      pollTimerRef.current = window.setInterval(async () => {
        try {
          const pollResult = await imChannelBridge.installPoll({ deviceCode });
          if (!mountedRef.current) return;
          if (!pollResult?.ok) throw new Error(pollResult?.message || 'install-poll-failed');
          if (!pollResult.done) return;

          clearInstallTimers();
          const nextConfig = normalizeConfig({
            ...config,
            domain: pollResult.domain || config.domain,
            appId: pollResult.appId,
            appSecret: pollResult.appSecret,
            enabled: true,
            allowedUsers: normalizeAllowedUsers(allowedUsersText),
          });
          const saveResult = await save(nextConfig);
          if (!mountedRef.current) return;
          setInstallState((prev) => ({
            ...prev,
            phase: saveResult?.ok ? 'success' : 'error',
            error: saveResult?.ok ? '' : 'save-failed',
          }));
        } catch (pollError) {
          clearInstallTimers();
          if (!mountedRef.current) return;
          setInstallState((prev) => ({
            ...prev,
            phase: 'error',
            error: getErrorMessage(pollError, 'install-poll-failed'),
          }));
        }
      }, intervalMs);
    } catch (installError) {
      clearInstallTimers();
      if (!mountedRef.current) return;
      setInstallState({
        ...DEFAULT_INSTALL_STATE,
        phase: 'error',
        error: getErrorMessage(installError, 'install-qrcode-failed'),
      });
    }
  }, [allowedUsersText, clearInstallTimers, config, save]);

  return {
    allowedUsersText,
    config,
    error,
    installState,
    load,
    loading,
    save,
    savedAt,
    saving,
    startInstall,
    status,
    updateAllowedUsersText,
    updateConfig,
  };
}
