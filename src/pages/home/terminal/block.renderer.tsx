import { TerminalPanel } from "./renderer/TerminalPanel";
import { RenameSessionDialog } from "./renderer/RenameSessionDialog";

export { TerminalPanel, RenameSessionDialog };

export const terminalRenderer = {
  panels: {
    main: TerminalPanel,
  },
};
