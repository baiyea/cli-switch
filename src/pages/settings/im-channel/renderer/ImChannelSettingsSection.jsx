import { QRCodeSVG } from 'qrcode.react';
import { useMemo } from 'react';

import { useT } from '../../../../i18n/use-t';
import { Button } from '../../../../ui/button';
import { Input } from '../../../../ui/input';
import { Switch } from '../../../../ui/switch';
import { useImChannelSettings } from './use-im-channel-settings';

function formatTimestamp(value, t) {
  if (!value) return t('settings.imChannel.status.never');

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(value));
  } catch {
    return t('settings.imChannel.status.never');
  }
}

function resolveErrorLabel(error, t) {
  if (!error) return '';
  if (error === 'missing-credentials') return t('settings.imChannel.error.missingCredentials');
  if (error === 'missing-device-code') return t('settings.imChannel.error.missingDeviceCode');
  if (error === 'install-expired') return t('settings.imChannel.install.expired');
  if (error === 'install-qrcode-failed') return t('settings.imChannel.install.qrcodeFailed');
  if (error === 'install-poll-failed') return t('settings.imChannel.install.pollFailed');
  if (error === 'read-failed') return t('settings.imChannel.error.readFailed');
  if (error === 'status-failed') return t('settings.imChannel.error.statusFailed');
  if (error === 'save-failed') return t('settings.imChannel.error.saveFailed');
  return t('settings.imChannel.error.generic', { message: error });
}

function Field({ label, description, htmlFor, children }) {
  return (
    <label className="grid gap-2" htmlFor={htmlFor}>
      <span className="text-[13px] font-semibold text-[var(--text-main)]">{label}</span>
      {description ? (
        <span className="text-[12px] leading-5 text-[var(--text-muted)]">{description}</span>
      ) : null}
      {children}
    </label>
  );
}

function StatusItem({ label, value }) {
  return (
    <div className="im-channel-status-item rounded-lg border px-3 py-2">
      <div className="text-[11px] text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 break-words text-[13px] text-[var(--text-main)]">{value}</div>
    </div>
  );
}

function InstallPanel({ config, disabled, installState, onStart, t }) {
  const installErrorLabel = resolveErrorLabel(installState.error, t);
  const showQrcode = installState.phase === 'showing' && installState.url;
  const canStart = !disabled && installState.phase !== 'loading' && installState.phase !== 'showing';

  return (
    <div className="im-channel-install-panel rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="im-channel-install-title text-[14px] font-semibold">
            {t('settings.imChannel.install.title')}
          </h3>
          <p className="im-channel-install-description mt-1 max-w-2xl text-[12px] leading-5">
            {t('settings.imChannel.install.description', {
              domain: t(`settings.imChannel.domain.${config.domain}`),
            })}
          </p>
        </div>
        <Button
          type="button"
          disabled={!canStart}
          onClick={() => void onStart()}
          className="im-channel-install-button h-9 rounded-lg px-4 text-[13px]"
        >
          {installState.phase === 'loading'
            ? t('settings.imChannel.install.generating')
            : t('settings.imChannel.install.start')}
        </Button>
      </div>

      {showQrcode ? (
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="im-channel-qrcode-box rounded-2xl p-3 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
            <QRCodeSVG value={installState.url} size={168} includeMargin />
          </div>
          <div className="im-channel-install-description max-w-sm text-[12px] leading-5">
            <p className="im-channel-install-title font-semibold">
              {t('settings.imChannel.install.scanHint')}
            </p>
            <p className="mt-2">
              {t('settings.imChannel.install.expiresIn', { seconds: installState.timeLeft })}
            </p>
          </div>
        </div>
      ) : null}

      {installState.phase === 'success' ? (
        <div className="im-channel-install-message is-success mt-3 rounded-lg border px-3 py-2 text-[12px]">
          {t('settings.imChannel.install.success')}
        </div>
      ) : null}

      {installErrorLabel ? (
        <div className="im-channel-install-message is-error mt-3 rounded-lg border px-3 py-2 text-[12px]">
          {installErrorLabel}
        </div>
      ) : null}
    </div>
  );
}

