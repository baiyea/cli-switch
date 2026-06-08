import type { ITheme } from '@xterm/xterm';

import type { EffectiveTheme } from '../../../../ui/theme/theme.store';

const darkXtermTheme: ITheme = {
  background: '#0b0d10',
  foreground: '#d9e1ee',
  cursor: '#e8eefc',
  selectionBackground: 'rgba(120, 145, 190, 0.35)',
  black: '#0b0d10',
  red: '#ff6b6b',
  green: '#39d98a',
  yellow: '#f5c86a',
  blue: '#6aa9ff',
  magenta: '#c792ea',
  cyan: '#66d9ef',
  white: '#d9e1ee',
  brightBlack: '#5e6a7f',
  brightRed: '#ff8a8a',
  brightGreen: '#5ae7a1',
  brightYellow: '#ffd98a',
  brightBlue: '#8cc0ff',
  brightMagenta: '#ddb0ff',
  brightCyan: '#8ae8ff',
  brightWhite: '#f3f6fc',
};

const lightXtermTheme: ITheme = {
  background: '#f8fafc',
  foreground: '#1f2937',
  cursor: '#111827',
  selectionBackground: 'rgba(37, 99, 235, 0.24)',
  black: '#111827',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#ca8a04',
  blue: '#2563eb',
  magenta: '#9333ea',
  cyan: '#0891b2',
  white: '#e5e7eb',
  brightBlack: '#6b7280',
  brightRed: '#ef4444',
  brightGreen: '#22c55e',
  brightYellow: '#eab308',
  brightBlue: '#3b82f6',
  brightMagenta: '#a855f7',
  brightCyan: '#06b6d4',
  brightWhite: '#ffffff',
};

export function getXtermTheme(theme: EffectiveTheme): ITheme {
  return theme === 'light' ? lightXtermTheme : darkXtermTheme;
}
