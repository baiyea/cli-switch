import React from "react";
import { Button } from "../../../ui/button";
import { Card, CardContent } from "../../../ui/card";

export function ArchiveSettingsSection({ archivedSessions, providerLabel, onRestoreArchivedSession }) {
  return (
    <div className="space-y-3 text-[var(--text-main)]">
      <h3 className="text-[22px] font-bold leading-tight text-[var(--text-main)]">Archived Sessions</h3>
      {archivedSessions.length === 0 ? (
        <Card className="rounded-lg border border-white/10 bg-white/[0.03]">
          <CardContent className="pt-4 text-sm text-[var(--text-muted)]">暂无已归档会话。</CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {archivedSessions.map((item) => (
            <Card key={item.archiveId || `${item.provider}:${item.sessionId}`} className="rounded-lg border border-white/10 bg-white/[0.03]">
              <div className="flex items-center justify-between p-4">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{item.name} · {providerLabel[item.provider] || item.provider}</div>
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
