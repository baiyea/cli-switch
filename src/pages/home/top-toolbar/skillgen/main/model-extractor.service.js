function shortBody(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function shortBodyLong(text, maxLen = 800) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extractJsonArrayFromText(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return [];
  const direct = (() => {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();
  if (direct.length > 0) return direct;

  const codeMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeMatch?.[1]) {
    try {
      const parsed = JSON.parse(codeMatch[1].trim());
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }

  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch?.[0]) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return [];
}

function normalizeSkillCandidateItem(item) {
  if (!item || typeof item !== 'object') return null;
  const title = String(item.title || item.name || '').trim();
  if (!title) return null;
  const toArray = (value, maxItems = 12, maxLen = 260) => {
    const arr = Array.isArray(value) ? value : value ? [value] : [];
    const out = [];
    const seen = new Set();
    for (const entry of arr) {
      const text = String(entry || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLen);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      out.push(text);
      if (out.length >= maxItems) break;
    }
    return out;
  };
  return {
    title,
    summary: String(item.summary || item.description || '').trim(),
    description: String(item.description || item.summary || '').trim(),
    tags: toArray(item.tags || [], 8, 32),
    steps: toArray(item.steps || [], 12, 260),
    whenToUse: toArray(item.whenToUse || item.when_to_use || [], 10, 220),
    validation: toArray(item.validation || [], 10, 220),
    antiPatterns: toArray(item.antiPatterns || item.anti_patterns || item.pitfalls || [], 10, 220),
    commands: toArray(item.commands || [], 10, 260),
    evidence: toArray(item.evidence || [], 10, 260),
    contexts: toArray(item.contexts || item.context || [], 8, 260),
    slug: String(item.slug || '').trim(),
  };
}

function sanitizeSkillgenCandidates(rawItems = []) {
  const normalized = [];
  for (const item of rawItems || []) {
    const next = normalizeSkillCandidateItem(item);
    if (!next) continue;
    normalized.push(next);
  }
  return normalized;
}

function createSkillgenModelExtractor(deps = {}) {
  const {
    normalizeProviderId,
    getStartupEnvForProvider,
    parseLatestConversationRoundFromSessionFile,
    buildAnthropicCompatHeaders,
    sanitizeModelResponsePreview,
    previewPayloadForLog,
    extractTitleTextFromOpenAiResponse,
    extractTitleTextFromClaudeResponse,
    extractClaudeThinkingPreview,
    extractTitleTextFromGeminiResponse,
    cleanText = (value) => String(value || '').trim(),
    logInfo = () => {},
    logWarn = () => {},
  } = deps;

  function pickSuccessfulEvidenceLines(transcript = [], maxItems = 48) {
    const lines = Array.isArray(transcript) ? transcript : [];
    const evidencePatterns = [
      /\bexit=0\b/i,
      /\bpassed?\b/i,
      /\bsuccess(?:ful|fully)?\b/i,
      /\bcompleted?\b/i,
      /已完成|构建成功|测试通过|执行成功|更新成功|创建成功/,
    ];
    const fallbackPatterns = [/\bcreated?\b/i, /\bupdated?\b/i, /\brenamed?\b/i, /\bbuild\b/i, /\btest\b/i];
    const picked = [];
    const seen = new Set();
    for (const rawLine of lines) {
      const line = cleanText(rawLine);
      if (!line || seen.has(line)) continue;
      const hitStrong = evidencePatterns.some((pattern) => pattern.test(line));
      const hitWeak = fallbackPatterns.some((pattern) => pattern.test(line));
      if (!hitStrong && !hitWeak) continue;
      seen.add(line);
      picked.push(line);
      if (picked.length >= maxItems) break;
    }
    return picked;
  }

  function buildSkillExtractionPrompt({ transcript = [], sessionFilePath = '' } = {}) {
    const lines = Array.isArray(transcript) ? transcript.slice(-200) : [];
    const recentContextLines = lines.slice(-140);
    const evidenceLines = pickSuccessfulEvidenceLines(lines, 48);
    const { latestUserText, latestAssistantText } = sessionFilePath
      ? parseLatestConversationRoundFromSessionFile(sessionFilePath)
      : { latestUserText: '', latestAssistantText: '' };
    const latestUser = cleanText(latestUserText).slice(0, 800);
    const latestAssistant = cleanText(latestAssistantText).slice(0, 800);
    const context = recentContextLines.join('\n');
    const evidence = evidenceLines.length > 0 ? evidenceLines.join('\n') : '(none)';
    return [
      '你是工程团队的技能萃取助手。',
      '任务：从下面会话里提取“已成功执行、可复用”的技能案例。',
      '严格要求：',
      '1) 只提取有成功证据的案例（例如 exit=0 / passed / success / 已完成 / 构建成功）。',
      '2) 不要提取失败、调研、闲聊。',
      '3) 输出必须是 JSON 数组，不要 markdown，不要解释。',
      '4) 每个元素字段：title, summary, steps[], whenToUse[], validation[], antiPatterns[], commands[], evidence[], tags[]。',
      '5) title 必须中文，10字以内，任务导向（例如：检查容器挂载）。',
      '6) 最多返回 5 条；没有就返回 []。',
      '',
      '最新一轮对话（用于判断当前目标）：',
      `- 用户：${latestUser || '(empty)'}`,
      `- 助手：${latestAssistant || '(empty)'}`,
      '',
      '成功证据候选片段（优先依赖这一段提炼技能）：',
      evidence,
      '',
      '会话转录片段（最近窗口）：',
      context || '(empty)',
    ].join('\n');
  }

  async function extractSkillCandidatesByOpenAi({ env, requestId, prompt }) {
    const apiKey = String(env.OPENAI_API_KEY || '').trim();
    if (!apiKey) throw new Error('missing OPENAI_API_KEY');
    const base = String(env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/+$/, '');
    const model = String(env.OPENAI_MODEL || env.MODEL || 'gpt-4o-mini').trim();
    const url = `${base}/v1/chat/completions`;
    logInfo('skillgen-llm', 'OpenAI skill extraction request', {
      requestId,
      model,
      url,
      promptPreview: shortBodyLong(prompt, 320),
    });
    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: 900,
          messages: [
            { role: 'system', content: '你只输出 JSON 数组，不要解释。' },
            { role: 'user', content: prompt },
          ],
        }),
      },
      20000,
    );
    if (!response.ok) {
      const rawBody = await response.text();
      const body = shortBody(rawBody);
      logWarn('skillgen-llm', 'OpenAI skill extraction http failed', {
        requestId,
        model,
        status: response.status,
        bodyPreview: shortBodyLong(sanitizeModelResponsePreview(rawBody), 1200),
      });
      throw new Error(`openai http ${response.status}${body ? ` ${body}` : ''}`);
    }
    const data = await response.json();
    const text = extractTitleTextFromOpenAiResponse(data);
    if (!text) {
      logWarn('skillgen-llm', 'OpenAI skill extraction empty content', {
        requestId,
        model,
        responsePreview: previewPayloadForLog(data, 1400),
      });
      throw new Error('openai empty content');
    }
    const parsed = extractJsonArrayFromText(text);
    if (parsed.length === 0) throw new Error('openai invalid json array');
    logInfo('skillgen-llm', 'OpenAI skill extraction response', {
      requestId,
      model,
      rawPreview: shortBodyLong(text, 600),
      itemCount: parsed.length,
    });
    return sanitizeSkillgenCandidates(parsed);
  }

  async function extractSkillCandidatesByClaude({ env, requestId, prompt }) {
    const apiKey = String(env.ANTHROPIC_API_KEY || '').trim();
    const authToken = String(env.ANTHROPIC_AUTH_TOKEN || '').trim();
    const base = String(env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '');
    const { headers, deepSeekBase } = buildAnthropicCompatHeaders({
      apiKey,
      authToken,
      base,
      includeJsonContentType: true,
    });
    if (deepSeekBase && !apiKey && !authToken) {
      throw new Error(
        'missing ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN for DeepSeek Anthropic API',
      );
    }
    if (!apiKey && !authToken) throw new Error('missing anthropic credentials');
    const model = String(env.ANTHROPIC_MODEL || env.MODEL || 'claude-3-5-haiku-latest').trim();
    const url = `${base}/v1/messages`;
    logInfo('skillgen-llm', 'Claude skill extraction request', {
      requestId,
      model,
      url,
      promptPreview: shortBodyLong(prompt, 320),
    });
    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          max_tokens: 1200,
          temperature: 0.1,
          thinking: { type: 'disabled' },
          messages: [{ role: 'user', content: prompt }],
        }),
      },
      25000,
    );
    if (!response.ok) {
      const rawBody = await response.text();
      const body = shortBody(rawBody);
      logWarn('skillgen-llm', 'Claude skill extraction http failed', {
        requestId,
        model,
        status: response.status,
        bodyPreview: shortBodyLong(sanitizeModelResponsePreview(rawBody), 1200),
      });
      throw new Error(`claude http ${response.status}${body ? ` ${body}` : ''}`);
    }
    const data = await response.json();
    let text = extractTitleTextFromClaudeResponse(data);
    if (!text) {
      const thinking = extractClaudeThinkingPreview(data);
      text = thinking || '';
    }
    if (!text) {
      logWarn('skillgen-llm', 'Claude skill extraction empty content', {
        requestId,
        model,
        responsePreview: previewPayloadForLog(data, 1400),
      });
      throw new Error('claude empty content');
    }
    const parsed = extractJsonArrayFromText(text);
    if (parsed.length === 0) throw new Error('claude invalid json array');
    logInfo('skillgen-llm', 'Claude skill extraction response', {
      requestId,
      model,
      rawPreview: shortBodyLong(text, 600),
      itemCount: parsed.length,
    });
    return sanitizeSkillgenCandidates(parsed);
  }

  async function extractSkillCandidatesByGemini({ env, requestId, prompt }) {
    const apiKey = String(env.GEMINI_API_KEY || env.GOOGLE_API_KEY || '').trim();
    if (!apiKey) throw new Error('missing gemini api key');
    const base = String(env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(
      /\/+$/,
      '',
    );
    const model = String(env.GEMINI_MODEL || env.MODEL || 'gemini-1.5-flash').trim();
    const url = `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    logInfo('skillgen-llm', 'Gemini skill extraction request', {
      requestId,
      model,
      url: `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=***`,
      promptPreview: shortBodyLong(prompt, 320),
    });
    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1200 },
        }),
      },
      25000,
    );
    if (!response.ok) {
      const rawBody = await response.text();
      const body = shortBody(rawBody);
      logWarn('skillgen-llm', 'Gemini skill extraction http failed', {
        requestId,
        model,
        status: response.status,
        bodyPreview: shortBodyLong(sanitizeModelResponsePreview(rawBody), 1200),
      });
      throw new Error(`gemini http ${response.status}${body ? ` ${body}` : ''}`);
    }
    const data = await response.json();
    const text = extractTitleTextFromGeminiResponse(data);
    if (!text) {
      logWarn('skillgen-llm', 'Gemini skill extraction empty content', {
        requestId,
        model,
        responsePreview: previewPayloadForLog(data, 1400),
      });
      throw new Error('gemini empty content');
    }
    const parsed = extractJsonArrayFromText(text);
    if (parsed.length === 0) throw new Error('gemini invalid json array');
    logInfo('skillgen-llm', 'Gemini skill extraction response', {
      requestId,
      model,
      rawPreview: shortBodyLong(text, 600),
      itemCount: parsed.length,
    });
    return sanitizeSkillgenCandidates(parsed);
  }

  return async function extractSkillCandidatesWithModel({
    providerHint = 'claude',
    sessionId = '',
    sessionFilePath = '',
    transcript = [],
  }) {
    const hint = normalizeProviderId(providerHint || 'claude');
    const providersToTry = [hint, 'claude', 'codex', 'gemini'].filter(
      (item, idx, arr) => arr.indexOf(item) === idx,
    );
    const requestId = `skillgen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const prompt = buildSkillExtractionPrompt({ transcript, sessionFilePath });
    const latestRound = sessionFilePath
      ? parseLatestConversationRoundFromSessionFile(sessionFilePath)
      : { latestUserText: '', latestAssistantText: '' };
    let lastError = '';

    logInfo('skillgen-llm', 'Start model skill extraction', {
      requestId,
      providerHint: hint,
      providersToTry,
      sessionId,
      sessionFilePath,
      transcriptLines: Array.isArray(transcript) ? transcript.length : 0,
      latestUserPreview: shortBodyLong(latestRound.latestUserText, 180),
      latestAssistantPreview: shortBodyLong(latestRound.latestAssistantText, 180),
      transcriptTailPreview: shortBodyLong(
        Array.isArray(transcript) ? transcript.slice(-6).join(' | ') : '',
        320,
      ),
    });

    for (const providerId of providersToTry) {
      const env = getStartupEnvForProvider(providerId);
      try {
        let candidates = [];
        if (providerId === 'codex')
          candidates = await extractSkillCandidatesByOpenAi({ env, requestId, prompt });
        else if (providerId === 'claude')
          candidates = await extractSkillCandidatesByClaude({ env, requestId, prompt });
        else if (providerId === 'gemini')
          candidates = await extractSkillCandidatesByGemini({ env, requestId, prompt });
        if (!Array.isArray(candidates) || candidates.length === 0) {
          throw new Error('model returned empty candidates');
        }
        logInfo('skillgen-llm', 'Model skill extraction accepted', {
          requestId,
          provider: providerId,
          candidateCount: candidates.length,
        });
        return candidates;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        lastError = `[${providerId}] ${reason}`;
        logWarn('skillgen-llm', 'Model skill extraction failed, trying next provider', {
          requestId,
          provider: providerId,
          reason,
        });
      }
    }
    throw new Error(lastError || 'all model providers unavailable');
  };
}

module.exports = { createSkillgenModelExtractor };
