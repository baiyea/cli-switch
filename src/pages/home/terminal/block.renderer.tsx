import { RenameSessionDialog } from './renderer/RenameSessionDialog';
import { TerminalPanel } from './renderer/TerminalPanel';

export { RenameSessionDialog, TerminalPanel };

export const terminalRenderer = {
  panels: {
    main: TerminalPanel,
  },
};
