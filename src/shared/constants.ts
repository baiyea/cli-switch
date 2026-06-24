export const QUICK_LAUNCH: Record<string, string> = {
  'Claude Code': 'npx @anthropic-ai/claude-code@2.1.185 --dangerously-skip-permissions\n',
  Codex: 'npx @openai/codex@0.141.0 --dangerously-bypass-approvals-and-sandbox\n',
  Gemini: 'pnpx @google/gemini-cli@0.47.0 --approval-mode yolo\n',
  Shell: '',
};
