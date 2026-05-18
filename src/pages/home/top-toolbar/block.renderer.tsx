import { TopToolbar } from "./renderer/TopToolbar";
import { SkillgenResultDialog } from "./renderer/SkillgenResultDialog";

export { TopToolbar, SkillgenResultDialog };

export const topToolbarRenderer = {
  panels: {
    toolbar: TopToolbar,
    skillgenResult: SkillgenResultDialog,
  },
};
