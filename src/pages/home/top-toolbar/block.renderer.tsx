import { SkillgenResultDialog } from './renderer/SkillgenResultDialog';
import { TopToolbar } from './renderer/TopToolbar';

export { SkillgenResultDialog, TopToolbar };

export const topToolbarRenderer = {
  panels: {
    toolbar: TopToolbar,
    skillgenResult: SkillgenResultDialog,
  },
};
