export function isWindowsPlatform(platform = navigator.platform) {
  return /Win32|Win64/i.test(String(platform || ''));
}

