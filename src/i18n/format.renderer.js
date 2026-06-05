const DEFAULT_LOCALE = 'zh-CN';
const SUPPORTED_LOCALES = ['zh-CN', 'en-US'];

function normalizeLocale(value) {
  return SUPPORTED_LOCALES.includes(value) ? value : DEFAULT_LOCALE;
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toValidDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatNumber(value, locale = DEFAULT_LOCALE) {
  return new Intl.NumberFormat(normalizeLocale(locale)).format(toFiniteNumber(value));
}

function formatTokenCount(value, locale = DEFAULT_LOCALE) {
  const millions = toFiniteNumber(value) / 1000000;
  return `${new Intl.NumberFormat(normalizeLocale(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(millions)}M`;
}

function formatDateLabel(value, locale = DEFAULT_LOCALE) {
  const date = toValidDate(value);
  if (!date) return '--';

  return new Intl.DateTimeFormat(normalizeLocale(locale), {
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function formatDateTime(value, locale = DEFAULT_LOCALE) {
  const normalizedLocale = normalizeLocale(locale);
  const date = toValidDate(value);
  if (!date) {
    return '--';
  }

  return new Intl.DateTimeFormat(normalizedLocale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export { formatDateLabel, formatDateTime, formatNumber, formatTokenCount };