export function ImChannelSettingsSection() {
  const t = useT();
  const {
    allowedUsersText,
    config,
    error,
    installState,
    loading,
    save,
    savedAt,
    saving,
    startInstall,
    status,
    updateAllowedUsersText,
    updateConfig,
  } = useImChannelSettings();

  const saveStatus = error
    ? t('common.failed')
    : saving
      ? t('common.saving')
      : savedAt
        ? t('common.saved')
        : t('common.synced');
  const operationErrorLabel = resolveErrorLabel(error, t);
  const lastErrorLabel = resolveErrorLabel(status.lastError, t);
  const statusItems = useMemo(
    () => [
      {
        label: t('settings.imChannel.status.running'),
        value: status.running
          ? t('settings.imChannel.status.runningYes')
          : t('settings.imChannel.status.runningNo'),
      },
      {
        label: t('settings.imChannel.status.lastInboundAt'),
        value: formatTimestamp(status.lastInboundAt, t),
      },
      {
        label: t('settings.imChannel.status.lastOutboundAt'),
        value: formatTimestamp(status.lastOutboundAt, t),
      },
      {
        label: t('settings.imChannel.status.lastError'),
        value: lastErrorLabel || t('settings.imChannel.status.noError'),
      },
    ],
    [lastErrorLabel, status.lastInboundAt, status.lastOutboundAt, status.running, t],
  );

  return (
    <div className="im-channel-settings-section space-y-4 pb-4 text-[var(--text-main)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-bold leading-tight text-[var(--text-main)]">
            {t('settings.imChannel.title')}
          </h2>
          <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
            {t('settings.imChannel.description')}
          </p>
        </div>
        <span className="im-channel-save-status rounded-lg border px-2.5 py-1.5 text-[12px]">
          {loading ? t('common.loading') : saveStatus}
        </span>
      </div>

      <section className="im-channel-card rounded-xl border p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-[14px] font-semibold text-[var(--text-main)]">
              {t('settings.imChannel.enableTitle')}
            </h3>
            <p className="mt-1 text-[12px] leading-5 text-[var(--text-muted)]">
              {t('settings.imChannel.enableDescription')}
            </p>
          </div>
          <Switch
            checked={config.enabled}
            disabled={loading || saving}
            onCheckedChange={(checked) => updateConfig({ enabled: checked })}
            aria-label={t('settings.imChannel.enableTitle')}
          />
        </div>
      </section>

      <section className="im-channel-card grid gap-4 rounded-xl border p-4">
        <Field
          label={t('settings.imChannel.domain')}
          description={t('settings.imChannel.domainDescription')}
          htmlFor="im-channel-domain"
        >
          <select
            id="im-channel-domain"
            className="im-channel-field h-9 w-full rounded-md border px-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
            disabled={loading || saving}
            value={config.domain}
            onChange={(event) => updateConfig({ domain: event.target.value })}
          >
            <option value="feishu">{t('settings.imChannel.domain.feishu')}</option>
            <option value="lark">{t('settings.imChannel.domain.lark')}</option>
          </select>
        </Field>

        <InstallPanel
          config={config}
          disabled={loading || saving}
          installState={installState}
          onStart={startInstall}
          t={t}
        />

        <div className="flex items-center gap-3 text-[12px] text-[var(--text-muted)]">
          <span className="im-channel-divider h-px flex-1" />
          <span>{t('settings.imChannel.install.orManual')}</span>
          <span className="im-channel-divider h-px flex-1" />
        </div>

        <Field
          label={t('settings.imChannel.appId')}
          description={t('settings.imChannel.appIdDescription')}
          htmlFor="im-channel-app-id"
        >
          <Input
            id="im-channel-app-id"
            value={config.appId}
            disabled={loading || saving}
            placeholder={t('settings.imChannel.appIdPlaceholder')}
            className="im-channel-field"
            onChange={(event) => updateConfig({ appId: event.target.value })}
          />
        </Field>

        <Field
          label={t('settings.imChannel.appSecret')}
          description={t('settings.imChannel.appSecretDescription')}
          htmlFor="im-channel-app-secret"
        >
          <Input
            id="im-channel-app-secret"
            type="password"
            value={config.appSecret}
            disabled={loading || saving}
            placeholder={t('settings.imChannel.appSecretPlaceholder')}
            className="im-channel-field"
            onChange={(event) => updateConfig({ appSecret: event.target.value })}
          />
        </Field>

        <Field
          label={t('settings.imChannel.allowedUsers')}
          description={t('settings.imChannel.allowedUsersDescription')}
          htmlFor="im-channel-allowed-users"
        >
          <textarea
            id="im-channel-allowed-users"
            className="im-channel-field min-h-[120px] w-full resize-y rounded-md border px-3 py-2 text-sm leading-5 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            disabled={loading || saving}
            placeholder={t('settings.imChannel.allowedUsersPlaceholder')}
            value={allowedUsersText}
            onChange={(event) => updateAllowedUsersText(event.target.value)}
          />
        </Field>
      </section>

      <section className="im-channel-card rounded-xl border p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-[14px] font-semibold text-[var(--text-main)]">
            {t('settings.imChannel.status.title')}
          </h3>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {statusItems.map((item) => (
            <StatusItem key={item.label} label={item.label} value={item.value} />
          ))}
        </div>
      </section>

      {operationErrorLabel ? (
        <div className="im-channel-error-banner rounded-lg border px-3 py-2 text-[12px] leading-5">
          {operationErrorLabel}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="button"
          disabled={loading || saving}
          onClick={() => void save()}
          className="h-9 rounded-lg px-4 text-[13px]"
        >
          {saving ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </div>
  );
}
