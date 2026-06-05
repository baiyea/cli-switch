import { Button } from '../../../../ui/button';
import { Card, CardContent } from '../../../../ui/card';
import { useT } from '../../../../i18n/use-t';

export function ArchiveSettingsSection({
  archivedSessions,
  providerLabel,
  onRestoreArchivedSession,
  onCleanupExpiredArchivedSessions,
  archiveCleanupRunning = false,
  archiveCleanupResult,
}) {
  const t = useT();
  const cleanupMessage = archiveCleanupResult
    ? archiveCleanupResult.ok === false
      ? archiveCleanupResult.message || t('settings.archive.cleanupFailed')
      : `${t('settings.archive.cleanupResult', {
          deletedRecords: archiveCleanupResult.deletedRecords || 0,
          deletedFiles: archiveCleanupResult.deletedFiles || 0,
        })}${
          archiveCleanupResult.missingFiles
            ? t('settings.archive.cleanupMissingFiles', {
                missingFiles: archiveCleanupResult.missingFiles,
              })
            : ''
        }${
          archiveCleanupResult.skipped
            ? t('settings.archive.cleanupSkipped', { skipped: archiveCleanupResult.skipped })
            : ''
        }`
    : '';

  return (
    <div className="archive-settings-section space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="archive-title text-[22px] font-bold leading-tight">
            {t('settings.archive.title')}
          </h3>
          <div className="mt-1 text-xs text-[var(--text-muted)]">
            {t('settings.archive.description')}
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="archive-action-btn h-8 shrink-0 rounded-lg border px-[14px] text-[13px] font-medium transition-colors duration-150"
          disabled={archiveCleanupRunning || typeof onCleanupExpiredArchivedSessions !== 'function'}
          onClick={() => onCleanupExpiredArchivedSessions?.()}
        >
          {archiveCleanupRunning ? t('settings.archive.cleaning') : t('settings.archive.cleanup')}
        </Button>
      </div>
      {cleanupMessage ? (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            archiveCleanupResult?.ok === false
              ? 'border-[#f6a3ad]/30 bg-[#f6a3ad]/10 text-[#f6a3ad]'
              : 'border-white/10 bg-white/[0.04] text-[var(--text-muted)]'
          }`}
        >
          {cleanupMessage}
        </div>
      ) : null}
      {archivedSessions.length === 0 ? (
        <Card className="archive-card rounded-lg border">
          <CardContent className="pt-4 text-sm text-[var(--text-muted)]">
            {t('settings.archive.empty')}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {archivedSessions.map((item) => (
            <Card
              key={item.archiveId || `${item.provider}:${item.sessionId}`}
              className="archive-card rounded-lg border"
            >
              <div className="flex items-center justify-between p-4">
                <div className="min-w-0">
                  <div className="archive-item-title text-sm font-semibold truncate">
                    {item.name} · {providerLabel[item.provider] || item.provider}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] truncate mt-0.5">{item.cwd}</div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="archive-action-btn h-8 rounded-lg border px-[14px] text-[13px] font-medium transition-colors duration-150"
                  onClick={() => onRestoreArchivedSession(item.archiveId || item.sessionId)}
                >
                  {t('common.restore')}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
