const fs = require('node:fs');

function toTimestampMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function readJsonlObjects(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = String(raw || '')
    .split(/\r?\n/)
    .filter(Boolean);
  const output = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === 'object') output.push(parsed);
    } catch {}
  }
  return output;
}

function countConversationRounds(turns = []) {
  let rounds = 0;
  let pendingUser = false;
  for (const turn of turns) {
    if (!turn || typeof turn !== 'object') continue;
    const role = String(turn.role || '').toLowerCase();
    if (role === 'user') {
      pendingUser = true;
      continue;
    }
    if (role === 'assistant' && pendingUser) {
      rounds += 1;
      pendingUser = false;
    }
  }
  return rounds;
}

function buildEmptyTokenStats() {
  return {
    input: 0,
    output: 0,
    cached: 0,
    reasoning: 0,
    tool: 0,
    total: 0,
    available: false,
  };
}

function finalizeSessionStats({
  provider,
  providerSessionId,
  sourcePath,
  startedAt,
  endedAt,
  rounds,
  tokens,
}) {
  const safeStartedAt = Number.isFinite(startedAt) ? startedAt : null;
  const safeEndedAt = Number.isFinite(endedAt) ? endedAt : null;
  const nowMs = Date.now();
  const durationMs =
    safeStartedAt != null
      ? Math.max(0, (safeEndedAt != null ? safeEndedAt : nowMs) - safeStartedAt)
      : 0;
  return {
    provider,
    providerSessionId,
    sourcePath,
    startedAt: safeStartedAt,
    endedAt: safeEndedAt,
    durationMs,
    rounds: Number.isFinite(rounds) ? Math.max(0, Math.floor(rounds)) : 0,
    tokens: {
      input: Math.max(0, Math.floor(Number(tokens?.input || 0))),
      output: Math.max(0, Math.floor(Number(tokens?.output || 0))),
      cached: Math.max(0, Math.floor(Number(tokens?.cached || 0))),
      reasoning: Math.max(0, Math.floor(Number(tokens?.reasoning || 0))),
      tool: Math.max(0, Math.floor(Number(tokens?.tool || 0))),
      total: Math.max(0, Math.floor(Number(tokens?.total || 0))),
      available: Boolean(tokens?.available),
    },
  };
}

