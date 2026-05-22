const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createRuntimeDataCleaner({
  APP_ID,
  appHomeDir,
  db,
  dbPath,
  ptyService,
  clearDirectoryContentsSafe,
  removeFileSafe,
}) {
  return function cleanRuntimeData() {
    const report = {
      runtimeDirs: [],
      dbPath,
      cleanedDirectories: [],
      cleanedFiles: [],
      warnings: [],
    };

    const runtimeDirs = Array.from(
      new Set([
        path.join(os.homedir(), `.${APP_ID}`),
        path.join(os.homedir(), `.${APP_ID}-dev`),
        appHomeDir,
      ]),
    ).map((item) => path.resolve(item));

    report.runtimeDirs = runtimeDirs;
    ptyService.destroyAll();

    try {
      db.exec('BEGIN');
      db.exec('DELETE FROM sessions');
      db.exec('DELETE FROM projects');
      db.exec('DELETE FROM app_settings');
      db.exec('COMMIT');
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {}
      throw error;
    }

    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch (error) {
      report.warnings.push(`WAL checkpoint 失败: ${error.message || String(error)}`);
    }
    try {
      db.exec('VACUUM');
    } catch (error) {
      report.warnings.push(`VACUUM 失败: ${error.message || String(error)}`);
    }

    const activeDbPath = path.resolve(dbPath);
    removeFileSafe(`${activeDbPath}-wal`, report);
    removeFileSafe(`${activeDbPath}-shm`, report);

    for (const runtimeDir of runtimeDirs) {
      const cacheDir = path.join(runtimeDir, 'cache');
      const logsDir = path.join(runtimeDir, 'logs');
      const tmpDir = path.join(runtimeDir, '.tmp');
      clearDirectoryContentsSafe(cacheDir, report);
      clearDirectoryContentsSafe(logsDir, report);
      clearDirectoryContentsSafe(tmpDir, report);

      if (!fs.existsSync(runtimeDir)) continue;
      let entries = [];
      try {
        entries = fs.readdirSync(runtimeDir, { withFileTypes: true });
      } catch (error) {
        report.warnings.push(`读取目录失败: ${runtimeDir} (${error.message || String(error)})`);
        continue;
      }
      for (const entry of entries) {
        if (!entry?.isFile?.()) continue;
        const fileName = String(entry.name || '');
        const absPath = path.join(runtimeDir, fileName);
        if (absPath === activeDbPath) continue;
        if (/\.sqlite(?:-wal|-shm)?$/i.test(fileName) || /\.db$/i.test(fileName)) {
          removeFileSafe(absPath, report);
        }
      }
    }

    return {
      ok: true,
      message: '运行数据已清理',
      ...report,
    };
  };
}

module.exports = {
  createRuntimeDataCleaner,
};
