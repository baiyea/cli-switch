import { useState } from "react";
import { topToolbarBridge } from "./top-toolbar.bridge";

export function useSkillgenRunner({ activeProject, activeSessionId, setAppError }) {
  const [skillgenModalOpen, setSkillgenModalOpen] = useState(false);
  const [skillgenRunning, setSkillgenRunning] = useState(false);
  const [skillgenResult, setSkillgenResult] = useState(null);

  async function onRunSkillgen() {
    if (!activeProject?.id) {
      setAppError?.("请先选择一个项目后再生成 Skill");
      return;
    }
    setAppError?.("");
    setSkillgenModalOpen(true);
    setSkillgenRunning(true);
    setSkillgenResult(null);
    try {
      const result = await topToolbarBridge.skillgen.run({
        projectId: activeProject.id,
        trigger: "manual",
        rebuild: false,
        focusSessionId: activeSessionId || ""
      });
      setSkillgenResult(result);
    } catch (e) {
      const rawMessage = e?.message || "Skill 生成失败";
      const noHandler = /No handler registered for 'skillgen:run'/i.test(rawMessage);
      setSkillgenResult({
        ok: false,
        error: noHandler
          ? "主进程尚未加载 SKILLGEN_RUN 处理器。请重启应用（开发模式请重启 `pnpm run dev`）后重试。"
          : rawMessage
      });
    } finally {
      setSkillgenRunning(false);
    }
  }

  return {
    skillgenRunning,
    onRunSkillgen,
    skillgenResultDialogProps: {
      open: skillgenModalOpen,
      running: skillgenRunning,
      result: skillgenResult,
      onClose: () => setSkillgenModalOpen(false)
    }
  };
}