function createSessionStatsReader(deps = {}) {
  const {
    listProviderSessions,
    normalizeProviderId,
    extractConversationText,
    extractMessageTextBlocks,
    extractTextFromContentValue,
    isSkippableConversationText,
  } = deps;

  function parseClaudeSessionStats({ filePath, providerSessionId }) {
    const events = readJsonlObjects(filePath);
    const turns = [];
    const perMessageUsage = new Map();
    let startedAt = null;
    let endedAt = null;

    for (let i = 0; i < events.length; i += 1) {
      const parsed = events[i];
      const ts = toTimestampMs(parsed?.timestamp);
      if (ts != null) {
        startedAt = startedAt == null ? ts : Math.min(startedAt, ts);
        endedAt = endedAt == null ? ts : Math.max(endedAt, ts);
      }

      const role = String(parsed?.message?.role || parsed?.role || parsed?.type || '').toLowerCase();
      if ((role === 'user' || role === 'assistant') && !parsed?.isMeta) {
        const text = extractConversationText(parsed?.message?.content ?? parsed?.content);
        if (!isSkippableConversationText(text)) turns.push({ role, text });
      }

      const usage = parsed?.message?.usage;
      if (!usage || typeof usage !== 'object') continue;
      const messageKey = String(parsed?.message?.id || parsed?.uuid || `line:${i}`);
      const prev = perMessageUsage.get(messageKey) || buildEmptyTokenStats();
      const next = {
        input: Math.max(prev.input, Number(usage.input_tokens || usage.prompt_tokens || 0)),
        output: Math.max(prev.output, Number(usage.output_tokens || 0)),
        cached: Math.max(
          prev.cached,
          Number(usage.cache_read_input_tokens || usage.cached_tokens || 0),
        ),
        reasoning: Math.max(prev.reasoning, Number(usage.reasoning_output_tokens || 0)),
        tool: Math.max(prev.tool, Number(usage.tool_tokens || 0)),
        total: 0,
        available: true,
      };
      next.total = Math.max(prev.total, Number(usage.total_tokens || 0), next.input + next.output);
      perMessageUsage.set(messageKey, next);
    }

    const mergedTokens = buildEmptyTokenStats();
    for (const usage of perMessageUsage.values()) {
      mergedTokens.input += usage.input;
      mergedTokens.output += usage.output;
      mergedTokens.cached += usage.cached;
      mergedTokens.reasoning += usage.reasoning;
      mergedTokens.tool += usage.tool;
      mergedTokens.total += usage.total || usage.input + usage.output;
      mergedTokens.available = mergedTokens.available || usage.available;
    }

    return finalizeSessionStats({
      provider: 'claude',
      providerSessionId,
      sourcePath: filePath,
      startedAt,
      endedAt,
      rounds: countConversationRounds(turns),
      tokens: mergedTokens,
    });
  }

  function parseCodexSessionStats({ filePath, providerSessionId }) {
    const events = readJsonlObjects(filePath);
    const turns = [];
    const tokenTotals = buildEmptyTokenStats();
    let startedAt = null;
    let endedAt = null;

    for (const parsed of events) {
      const ts = toTimestampMs(parsed?.timestamp);
      if (ts != null) {
        startedAt = startedAt == null ? ts : Math.min(startedAt, ts);
        endedAt = endedAt == null ? ts : Math.max(endedAt, ts);
      }

      if (parsed?.type === 'event_msg' && parsed?.payload?.type === 'user_message') {
        const text = String(parsed?.payload?.message || '').trim();
        if (text) turns.push({ role: 'user', text });
      }

      if (parsed?.type === 'response_item' && parsed?.payload?.type === 'message') {
        const role = String(parsed?.payload?.role || '').toLowerCase();
        if (role !== 'user' && role !== 'assistant') continue;
        const text = extractMessageTextBlocks(parsed?.payload?.content || []);
        if (text) turns.push({ role, text });
      }

      if (parsed?.type === 'event_msg' && parsed?.payload?.type === 'token_count') {
        const usage = parsed?.payload?.info?.total_token_usage;
        if (!usage || typeof usage !== 'object') continue;
        tokenTotals.input = Math.max(tokenTotals.input, Number(usage.input_tokens || 0));
        tokenTotals.cached = Math.max(tokenTotals.cached, Number(usage.cached_input_tokens || 0));
        tokenTotals.output = Math.max(tokenTotals.output, Number(usage.output_tokens || 0));
        tokenTotals.reasoning = Math.max(
          tokenTotals.reasoning,
          Number(usage.reasoning_output_tokens || 0),
        );
        tokenTotals.total = Math.max(
          tokenTotals.total,
          Number(usage.total_tokens || tokenTotals.input + tokenTotals.output),
        );
        tokenTotals.available = true;
      }
    }

    return finalizeSessionStats({
      provider: 'codex',
      providerSessionId,
      sourcePath: filePath,
      startedAt,
      endedAt,
      rounds: countConversationRounds(turns),
      tokens: tokenTotals,
    });
  }

  function parseGeminiSessionStats({ filePath, providerSessionId }) {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const messages = Array.isArray(payload?.messages) ? payload.messages : [];
    const turns = [];
    const tokenTotals = buildEmptyTokenStats();

    let startedAt = toTimestampMs(payload?.startTime);
    let endedAt = toTimestampMs(payload?.lastUpdated);

    for (const message of messages) {
      const role = String(message?.type || '').toLowerCase();
      const ts = toTimestampMs(message?.timestamp);
      if (ts != null) {
        startedAt = startedAt == null ? ts : Math.min(startedAt, ts);
        endedAt = endedAt == null ? ts : Math.max(endedAt, ts);
      }

      if (role === 'user' || role === 'gemini') {
        const text = extractTextFromContentValue(message?.content);
        if (text) turns.push({ role: role === 'gemini' ? 'assistant' : 'user', text });
      }

      if (role === 'gemini' && message?.tokens && typeof message.tokens === 'object') {
        const usage = message.tokens;
        tokenTotals.input = Math.max(tokenTotals.input, Number(usage.input || 0));
        tokenTotals.cached = Math.max(tokenTotals.cached, Number(usage.cached || 0));
        tokenTotals.output = Math.max(tokenTotals.output, Number(usage.output || 0));
        tokenTotals.reasoning = Math.max(tokenTotals.reasoning, Number(usage.thoughts || 0));
        tokenTotals.tool = Math.max(tokenTotals.tool, Number(usage.tool || 0));
        tokenTotals.total = Math.max(
          tokenTotals.total,
          Number(usage.total || tokenTotals.input + tokenTotals.output),
        );
        tokenTotals.available = true;
      }
    }

    return finalizeSessionStats({
      provider: 'gemini',
      providerSessionId,
      sourcePath: filePath,
      startedAt,
      endedAt,
      rounds: countConversationRounds(turns),
      tokens: tokenTotals,
    });
  }

  function resolveSessionFilePathForStats({ provider, providerSessionId, row }) {
    const fromRow = String(row?.session_file_path || '').trim();
    if (fromRow && fs.existsSync(fromRow)) return fromRow;
    if (!providerSessionId) return '';

    const discovered = listProviderSessions();
    const matched = discovered.find(
      (item) =>
        normalizeProviderId(item?.provider) === provider &&
        String(item?.providerSessionId || '') === String(providerSessionId),
    );
    return String(matched?.sessionFilePath || '').trim();
  }

  return function readSessionStats({ provider, providerSessionId, row }) {
    const filePath = resolveSessionFilePathForStats({ provider, providerSessionId, row });
    if (!filePath) throw new Error('session file not found');
    if (!fs.existsSync(filePath)) throw new Error('session file missing');

    if (provider === 'claude') return parseClaudeSessionStats({ filePath, providerSessionId });
    if (provider === 'codex') return parseCodexSessionStats({ filePath, providerSessionId });
    if (provider === 'gemini') return parseGeminiSessionStats({ filePath, providerSessionId });

    throw new Error(`unsupported provider: ${provider}`);
  };
}

module.exports = { createSessionStatsReader };
