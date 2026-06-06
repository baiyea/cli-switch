import { useState } from 'react';

import { useT } from '../../../../i18n/use-t';
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
    <div className="about-settings-section h-full flex flex-col">
      <div className="flex-1 flex flex-col gap-3.5">
        <div className="flex items-center gap-3.5">
          {appLogo ? (
            <img
              src={appLogo}
              alt="Cli-Switch logo"
              className="h-20 w-20 rounded-lg object-cover"
            />
          ) : (
            <div className="about-logo-placeholder flex h-20 w-20 items-center justify-center rounded-lg">
              <span className="text-[30px] text-white">▣</span>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <div className="about-title text-[22px] font-extrabold tracking-tight">
              Cli-Switch
            </div>
            <div className="about-muted text-[12px]">
              {t('settings.about.tagline')}
            </div>
          </div>
        </div>

        <div className="about-divider h-px w-full" />

        <div className="flex flex-col gap-2.5">
          <div className="flex justify-between items-center">
            <span className="about-muted text-[12px]">{t('settings.about.platform')}</span>
            <span className="about-value text-[12px] font-semibold">
              Electron + React + TypeScript
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="about-muted text-[12px]">
              {t('settings.about.terminalCore')}
            </span>
            <span className="about-value text-[12px] font-semibold">@xterm/xterm v5.x</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="about-muted text-[12px]">{t('settings.about.storage')}</span>
            <span className="about-value text-[12px] font-semibold">SQLite 3 (Local)</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="about-muted text-[12px]">{t('settings.about.version')}</span>
            <span className="about-value text-[12px] font-semibold">{appVersion}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="about-divider h-px w-full" />
          <div className="flex items-center justify-between">
            <span className="about-muted text-[12px]">{t('settings.about.appData')}</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setCleanConfirmOpen(true)}
              disabled={cleaning}
              className="about-clean-btn h-7 rounded-[4px] border px-3 text-[12px] font-semibold transition-opacity duration-150"
            >
              {cleaning ? t('settings.about.cleaning') : t('settings.about.cleanRuntimeData')}
            </Button>
          </div>
          {cleanResult.message ? (
            <div
              className={`about-result text-xs ${cleanResult.type === 'error' ? 'is-error' : ''}`}
            >
              {cleanResult.message}
              {cleanResult.paths.length > 0
                ? t('settings.about.cleanResultPaths', {
                    paths: cleanResult.paths.join(t('settings.about.cleanResultPathSeparator')),
                  })
                : ''}
            </div>
          ) : null}
          <div className="about-divider h-px w-full" />
        </div>

        <div className="mt-auto flex justify-center gap-4 pt-5">
          <Button
            variant="ghost"
            size="sm"
            className="about-link about-link-primary h-auto rounded-lg px-0 text-[12px] font-semibold hover:bg-transparent hover:opacity-80"
          >
            {t('settings.about.checkUpdates')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="about-link h-auto rounded-lg px-0 text-[12px] font-semibold hover:bg-transparent"
          >
            {t('settings.about.documentation')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="about-link h-auto rounded-lg px-0 text-[12px] font-semibold hover:bg-transparent"
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
