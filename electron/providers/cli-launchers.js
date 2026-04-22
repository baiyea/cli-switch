const PROVIDERS = Object.freeze({
  CLAUDE: "claude",
  CODEX: "codex",
  GEMINI: "gemini"
});

function normalizeProviderId(provider) {
  const value = String(provider || PROVIDERS.CLAUDE).toLowerCase();
  if (value.includes(PROVIDERS.CODEX)) return PROVIDERS.CODEX;
  if (value.includes(PROVIDERS.GEMINI)) return PROVIDERS.GEMINI;
  return PROVIDERS.CLAUDE;
}

function getLaunchCommandForProvider(provider) {
  const id = normalizeProviderId(provider);
  if (id === PROVIDERS.CLAUDE) return "npx @anthropic-ai/claude-code@2.1.98 --dangerously-skip-permissions\n";
  if (id === PROVIDERS.CODEX) return "npx @openai/codex@0.121.0 --yolo\n";
  if (id === PROVIDERS.GEMINI) return "pnpx @google/gemini-cli@0.35.3 --approval-mode yolo\n";
  return "";
}

function getResumeCommandForProvider(provider, sessionId) {
  const id = normalizeProviderId(provider);
  const sid = String(sessionId || "").trim();
  if (!sid) return "";
  if (id === PROVIDERS.CLAUDE) return `npx @anthropic-ai/claude-code@2.1.98 --dangerously-skip-permissions -r ${sid}\n`;
  if (id === PROVIDERS.CODEX) return `npx @openai/codex@0.121.0 --yolo resume ${sid}\n`;
  if (id === PROVIDERS.GEMINI) return `pnpx @google/gemini-cli@0.35.3 --approval-mode yolo chat resume ${sid}\n`;
  return "";
}

function applyProviderStartupEnv(provider, env) {
  const id = normalizeProviderId(provider);
  const nextEnv = { ...(env || {}) };

  // Keep terminal output monochrome by default on light backgrounds.
  // User-specified env vars still win if explicitly configured.
  // if (!("NO_COLOR" in nextEnv) && !("FORCE_COLOR" in nextEnv)) {
  //   nextEnv.NO_COLOR = "1";
  //   nextEnv.CLICOLOR = "0";
  // }

  // Gemini CLI currently needs proxy in this user's setup.
  if (id === PROVIDERS.GEMINI) {
    if (!nextEnv.HTTP_PROXY) nextEnv.HTTP_PROXY = "http://127.0.0.1:7890";
    if (!nextEnv.HTTPS_PROXY) nextEnv.HTTPS_PROXY = "http://127.0.0.1:7890";
  }

  return nextEnv;
}

module.exports = {
  PROVIDERS,
  normalizeProviderId,
  getLaunchCommandForProvider,
  getResumeCommandForProvider,
  applyProviderStartupEnv
};
