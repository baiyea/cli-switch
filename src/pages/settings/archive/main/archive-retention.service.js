const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function createDefaultProviderRoots(homeDir = os.homedir()) {
  return {
    claude: [path.join(homeDir, '.claude', 'projects')],
    codex: [path.join(homeDir, '.codex', 'sessions')],
    gemini: [path.join(homeDir, '.gemini', 'tmp')],
  };
}

function normalizeRoots(input) {
  const roots = input && typeof input === 'object' ? input : createDefaultProviderRoots();
  return Object.fromEntries(
    Object.entries(roots).map(([provider, values]) => [
      String(provider || '').toLowerCase(),
      (Array.isArray(values) ? values : [values])
        .filter(Boolean)
        .map((value) => path.resolve(String(value))),
    ]),
  );
}

function isInsideRoot(filePath, roots) {
  const target = path.resolve(String(filePath || ''));
  for (const root of roots || []) {
    const relative = path.relative(root, target);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) return true;
  }
  return false;
}

function createArchiveRetentionService({
  sessionStore,
  providerRoots,
  now = () => new Date(),
  retentionDays = DEFAULT_RETENTION_DAYS,
  logInfo = () => {},
  logWarn = () => {},
} = {}) {
  if (!sessionStore) throw new TypeError('createArchiveRetentionService: sessionStore is required');
  const rootsByProvider = normalizeRoots(providerRoots);

  function cleanupExpiredArchivedSessions(options = {}) {
    const days = Number.isFinite(options.retentionDays) ? options.retentionDays : retentionDays;
    const nowDate = now();
    const nowMs = nowDate instanceof Date ? nowDate.getTime() : new Date(nowDate).getTime();
    const cutoffIso = new Date(nowMs - days * DAY_MS).toISOString();
    const rows = sessionStore.listExpiredArchivedSessions(cutoffIso);
    const report = {
      ok: true,
      retentionDays: days,
      cutoffIso,
      scanned: rows.length,
      deletedRecords: 0,
      deletedFiles: 0,
      missingFiles: 0,
      skipped: 0,
      cleanedFiles: [],
      warnings: [],
    };

    for (const row of rows) {
      const sessionFilePath = String(row?.session_file_path || '').trim();
      const provider = String(row?.provider || '').toLowerCase();
      const providerSessionId = String(row?.provider_session_id || '');
      const roots = rootsByProvider[provider] || [];
      if (sessionFilePath && !isInsideRoot(sessionFilePath, roots)) {
        report.skipped += 1;
        const warning = `skip ${provider}:${providerSessionId}: outside provider session roots`;
        report.warnings.push(warning);
        logWarn('archive', warning, { sessionFilePath });
        continue;
      }

      if (sessionFilePath && fs.existsSync(sessionFilePath)) {
        let stat;
        try {
          stat = fs.lstatSync(sessionFilePath);
        } catch (error) {
          report.skipped += 1;
          const warning = `skip ${provider}:${providerSessionId}: stat failed`;
          report.warnings.push(`${warning}: ${error.message || String(error)}`);
          logWarn('archive', warning, { sessionFilePath, error });
          continue;
        }
        if (!stat.isFile()) {
          report.skipped += 1;
          const warning = `skip ${provider}:${providerSessionId}: session path is not a file`;
          report.warnings.push(warning);
          logWarn('archive', warning, { sessionFilePath });
          continue;
        }
        try {
          fs.rmSync(sessionFilePath, { force: true });
          report.deletedFiles += 1;
          report.cleanedFiles.push(sessionFilePath);
        } catch (error) {
          report.skipped += 1;
          const warning = `skip ${provider}:${providerSessionId}: file delete failed`;
          report.warnings.push(`${warning}: ${error.message || String(error)}`);
          logWarn('archive', warning, { sessionFilePath, error });
          continue;
        }
      } else if (sessionFilePath) {
        report.missingFiles += 1;
      }

      const result = sessionStore.deleteArchivedSessionById(row.id);
      if (result?.changes > 0 || result === true) {
        report.deletedRecords += 1;
      }
    }

    logInfo('archive', 'Expired archived sessions cleaned', {
      scanned: report.scanned,
      deletedRecords: report.deletedRecords,
      deletedFiles: report.deletedFiles,
      missingFiles: report.missingFiles,
      skipped: report.skipped,
    });
    return report;
  }

  return { cleanupExpiredArchivedSessions };
}

module.exports = {
  createArchiveRetentionService,
  createDefaultProviderRoots,
};
