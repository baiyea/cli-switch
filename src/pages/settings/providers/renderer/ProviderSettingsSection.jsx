import { Badge } from '../../../../ui/badge';
import { Button } from '../../../../ui/button';
import { ProviderIcon } from '../../../../ui/icon-registry';
import { Input } from '../../../../ui/input';
import { Select } from '../../../../ui/select';
import { Switch } from '../../../../ui/switch';
import { useT } from '../../../../i18n/use-t';

export function ProviderSettingsSection({
  providerTab,
  setProviderTab,
  currentProviderSettings,
  isFixedProfileProvider,
  addProviderProfile,
  editingProfile,
  onSelectEditingProfile,
  onSelectProfileItem,
  renameProviderProfile,
  setDefaultProviderProfile,
  removeProviderProfile,
  currentProviderTestState,
  isEditingOAuthProfile,
  oauthProviderHint,
  onStartOAuthLogin,
  hasCurrentOauthDisplayUrl,
  currentOauthDisplayUrl,
  openOAuthLink,
  currentOauthCode,
  onOauthCodeChange,
  submitOAuthCode,
  regularEnvVars,
  updateEnvVar,
  removeEnvVar,
  addEnvVar,
  onToggleProviderProfile,
  currentProxyTestState,
  proxyState,
  setProxyConfig,
  onToggleProxyEnabled,
  settingsSavedAt,
  onSaveSettings,
  settingsError,
}) {
  const t = useT();
  const linearFieldClass =
    'provider-field h-8 rounded-[6px] border px-3 text-[13px] font-medium';
  const linearBtnClass =
    'provider-action-btn h-8 rounded-lg border px-[14px] text-[14px] font-medium transition-colors duration-150';
  const linearDangerBtnClass =
    'provider-danger-btn h-8 rounded-lg border px-[14px] text-[14px] font-medium transition-colors duration-150';

  return (
    <div className="provider-settings-section space-y-3 text-[var(--text-main)]">
      <h3 className="provider-title text-[22px] font-bold leading-tight">
        {t('settings.providers.title')}
      </h3>

      <div className="provider-tab-list flex flex-wrap gap-1 rounded-[4px] border p-1">
        {[
          { id: 'claude', label: 'Claude Code' },
          { id: 'codex', label: 'Codex CLI' },
          { id: 'gemini', label: 'Gemini CLI' },
        ].map((item) => (
          <Button
            key={item.id}
            variant="ghost"
            size="sm"
            className={`provider-tab h-8 rounded-[4px] border px-[10px] text-[14px] font-medium transition-colors duration-150 ${
              providerTab === item.id
                ? 'is-active'
                : ''
            }`}
            onClick={() => setProviderTab(item.id)}
          >
            <ProviderIcon
              provider={item.id}
              size={16}
              variant={providerTab === item.id ? 'default' : 'muted'}
            />
            {item.label}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {!isFixedProfileProvider && (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={linearBtnClass}
              onClick={addProviderProfile}
            >
              {t('settings.providers.addProvider')}
            </Button>
          </div>
        )}

        {editingProfile && (
          <div className="provider-panel-card rounded-[4px] border p-3 space-y-3">
            {isFixedProfileProvider ? (
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  data-testid="provider-profile-select"
                  value={editingProfile.id || ''}
                  onChange={(e) => onSelectEditingProfile(e.target.value)}
                  className={`w-full max-w-[420px] ${linearFieldClass}`}
                >
                  {(currentProviderSettings.profiles || []).map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </Select>
                {currentProviderSettings.enabledProfileId === editingProfile.id && (
                  <Badge variant="success" className="rounded-lg text-[12px] font-medium">
                    {t('settings.providers.enabled')}
                  </Badge>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {(currentProviderSettings.profiles || []).map((profile) => (
                  <Button
                    key={profile.id}
                    type="button"
                    variant="secondary"
                    className={`provider-profile-item h-auto w-full justify-between gap-2 rounded-[4px] border px-3 py-2 text-left text-[13px] ${
                      profile.id === editingProfile.id
                        ? 'is-active'
                        : ''
                    }`}
                    onClick={() => onSelectProfileItem(profile.id)}
                  >
                    <span className="truncate text-sm font-semibold">{profile.name}</span>
                    <span className="flex items-center gap-2">
                      {currentProviderSettings.defaultProfileId === profile.id && (
                        <Badge variant="default" className="rounded-lg text-[12px] font-medium">
                          {t('settings.providers.default')}
                        </Badge>
                      )}
                      {currentProviderSettings.enabledProfileId === profile.id && (
                        <Badge variant="success" className="rounded-lg text-[12px] font-medium">
                          {t('settings.providers.enabled')}
                        </Badge>
                      )}
                    </span>
                  </Button>
                ))}
              </div>
            )}

            {!isFixedProfileProvider && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
                <Input
                  type="text"
                  value={editingProfile.name}
                  onChange={(e) => renameProviderProfile(editingProfile.id, e.target.value)}
                  placeholder={t('settings.providers.providerName')}
                  className={linearFieldClass}
                />
                <Button
                  type="button"
                  variant="secondary"
                  className={linearBtnClass}
                  onClick={() => setDefaultProviderProfile(editingProfile.id)}
                  disabled={currentProviderSettings.defaultProfileId === editingProfile.id}
                >
                  {t('settings.providers.setDefault')}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className={linearDangerBtnClass}
                  onClick={() => removeProviderProfile(editingProfile.id)}
                  disabled={(currentProviderSettings.profiles || []).length <= 1}
                >
                  {t('settings.providers.deleteProvider')}
                </Button>
              </div>
            )}

            <div className="space-y-3">
              <p className="text-xs text-[var(--text-muted)]">
                {isEditingOAuthProfile
                  ? t('settings.providers.oauthLogin')
                  : t('settings.providers.envVars')}
              </p>

              {isEditingOAuthProfile ? (
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-[var(--text-main)]">
                    {t('settings.providers.cliOAuthLogin')}
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    {oauthProviderHint(providerTab)}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className={linearBtnClass}
                      onClick={() => onStartOAuthLogin(editingProfile.id)}
                      disabled={currentProviderTestState.status === 'testing'}
                    >
                      {t('settings.providers.getOAuthUrl')}
                    </Button>
                  </div>

                  {hasCurrentOauthDisplayUrl && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-[var(--text-main)]">
                        {t('settings.providers.googleOAuth')}
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 block truncate rounded border border-white/10 bg-[var(--bg-main)] px-2 py-1.5 text-xs text-[var(--text-main)]">
                          {currentOauthDisplayUrl}
                        </code>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className={linearBtnClass}
                          onClick={() => openOAuthLink(currentOauthDisplayUrl)}
                        >
                          {t('settings.providers.openUrl')}
                        </Button>
                      </div>
                    </div>
                  )}

                  {providerTab === 'gemini' && hasCurrentOauthDisplayUrl && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-[var(--text-main)]">
                        {t('settings.providers.geminiCode')}
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="text"
                          className={`flex-1 ${linearFieldClass}`}
                          placeholder={t('settings.providers.geminiCodePlaceholder')}
                          value={currentOauthCode}
                          onChange={(e) => onOauthCodeChange(e.target.value)}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className={linearBtnClass}
                          onClick={() =>
                            submitOAuthCode(providerTab, editingProfile.id, currentOauthCode)
                          }
                        >
                          {t('settings.providers.submitCode')}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : regularEnvVars.length === 0 ? (
                <div className="rounded-md border border-dashed border-[var(--line)] bg-[var(--bg-stage)] p-4 text-sm text-[var(--text-muted)]">
                  {t('settings.providers.noPresetKeys')}
                </div>
              ) : (
                <div className="space-y-2">
                  {regularEnvVars.map(({ pair, index }) => (
                    <div
                      key={`${editingProfile.id}-env-${index}`}
                      className="grid grid-cols-1 gap-2 sm:grid-cols-[180px_minmax(0,1fr)_auto]"
                    >
                      <Input
                        data-testid={`provider-env-key-${pair.key || index}`}
                        type="text"
                        placeholder={t('settings.providers.key')}
                        value={pair.key}
                        className={`${linearFieldClass} ${!pair.keyEditable ? 'opacity-75' : ''}`}
                        readOnly={!pair.keyEditable}
                        onChange={
                          pair.keyEditable
                            ? (e) => updateEnvVar(index, 'key', e.target.value)
                            : undefined
                        }
                      />
                      <Input
                        data-testid={`provider-env-value-${pair.key || index}`}
                        type="text"
                        placeholder={t('settings.providers.valuePlaceholder')}
                        value={pair.value}
                        className={`${linearFieldClass} ${!pair.editable ? 'is-readonly' : ''}`}
                        readOnly={!pair.editable}
                        onChange={
                          pair.editable
                            ? (e) => updateEnvVar(index, 'value', e.target.value)
                            : undefined
                        }
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className={linearBtnClass}
                        onClick={() => removeEnvVar(index)}
                        disabled={!pair.removable}
                      >
                        {t('settings.providers.deleteEnv')}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {!isEditingOAuthProfile && (
                <div className="flex justify-start">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className={linearBtnClass}
                    onClick={addEnvVar}
                  >
                    {t('settings.providers.addEnv')}
                  </Button>
                </div>
              )}

              <div className="h-px w-full bg-[var(--line)]" />

              <label className="flex items-center justify-end gap-3">
                <span className="inline-flex items-center gap-2 text-xs font-medium text-[var(--text-muted)]">
                  {isEditingOAuthProfile
                    ? t('settings.providers.enableRealProbe')
                    : t('settings.providers.enableAutoTest')}
                  {currentProviderTestState?.status === 'success' && (
                    <span className="text-[var(--success)]">
                      {t('settings.providers.connectionSuccess')}
                    </span>
                  )}
                  {currentProviderTestState?.status === 'testing' && (
                    <span className="text-[var(--text-muted)]">
                      {t('settings.providers.testing')}
                    </span>
                  )}
                  {currentProviderTestState?.status === 'failed' ||
                  currentProviderTestState?.status === 'error' ? (
                    <span className="text-[var(--error)]">
                      {t('settings.providers.connectionFailed')}
                    </span>
                  ) : null}
                </span>
                <Switch
                  data-testid="provider-enable-switch"
                  aria-label={t('settings.providers.providerEnableSwitchAria')}
                  checked={currentProviderSettings.enabledProfileId === editingProfile.id}
                  onCheckedChange={(checked) => onToggleProviderProfile(editingProfile.id, checked)}
                  disabled={currentProviderTestState.status === 'testing'}
                />
              </label>
            </div>
          </div>
        )}

        {editingProfile && (
          <div className="provider-panel-card rounded-[4px] border p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <h4 className="provider-title text-sm font-semibold">
                {t('settings.providers.proxyUrl')}
              </h4>
              <label className="inline-flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <span>{t('settings.providers.enable')}</span>
                {currentProxyTestState?.status === 'success' && (
                  <span className="text-[var(--success)]">
                    {t('settings.providers.connected')}
                  </span>
                )}
                {currentProxyTestState?.status === 'testing' && (
                  <span className="text-[var(--text-muted)]">
                    {t('settings.providers.testing')}
                  </span>
                )}
                {currentProxyTestState?.status === 'failed' ||
                currentProxyTestState?.status === 'error' ? (
                  <span className="text-[var(--error)]">
                    {t('settings.providers.connectionFailed')}
                  </span>
                ) : null}
                <Switch
                  aria-label={t('settings.providers.proxyEnableSwitchAria')}
                  checked={proxyState.enabled}
                  onCheckedChange={(checked) => onToggleProxyEnabled(checked)}
                  disabled={
                    currentProviderTestState.status === 'testing' ||
                    currentProxyTestState.status === 'testing'
                  }
                />
              </label>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              {t('settings.providers.proxyDescription')}
            </p>
            <Input
              type="text"
              placeholder={t('settings.providers.proxyUrlPlaceholder')}
              value={proxyState.url}
              className={linearFieldClass}
              onChange={(e) => setProxyConfig({ enabled: proxyState.enabled, url: e.target.value })}
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-1.5">
          {settingsSavedAt > 0 && (
            <span className="text-xs font-medium text-[var(--success)]">
              ✓ {t('settings.providers.saved')}
            </span>
          )}
          <Button type="button" className={linearBtnClass} onClick={() => window.close()}>
            {t('settings.providers.exitApp')}
          </Button>
          <Button type="button" className={linearBtnClass} onClick={onSaveSettings}>
            {t('settings.providers.save')}
          </Button>
        </div>
      </div>

      {settingsError && (
        <div className="rounded-md border border-[var(--danger)]/45 bg-[var(--danger)]/12 px-3 py-2 text-xs text-[var(--danger)]">
          {settingsError}
        </div>
      )}
    </div>
  );
}
