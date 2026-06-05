const { normalizeLocale } = require('./i18n.registry');

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toValidDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatNumber(value, locale = 'zh-CN') {
  return new Intl.NumberFormat(normalizeLocale(locale)).format(toFiniteNumber(value));
}

function formatTokenCount(value, locale = 'zh-CN') {
  const millions = toFiniteNumber(value) / 1000000;
  return `${new Intl.NumberFormat(normalizeLocale(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(millions)}M`;
}

function formatDateLabel(value, locale = 'zh-CN') {
  const date = toValidDate(value);
  if (!date) return '--';

  return new Intl.DateTimeFormat(normalizeLocale(locale), {
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function formatDateTime(value, locale = 'zh-CN') {
  const normalizedLocale = normalizeLocale(locale);
  const date = toValidDate(value);
  if (!date) {
    return normalizedLocale === 'en-US' ? 'Not synced yet' : '尚未同步';
  }

  return new Intl.DateTimeFormat(normalizedLocale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

module.exports = {
  formatDateLabel,
  formatDateTime,
  formatNumber,
  formatTokenCount,
};
