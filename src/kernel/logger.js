const log = require('electron-log');
const path = require('node:path');
const { IS_E2E, getAppHomeDir, ensureDir } = require('./test-mode');

function initLogger() {
  const logsDir = path.join(getAppHomeDir(), 'logs');
  ensureDir(logsDir);

  log.transports.file.resolvePathFn = () => path.join(logsDir, 'main.log');
  log.transports.file.level = IS_E2E ? 'error' : 'info';
  log.transports.console.level = IS_E2E ? 'error' : 'info';

  return log;
}

function toLogError(error) {
  if (!error) return {};
  return {
    message: error.message || String(error),
    stack: error.stack || '',
  };
}

function sanitizeLogText(value) {
  return String(value || '')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function formatLogLine(scope, message, meta) {
  const prefix = `[${sanitizeLogText(scope)}] ${sanitizeLogText(message)}`.trim();
  if (meta === undefined || meta === null) return prefix;
  try {
    const metaText = JSON.stringify(meta);
    if (!metaText || metaText === '{}') return prefix;
    return `${prefix} ${sanitizeLogText(metaText)}`;
  } catch {
    return prefix;
  }
}

function logInfo(scope, message, meta) {
  log.info(formatLogLine(scope, message, meta));
}

function logWarn(scope, message, meta) {
  log.warn(formatLogLine(scope, message, meta));
}

function _logError(scope, message, error, meta) {
  log.error(formatLogLine(scope, message, { ...(meta || {}), ...toLogError(error) }));
}

function logDebug(scope, message, meta) {
  log.debug(formatLogLine(scope, message, meta));
}

function logByLevel(level, scope, message, meta) {
  if (level === 'error') {
    log.error(formatLogLine(scope, message, meta));
    return;
  }
  if (level === 'warn') {
    log.warn(formatLogLine(scope, message, meta));
    return;
  }
  if (level === 'debug') {
    log.debug(formatLogLine(scope, message, meta));
    return;
  }
  log.info(formatLogLine(scope, message, meta));
}

module.exports = {
  initLogger,
  toLogError,
  sanitizeLogText,
  formatLogLine,
  logInfo,
  logWarn,
  logError: _logError,
  logDebug,
  logByLevel,
};
