function createModelResponseHelpers({
  shortBodyLong,
  sanitizeLogText,
  extractTextFromContentValue,
}) {
  function sanitizeModelResponsePreview(text) {
    return String(text || '')
      .replace(/\r?\n/g, ' ')
      .replace(/(Bearer\s+)[A-Za-z0-9._-]{8,}/gi, '$1***')
      .replace(/("?(?:api[_-]?key|token|secret|authorization)"?\s*:\s*")[^"]+(")/gi, '$1***$2')
      .replace(/([?&](?:api[_-]?key|token|key)=)[^&\s]+/gi, '$1***')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function previewPayloadForLog(payload, maxLen = 1200) {
    try {
      return shortBodyLong(sanitizeModelResponsePreview(JSON.stringify(payload || {})), maxLen);
    } catch {
      return shortBodyLong(sanitizeModelResponsePreview(String(payload || '')), maxLen);
    }
  }

  function extractTitleTextFromOpenAiResponse(data) {
    const candidates = [
      extractTextFromContentValue(data?.choices?.[0]?.message?.content),
      extractTextFromContentValue(data?.choices?.[0]?.delta?.content),
      String(data?.choices?.[0]?.text || '').trim(),
      String(data?.output_text || '').trim(),
      extractTextFromContentValue(data?.output?.[0]?.content),
      extractTextFromContentValue(data?.message?.content),
      String(data?.result || '').trim(),
    ];
    return candidates.find((item) => !!item) || '';
  }

  function extractTitleTextFromClaudeResponse(data) {
    const candidates = [
      extractTextFromContentValue(data?.content),
      String(data?.completion || '').trim(),
      String(data?.output_text || '').trim(),
      extractTextFromContentValue(data?.choices?.[0]?.message?.content),
      String(data?.choices?.[0]?.text || '').trim(),
      extractTextFromContentValue(data?.message?.content),
      extractTextFromContentValue(data?.delta),
    ];
    return candidates.find((item) => !!item) || '';
  }

  function extractClaudeThinkingPreview(data) {
    const blocks = Array.isArray(data?.content) ? data.content : [];
    const thinking = blocks
      .filter((item) => item && typeof item === 'object' && item.type === 'thinking')
      .map((item) => String(item.thinking || item.text || item.content || '').trim())
      .filter(Boolean)
      .join('\n')
      .trim();
    return thinking;
  }

  function extractTitleTextFromGeminiResponse(data) {
    const candidates = [
      extractTextFromContentValue(data?.candidates?.[0]?.content?.parts),
      String(data?.candidates?.[0]?.output || '').trim(),
      String(data?.candidates?.[0]?.text || '').trim(),
      String(data?.text || '').trim(),
      String(data?.output_text || '').trim(),
      extractTextFromContentValue(data?.response?.candidates?.[0]?.content?.parts),
    ];
    return candidates.find((item) => !!item) || '';
  }

  function cleanText(value) {
    return sanitizeLogText(String(value || '')).trim();
  }

  return {
    sanitizeModelResponsePreview,
    previewPayloadForLog,
    extractTitleTextFromOpenAiResponse,
    extractTitleTextFromClaudeResponse,
    extractClaudeThinkingPreview,
    extractTitleTextFromGeminiResponse,
    cleanText,
  };
}

module.exports = {
  createModelResponseHelpers,
};
