// Global foundational types only.

export type ProviderId = "claude" | "codex" | "gemini";

export interface Result<T = unknown> {
  ok: boolean;
  data?: T;
  message?: string;
}
