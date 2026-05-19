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

function trimToLength(text, maxChars = 10) {
  const chars = Array.from(String(text || '').trim());
  if (chars.length <= maxChars) return chars.join('');
  return chars.slice(0, maxChars).join('');
}

function containsCjk(text) {
  return /[\u4e00-\u9fff]/.test(String(text || ''));
}

function stripMarkdownArtifacts(text) {
  return String(text || '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`{1,3}[^`]+`{1,3}/g, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function normalizeSuggestedTitle(rawTitle, fallbackTitle = '') {
  const cleaned = stripMarkdownArtifacts(String(rawTitle || ''))
    .replace(/\r?\n/g, ' ')
    .replace(/^[\[\(【（]+|[\]\)】）]+$/g, '')
    .replace(/[“”"'`]/g, '')
    .replace(/[，。！？、；：,.!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const compact = cleaned.replace(/[\s\[\]\(\){}<>【】]/g, '');
  const base = compact || cleaned || String(fallbackTitle || '').trim();
  return trimToLength(base, 10);
}

function looksLikeMetaReasoningTitle(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  return /^(我需要|让我|需要分析|分析这个|好的我|根据对话|基于对话|这个对话|总结一下)/.test(value);
}

function deriveRuleBasedTaskTitle(text) {
  const source = stripMarkdownArtifacts(String(text || ''));
  if (!source) return '';
  const rules = [
    {
      title: '检查容器挂载',
      patterns: [/容器|docker/i, /挂载|路径|volume|-v|sqlite|同步/i],
    },
    {
      title: '调整构建脚本',
      patterns: [/docker-build\.sh|构建|build|脚本/i, /调整|修改|修复|检查|流程|询问/i],
    },
    {
      title: '优化推送流程',
      patterns: [/push|推送/i, /询问|确认|流程|是否/i],
    },
    {
      title: '排查数据同步',
      patterns: [/数据同步|同步路径|同步|路径/i],
    },
  ];
  for (const rule of rules) {
    const matched = rule.patterns.every((pattern) => pattern.test(source));
    if (matched) return rule.title;
  }
  return '';
}

function looksLikeLowQualityTaskTitle(text) {
  const value = String(text || '').trim();
  if (!value) return true;
  if (looksLikeMetaReasoningTitle(value)) return true;
  if (/^(请|帮我|麻烦|看看|请帮我|请你)/.test(value)) return true;
  if (/(这个|一下|数据同|对话|内容|问题)$/i.test(value)) return true;
  if (!/[修复检查调整优化排查生成重命名构建推送测试登录提取分析同步部署更新]/.test(value))
    return true;
  return false;
}

function extractChineseCandidate(text) {
  const source = stripMarkdownArtifacts(text);
  const parts = source
    .split(/[\n。！？!?；;：:，,]/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length === 0) return '';
  const actionPattern =
    /(修复|检查|调整|生成|优化|重命名|构建|推送|测试|登录|提取|分析|同步|发布|部署|更新|排查|解决)/;
  const scored = parts
    .map((part) => {
      const chinese = (part.match(/[\u4e00-\u9fff]/g) || []).join('');
      let score = 0;
      if (chinese.length > 0) score += Math.min(chinese.length, 16);
      if (actionPattern.test(part)) score += 12;
      return { part, chinese, score };
    })
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return '';
  const candidate = best.chinese || best.part;
  return trimToLength(candidate.replace(/\s+/g, ''), 10);
}

function deriveTaskTitleFromConversation(
  latestUserText = '',
  latestAssistantText = '',
  fallbackTitle = '会话',
) {
  const ruleFromUser = deriveRuleBasedTaskTitle(latestUserText);
  if (containsCjk(ruleFromUser)) return ruleFromUser;
  const ruleFromAssistant = deriveRuleBasedTaskTitle(latestAssistantText);
  if (containsCjk(ruleFromAssistant)) return ruleFromAssistant;
  const ruleFromMix = deriveRuleBasedTaskTitle(`${latestUserText}\n${latestAssistantText}`);
  if (containsCjk(ruleFromMix)) return ruleFromMix;

  const userCandidate = extractChineseCandidate(latestUserText);
  if (containsCjk(userCandidate) && !looksLikeLowQualityTaskTitle(userCandidate))
    return userCandidate;
  const assistantCandidate = extractChineseCandidate(latestAssistantText);
  if (containsCjk(assistantCandidate) && !looksLikeLowQualityTaskTitle(assistantCandidate))
    return assistantCandidate;
  const mix = extractChineseCandidate(`${latestUserText}\n${latestAssistantText}`);
  if (containsCjk(mix) && !looksLikeLowQualityTaskTitle(mix)) return mix;
  return normalizeSuggestedTitle(fallbackTitle, '会话');
}

function fallbackSuggestedTitle(
  latestUserText = '',
  latestAssistantText = '',
  fallbackTitle = '会话',
) {
  const taskTitle = deriveTaskTitleFromConversation(
    latestUserText,
    latestAssistantText,
    fallbackTitle || '会话',
  );
  if (containsCjk(taskTitle)) return taskTitle;
  const source = String(latestUserText || latestAssistantText || '').trim();
  return normalizeSuggestedTitle(source || fallbackTitle || '会话', '会话');
}

function createSessionTitleService(deps = {}) {
  const {
    normalizeProviderId,
    getStartupEnvForProvider,
    parseLatestConversationRoundFromSessionFile,
    sanitizeModelResponsePreview,
    previewPayloadForLog,
    extractTitleTextFromOpenAiResponse,
    extractTitleTextFromClaudeResponse,
    extractClaudeThinkingPreview,
    extractTitleTextFromGeminiResponse,
    logInfo = () => {},
    logWarn = () => {},
  } = deps;

  async function suggestTitleByOpenAi({ env, userText, assistantText, requestId }) {
    const apiKey = String(env.OPENAI_API_KEY || '').trim();
    if (!apiKey) throw new Error('missing OPENAI_API_KEY');
    const base = String(env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/+$/, '');
    const model = String(env.OPENAI_MODEL || env.MODEL || 'gpt-4o-mini').trim();
    const url = `${base}/v1/chat/completions`;
    const prompt = `你是会话命名助手。基于“最新一轮对话”，提炼当前正在做的事情目标。\n要求：\n1) 输出必须是中文\n2) 10个字以内\n3) 只输出标题，不要括号、引号、标点、解释\n\n用户：${userText || '（空）'}\n助手：${assistantText || '（空）'}`;

    logInfo('session-title', 'OpenAI title suggestion request', {
      requestId,
      model,
      url: `${base}/v1/chat/completions`,
      userPreview: shortBodyLong(userText, 260),
      assistantPreview: shortBodyLong(assistantText, 260),
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
          temperature: 0.2,
          max_tokens: 32,
          messages: [
            { role: 'system', content: '你只输出中文标题文本，最多10个字。' },
            { role: 'user', content: prompt },
          ],
        }),
      },
      15000,
    );

    if (!response.ok) {
      const rawBody = await response.text();
      const body = shortBody(rawBody);
      logWarn('session-title', 'OpenAI title suggestion http failed', {
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
      logWarn('session-title', 'OpenAI title suggestion empty parsed content', {
        requestId,
        model,
        topLevelKeys: Object.keys(data || {}).slice(0, 20),
        responsePreview: previewPayloadForLog(data, 1400),
      });
      throw new Error('openai empty content');
    }
    logInfo('session-title', 'OpenAI title suggestion response', {
      requestId,
      model,
      rawTitle: shortBodyLong(text, 400),
      responsePreview: previewPayloadForLog(data, 700),
    });
    return text;
  }

  async function suggestTitleByClaude({ env, userText, assistantText, requestId }) {
    const apiKey = String(env.ANTHROPIC_API_KEY || '').trim();
    const authToken = String(env.ANTHROPIC_AUTH_TOKEN || '').trim();
    const base = String(env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '');
    const headers = {
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    };
    if (apiKey) headers['x-api-key'] = apiKey.replace(/^Bearer\s+/i, '').trim();
    if (authToken) {
      const raw = authToken.replace(/^Bearer\s+/i, '').trim();
      headers.Authorization = /^Bearer\s+/i.test(authToken) ? authToken : `Bearer ${raw}`;
    }
    if (!headers['x-api-key'] && !headers.Authorization) throw new Error('missing anthropic credentials');
    const model = String(env.ANTHROPIC_MODEL || env.MODEL || 'claude-3-5-haiku-latest').trim();
    const url = `${base}/v1/messages`;
    const prompt = `基于最新一轮对话，提炼当前目标。\n要求：输出中文、10个字以内、只输出标题，不要解释。\n用户：${userText || '（空）'}\n助手：${assistantText || '（空）'}`;

    logInfo('session-title', 'Claude title suggestion request', {
      requestId,
      model,
      url: `${base}/v1/messages`,
      userPreview: shortBodyLong(userText, 260),
      assistantPreview: shortBodyLong(assistantText, 260),
    });
    const requestClaude = async ({
      maxTokens = 32,
      disableThinking = false,
      tag = 'primary',
    } = {}) => {
      const bodyPayload = {
        model,
        max_tokens: maxTokens,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
      };
      if (disableThinking) {
        bodyPayload.thinking = { type: 'disabled' };
      }
      logInfo('session-title', 'Claude title suggestion attempt', {
        requestId,
        model,
        tag,
        maxTokens,
        disableThinking,
      });
      const response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(bodyPayload),
        },
        15000,
      );
      if (!response.ok) {
        const rawBody = await response.text();
        const body = shortBody(rawBody);
        logWarn('session-title', 'Claude title suggestion http failed', {
          requestId,
          model,
          tag,
          status: response.status,
          bodyPreview: shortBodyLong(sanitizeModelResponsePreview(rawBody), 1200),
        });
        throw new Error(`claude http ${response.status}${body ? ` ${body}` : ''}`);
      }
      const data = await response.json();
      return data;
    };

    let data = await requestClaude({ maxTokens: 32, disableThinking: false, tag: 'primary' });
    let text = extractTitleTextFromClaudeResponse(data);
    if (!text) {
      const stopReason = String(data?.stop_reason || '')
        .trim()
        .toLowerCase();
      const thinkingPreview = extractClaudeThinkingPreview(data);
      const hasThinkingOnly = !!thinkingPreview && stopReason === 'max_tokens';
      logWarn('session-title', 'Claude title suggestion empty parsed content', {
        requestId,
        model,
        topLevelKeys: Object.keys(data || {}).slice(0, 20),
        stopReason: stopReason || null,
        hasThinkingOnly,
        responsePreview: previewPayloadForLog(data, 1400),
      });
      if (hasThinkingOnly) {
        logInfo('session-title', 'Claude title suggestion retry after thinking-only response', {
          requestId,
          model,
          thinkingPreview: shortBodyLong(thinkingPreview, 260),
        });
        data = await requestClaude({
          maxTokens: 128,
          disableThinking: true,
          tag: 'retry_no_thinking',
        });
        text = extractTitleTextFromClaudeResponse(data);
        if (!text) {
          const secondThinking = extractClaudeThinkingPreview(data);
          if (secondThinking) {
            const candidate = deriveTaskTitleFromConversation(
              userText,
              assistantText,
              extractChineseCandidate(secondThinking) || '会话',
            );
            if (containsCjk(candidate)) {
              text = candidate;
            }
          }
        }
      }
    }
    if (!text) throw new Error('claude empty content');
    logInfo('session-title', 'Claude title suggestion response', {
      requestId,
      model,
      rawTitle: shortBodyLong(text, 400),
      responsePreview: previewPayloadForLog(data, 700),
    });
    return text;
  }

  async function suggestTitleByGemini({ env, userText, assistantText, requestId }) {
    const apiKey = String(env.GEMINI_API_KEY || env.GOOGLE_API_KEY || '').trim();
    if (!apiKey) throw new Error('missing gemini api key');
    const base = String(env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(
      /\/+$/,
      '',
    );
    const model = String(env.GEMINI_MODEL || env.MODEL || 'gemini-1.5-flash').trim();
    const prompt = `基于最新一轮对话，提炼当前目标。要求：输出中文标题，10个字以内，只输出标题。\n用户：${userText || '（空）'}\n助手：${assistantText || '（空）'}`;
    const url = `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    logInfo('session-title', 'Gemini title suggestion request', {
      requestId,
      model,
      url: `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=***`,
      userPreview: shortBodyLong(userText, 260),
      assistantPreview: shortBodyLong(assistantText, 260),
    });
    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 32 },
        }),
      },
      15000,
    );
    if (!response.ok) {
      const rawBody = await response.text();
      const body = shortBody(rawBody);
      logWarn('session-title', 'Gemini title suggestion http failed', {
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
      logWarn('session-title', 'Gemini title suggestion empty parsed content', {
        requestId,
        model,
        topLevelKeys: Object.keys(data || {}).slice(0, 20),
        responsePreview: previewPayloadForLog(data, 1400),
      });
      throw new Error('gemini empty content');
    }
    logInfo('session-title', 'Gemini title suggestion response', {
      requestId,
      model,
      rawTitle: shortBodyLong(text, 400),
      responsePreview: previewPayloadForLog(data, 700),
    });
    return text;
  }

  async function suggestSessionTitleWithModel({ provider, sessionFilePath, fallbackTitle = '' }) {
    const id = normalizeProviderId(provider);
    const { latestUserText, latestAssistantText } =
      parseLatestConversationRoundFromSessionFile(sessionFilePath);
    const fallback = fallbackSuggestedTitle(
      latestUserText,
      latestAssistantText,
      fallbackTitle || '会话',
    );
    const requestId = `${id}-title-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const providersToTry = [id, 'claude', 'codex', 'gemini'].filter(
      (value, idx, arr) => arr.indexOf(value) === idx,
    );
    let lastError = '';

    logInfo('session-title', 'Start title suggestion', {
      requestId,
      provider: id,
      sessionFilePath,
      providersToTry,
      fallbackTitle: shortBodyLong(fallbackTitle, 120),
      fallbackSuggested: fallback,
      latestUserText: shortBodyLong(latestUserText, 320),
      latestAssistantText: shortBodyLong(latestAssistantText, 320),
    });

    for (const providerId of providersToTry) {
      const env = getStartupEnvForProvider(providerId);
      try {
        let raw = '';
        if (providerId === 'codex')
          raw = await suggestTitleByOpenAi({
            env,
            userText: latestUserText,
            assistantText: latestAssistantText,
            requestId,
          });
        else if (providerId === 'claude')
          raw = await suggestTitleByClaude({
            env,
            userText: latestUserText,
            assistantText: latestAssistantText,
            requestId,
          });
        else if (providerId === 'gemini')
          raw = await suggestTitleByGemini({
            env,
            userText: latestUserText,
            assistantText: latestAssistantText,
            requestId,
          });
        else continue;
        let title = normalizeSuggestedTitle(raw, fallback);
        if (!title) throw new Error('empty title after normalization');
        if (looksLikeLowQualityTaskTitle(title)) {
          const refined = deriveTaskTitleFromConversation(
            latestUserText,
            latestAssistantText,
            fallback,
          );
          logInfo('session-title', 'Model title refined from low-quality candidate', {
            requestId,
            provider: providerId,
            rawTitle: shortBodyLong(raw, 240),
            normalizedTitle: title,
            refinedTitle: refined,
          });
          title = refined;
        }
        if (!containsCjk(title)) throw new Error('model title not chinese');
        logInfo('session-title', 'Model title accepted', {
          requestId,
          provider: providerId,
          rawTitle: shortBodyLong(raw, 400),
          normalizedTitle: title,
          normalizedLength: Array.from(String(title || '')).length,
        });
        return { ok: true, title, source: 'llm', provider: providerId };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        lastError = `[${providerId}] ${reason}`;
        logWarn('session-title', 'Model title suggestion failed, trying next provider', {
          requestId,
          provider: providerId,
          reason,
        });
      }
    }

    logWarn('session-title', 'Falling back to heuristic title suggestion', {
      requestId,
      provider: id,
      reason: lastError || 'all model providers unavailable',
      fallbackSuggested: fallback,
      fallbackLength: Array.from(String(fallback || '')).length,
    });

    if (lastError) {
      return {
        ok: false,
        title: '',
        source: 'none',
        reason: lastError,
      };
    }

    return {
      ok: true,
      title: fallback || '会话',
      source: 'fallback',
      reason: lastError || 'all model providers unavailable',
    };
  }

  return {
    normalizeSuggestedTitle,
    suggestSessionTitleWithModel,
  };
}

module.exports = { createSessionTitleService };
