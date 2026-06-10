import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';

export type TermEntry = {
  term: Terminal;
  fitAddon: FitAddon;
};

export type PtyDataStats = {
  chunks: number;
  totalLength: number;
  lastLogAt: number;
};

