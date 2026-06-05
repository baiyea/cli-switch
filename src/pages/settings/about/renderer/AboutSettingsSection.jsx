import { useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../../ui/alert-dialog';
import { Button } from '../../../../ui/button';
import { useT } from '../../../../i18n/use-t';

export function AboutSettingsSection({ appVersion, appLogo }) {
  const t = useT();
  const [cleaning, setCleaning] = useState(false);
  const [cleanConfirmOpen, setCleanConfirmOpen] = useState(false);
  const [cleanResult, setCleanResult] = useState({ type: '', message: '', paths: [] });

  const toDisplayPath = (value) => {
    const raw = String(value || '');
    if (!raw) return raw;
    const userHome = (typeof process !== 'undefined' && process?.env?.HOME) || '';
    if (userHome && raw.startsWith(userHome)) {
      return `~${raw.slice(userHome.length)}`;
    }
    return raw;
  };

  const handleCleanRuntimeData = async () => {
    if (cleaning) return;
    setCleaning(true);
    setCleanResult({ type: '', message: '', paths: [] });
    try {
      const cleanRuntimeData =
        typeof window !== 'undefined' ? window.electronAPI?.settings?.cleanRuntimeData : null;
      if (typeof cleanRuntimeData !== 'function') {
        throw new Error(t('settings.about.cleanFailed'));
      }

      const result = await cleanRuntimeData();
      if (!result?.ok) {
        throw new Error(result?.message || t('settings.about.cleanFailed'));
      }
      const uniquePaths = Array.from(
        new Set([...(result.runtimeDirs || []), result.dbPath].filter(Boolean)),
      );
      setCleanResult({
        type: 'success',
        message: t('settings.about.cleanSuccess'),
        paths: uniquePaths.map((item) => toDisplayPath(item)),
      });
    } catch (error) {
      setCleanResult({
        type: 'error',
        message: error instanceof Error ? error.message : t('settings.about.cleanFailed'),
        paths: [],
      });
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 flex flex-col gap-3.5">
        <div className="flex items-center gap-3.5">
          {appLogo ? (
            <img
              src={appLogo}
              alt="Cli-Switch logo"
              className="h-20 w-20 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-[#565e74]">
              <span className="text-[30px] text-white">▣</span>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <div className="text-[22px] font-extrabold tracking-tight text-[#EDEDEF]">
              Cli-Switch
            </div>
            <div className="text-[12px] text-[#8A8A90]">
              {t('settings.about.tagline')}
            </div>
          </div>
        </div>

        <div className="h-px w-full bg-white/10" />

        <div className="flex flex-col gap-2.5">
          <div className="flex justify-between items-center">
            <span className="text-[12px] text-[#8A8A90]">{t('settings.about.platform')}</span>
            <span className="text-[12px] font-semibold text-[#EDEDEF]">
              Electron + React + TypeScript
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[12px] text-[#8A8A90]">
              {t('settings.about.terminalCore')}
            </span>
            <span className="text-[12px] font-semibold text-[#EDEDEF]">@xterm/xterm v5.x</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[12px] text-[#8A8A90]">{t('settings.about.storage')}</span>
            <span className="text-[12px] font-semibold text-[#EDEDEF]">SQLite 3 (Local)</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[12px] text-[#8A8A90]">{t('settings.about.version')}</span>
            <span className="text-[12px] font-semibold text-[#EDEDEF]">{appVersion}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="h-px w-full bg-white/10" />
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#8A8A90]">{t('settings.about.appData')}</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setCleanConfirmOpen(true)}
              disabled={cleaning}
              className="h-7 rounded-[4px] border border-white/10 bg-white/[0.08] px-3 text-[12px] font-semibold text-[#EDEDEF] transition-opacity duration-150 hover:bg-white/[0.12]"
            >
              {cleaning ? t('settings.about.cleaning') : t('settings.about.cleanRuntimeData')}
            </Button>
          </div>
          {cleanResult.message ? (
            <div
              className={`text-xs ${cleanResult.type === 'error' ? 'text-[#f6a3ad]' : 'text-[#8A8A90]'}`}
            >
              {cleanResult.message}
              {cleanResult.paths.length > 0
                ? t('settings.about.cleanResultPaths', {
                    paths: cleanResult.paths.join(t('settings.about.cleanResultPathSeparator')),
                  })
                : ''}
            </div>
          ) : null}
          <div className="h-px w-full bg-white/[0.08]" />
        </div>

        <div className="mt-auto flex justify-center gap-4 pt-5">
          <Button
            variant="ghost"
            size="sm"
            className="h-auto rounded-lg px-0 text-[12px] font-semibold text-[#5E6AD2] hover:bg-transparent hover:text-[#5E6AD2] hover:opacity-80"
          >
            {t('settings.about.checkUpdates')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto rounded-lg px-0 text-[12px] font-semibold text-[#8A8A90] hover:bg-transparent hover:text-[#EDEDEF]"
          >
            {t('settings.about.documentation')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto rounded-lg px-0 text-[12px] font-semibold text-[#8A8A90] hover:bg-transparent hover:text-[#EDEDEF]"
          >
            {t('settings.about.github')}
          </Button>
        </div>
      </div>

      <AlertDialog open={cleanConfirmOpen} onOpenChange={setCleanConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.about.confirmCleanTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.about.confirmCleanDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cleaning}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                setCleanConfirmOpen(false);
                void handleCleanRuntimeData();
              }}
              disabled={cleaning}
            >
              {t('settings.about.continueClean')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
