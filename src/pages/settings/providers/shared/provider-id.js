export function normalizeProviderId(provider) {
  const value = String(provider || '').toLowerCase();
  if (value === 'claude' || value === 'codex' || value === 'gemini') return value;
  return 'claude';
}
