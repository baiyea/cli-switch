export interface SkillgenRunPayload {
  projectId?: string;
  trigger?: string;
  force?: boolean;
}

export type SkillgenRunResult =
  | {
    ok: boolean;
    skipped?: boolean;
    reason?: string;
    projectId?: string;
    trigger?: string;
    processed?: number;
    created?: number;
    updated?: number;
    drafted?: number;
    discarded?: number;
  }
  | Array<Record<string, unknown>>;

export const skillgenBridge = {
  run(payload?: SkillgenRunPayload): Promise<SkillgenRunResult> {
    return window.electronAPI.skillgen.run(payload);
  }
};
