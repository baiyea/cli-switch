export function supportsImagePasteForProvider(provider, platform = '') {
  const normalized = String(provider || '').toLowerCase();
  return (
    normalized === 'claude' ||
    normalized === 'codex' ||
    normalized === 'gemini' ||
    /Win32|Win64/.test(String(platform || ''))
  );
}
