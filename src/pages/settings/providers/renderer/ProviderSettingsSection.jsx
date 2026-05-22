import { Badge } from '../../../../ui/badge';
import { Button } from '../../../../ui/button';
import { ProviderIcon } from '../../../../ui/icon-registry';
import { Input } from '../../../../ui/input';
import { Select } from '../../../../ui/select';
import { Switch } from '../../../../ui/switch';

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
  const linearFieldClass =
    'h-8 rounded-[6px] border border-[#2a3345] bg-[#0e1520] px-3 text-[13px] font-medium text-[#EDEDEF]';
  const linearBtnClass =
    'h-8 rounded-lg border border-white/10 bg-white/[0.08] px-[14px] text-[14px] font-medium text-[#EDEDEF] transition-opacity duration-150 hover:bg-white/[0.12]';
  const linearDangerBtnClass =
    'h-8 rounded-lg border border-[#7a2f39] bg-[#7a2f39]/35 px-[14px] text-[14px] font-medium text-[#ffd7dc] transition-opacity duration-150 hover:bg-[#7a2f39]/55';

  return (
    <div className="space-y-3 text-[var(--text-main)]">
      <h3 className="text-[22px] font-bold leading-tight text-[var(--text-main)]">
        Provider Settings
      </h3>

      <div className="flex flex-wrap gap-1 rounded-[4px] border border-white/10 bg-white/[0.08] p-1">
        {[
          { id: 'claude', label: 'Claude Code' },
          { id: 'codex', label: 'Codex CLI' },
          { id: 'gemini', label: 'Gemini CLI' },
        ].map((item) => (
          <Button
            key={item.id}
            variant="ghost"
            size="sm"
            className={`h-8 rounded-[4px] px-[10px] text-[14px] font-medium transition-opacity duration-150 ${
              providerTab === item.id
                ? 'border border-white/10 bg-white/[0.13] text-[#EDEDEF]'
                : 'border border-transparent bg-transparent text-[#8A8A90] hover:bg-white/[0.04] hover:text-[#EDEDEF]'
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
              + 新增供应商
            </Button>
          </div>
        )}

        {editingProfile && (
          <div className="rounded-[4px] border border-white/10 bg-white/[0.05] p-3 space-y-3">
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
                    已启用
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
                    className={`h-auto w-full justify-between gap-2 rounded-[4px] border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] ${
                      profile.id === editingProfile.id
                        ? 'bg-white/[0.12] text-[var(--text-main)]'
                        : ''
                    }`}
                    onClick={() => onSelectProfileItem(profile.id)}
                  >
                    <span className="truncate text-sm font-semibold">{profile.name}</span>
                    <span className="flex items-center gap-2">
                      {currentProviderSettings.defaultProfileId === profile.id && (
                        <Badge variant="default" className="rounded-lg text-[12px] font-medium">
                          默认
                        </Badge>
                      )}
                      {currentProviderSettings.enabledProfileId === profile.id && (
                        <Badge variant="success" className="rounded-lg text-[12px] font-medium">
                          已启用
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
                  placeholder="供应商名称"
                  className={linearFieldClass}
                />
                <Button
                  type="button"
                  variant="secondary"
                  className={linearBtnClass}
                  onClick={() => setDefaultProviderProfile(editingProfile.id)}
                  disabled={currentProviderSettings.defaultProfileId === editingProfile.id}
                >
                  设为默认
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className={linearDangerBtnClass}
                  onClick={() => removeProviderProfile(editingProfile.id)}
                  disabled={(currentProviderSettings.profiles || []).length <= 1}
                >
                  删除供应商
                </Button>
              </div>
            )}

            <div className="space-y-3">
              <p className="text-xs text-[var(--text-muted)]">
                {isEditingOAuthProfile ? 'OAuth 登录' : '环境变量（启动时预设和自定义环境变量）'}
              </p>

              {isEditingOAuthProfile ? (
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-[var(--text-main)]">
                    使用 CLI OAuth 登录
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
                      获取OAuth登陆链接
                    </Button>
                  </div>

                  {hasCurrentOauthDisplayUrl && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-[var(--text-main)]">
                        一、Google OAuth 鉴权
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
                          点击浏览器打开URL
                        </Button>
                      </div>
                    </div>
                  )}

                  {providerTab === 'gemini' && hasCurrentOauthDisplayUrl && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-[var(--text-main)]">
                        二、填写 Google OAuth 验证码
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="text"
                          className={`flex-1 ${linearFieldClass}`}
                          placeholder="粘贴 Gemini 页面显示的 authorization code"
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
                          提交验证码
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : regularEnvVars.length === 0 ? (
                <div className="rounded-md border border-dashed border-[var(--line)] bg-[var(--bg-stage)] p-4 text-sm text-[var(--text-muted)]">
                  当前 Provider 暂无预设键名。
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
                        placeholder="KEY"
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
                        placeholder="输入值"
                        value={pair.value}
                        className={`${linearFieldClass} ${!pair.editable ? 'bg-[var(--bg-hover)] text-[var(--text-soft)]' : ''}`}
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
                        删除
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
                    + 新增变量
                  </Button>
                </div>
              )}

              <div className="h-px w-full bg-[var(--line)]" />

              <label className="flex items-center justify-end gap-3">
                <span className="inline-flex items-center gap-2 text-xs font-medium text-[var(--text-muted)]">
                  {isEditingOAuthProfile ? '启用（将执行真实探测）' : '启用（开启时自动测试链接）'}
                  {currentProviderTestState?.status === 'success' && (
                    <span className="text-[var(--success)]">✓ 连接成功</span>
                  )}
                  {currentProviderTestState?.status === 'testing' && (
                    <span className="text-[var(--text-muted)]">测试中…</span>
                  )}
                  {currentProviderTestState?.status === 'failed' ||
                  currentProviderTestState?.status === 'error' ? (
                    <span className="text-[var(--error)]">✗ 连接失败</span>
                  ) : null}
                </span>
                <Switch
                  data-testid="provider-enable-switch"
                  aria-label="启用配置开关"
                  checked={currentProviderSettings.enabledProfileId === editingProfile.id}
                  onCheckedChange={(checked) => onToggleProviderProfile(editingProfile.id, checked)}
                  disabled={currentProviderTestState.status === 'testing'}
                />
              </label>
            </div>
          </div>
        )}

        {editingProfile && (
          <div className="rounded-[4px] border border-white/10 bg-white/[0.05] p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-[#e7ecf3]">代理地址</h4>
              <label className="inline-flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <span>启用</span>
                {currentProxyTestState?.status === 'success' && (
                  <span className="text-[var(--success)]">✓ 已连接</span>
                )}
                {currentProxyTestState?.status === 'testing' && (
                  <span className="text-[var(--text-muted)]">测试中…</span>
                )}
                {currentProxyTestState?.status === 'failed' ||
                currentProxyTestState?.status === 'error' ? (
                  <span className="text-[var(--error)]">✗ 连接失败</span>
                ) : null}
                <Switch
                  aria-label="启用代理开关"
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
              启用后会自动写入 HTTP_PROXY 与 HTTPS_PROXY
            </p>
            <Input
              type="text"
              placeholder="代理地址，例如 http://127.0.0.1:7890"
              value={proxyState.url}
              className={linearFieldClass}
              onChange={(e) => setProxyConfig({ enabled: proxyState.enabled, url: e.target.value })}
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-1.5">
          {settingsSavedAt > 0 && (
            <span className="text-xs font-medium text-[var(--success)]">✓ 已保存</span>
          )}
          <Button type="button" className={linearBtnClass} onClick={() => window.close()}>
            退出应用
          </Button>
          <Button type="button" className={linearBtnClass} onClick={onSaveSettings}>
            保存
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
