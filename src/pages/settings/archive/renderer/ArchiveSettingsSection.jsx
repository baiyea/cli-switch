import { Button } from '../../../../ui/button';
import { Card, CardContent } from '../../../../ui/card';

export function ArchiveSettingsSection({
  archivedSessions,
  providerLabel,
  onRestoreArchivedSession,
  onCleanupExpiredArchivedSessions,
  archiveCleanupRunning = false,
  archiveCleanupResult,
}) {
  const cleanupMessage = archiveCleanupResult
    ? archiveCleanupResult.ok === false
      ? archiveCleanupResult.message || '归档清理失败'
      : `已清理 ${archiveCleanupResult.deletedRecords || 0} 条过期归档，删除 ${archiveCleanupResult.deletedFiles || 0} 个原始会话文件${
          archiveCleanupResult.missingFiles ? `，${archiveCleanupResult.missingFiles} 个文件已不存在` : ''
        }${archiveCleanupResult.skipped ? `，跳过 ${archiveCleanupResult.skipped} 条` : ''}。`
    : '';

  return (
    <div className="space-y-3 text-[var(--text-main)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[22px] font-bold leading-tight text-[var(--text-main)]">
            Archived Sessions
          </h3>
          <div className="mt-1 text-xs text-[var(--text-muted)]">
            一键清理只会删除归档超过 30 天的 provider 原始会话文件和数据库记录。
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 shrink-0 rounded-lg border border-white/10 bg-white/[0.08] px-[14px] text-[13px] font-medium text-[#EDEDEF] transition-opacity duration-150 hover:bg-white/[0.12]"
          disabled={archiveCleanupRunning || typeof onCleanupExpiredArchivedSessions !== 'function'}
          onClick={() => onCleanupExpiredArchivedSessions?.()}
        >
          {archiveCleanupRunning ? '清理中...' : '一键清理'}
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
        <Card className="rounded-lg border border-white/10 bg-white/[0.03]">
          <CardContent className="pt-4 text-sm text-[var(--text-muted)]">
            暂无已归档会话。
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {archivedSessions.map((item) => (
            <Card
              key={item.archiveId || `${item.provider}:${item.sessionId}`}
              className="rounded-lg border border-white/10 bg-white/[0.03]"
            >
              <div className="flex items-center justify-between p-4">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {item.name} · {providerLabel[item.provider] || item.provider}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] truncate mt-0.5">{item.cwd}</div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-lg border border-white/10 bg-white/[0.08] px-[14px] text-[13px] font-medium text-[#EDEDEF] transition-opacity duration-150 hover:bg-white/[0.12]"
                  onClick={() => onRestoreArchivedSession(item.archiveId || item.sessionId)}
                >
                  恢复
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
