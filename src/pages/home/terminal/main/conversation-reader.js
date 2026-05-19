function createConversationReader({ readTailLines }) {
  function extractTextFromContentValue(content) {
    if (typeof content === 'string') return content.trim();
    if (!content) return '';

    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (typeof item === 'string') return item;
          if (!item || typeof item !== 'object') return '';
          if (typeof item.text === 'string') return item.text;
          if (typeof item.output_text === 'string') return item.output_text;
          if (typeof item.input_text === 'string') return item.input_text;
          if (typeof item.content === 'string') return item.content;
          if (item.type === 'text' && typeof item.value === 'string') return item.value;
          return '';
        })
        .filter(Boolean)
        .join('\n')
        .trim();
    }

    if (typeof content === 'object') {
      if (typeof content.text === 'string') return content.text.trim();
      if (typeof content.output_text === 'string') return content.output_text.trim();
      if (typeof content.input_text === 'string') return content.input_text.trim();
      if (typeof content.content === 'string') return content.content.trim();
      if (typeof content.value === 'string') return content.value.trim();
      if (Array.isArray(content.parts)) {
        const joined = content.parts
          .map((part) => (typeof part?.text === 'string' ? part.text : ''))
          .filter(Boolean)
          .join('\n')
          .trim();
        if (joined) return joined;
      }
    }

    return '';
  }

  function extractMessageTextBlocks(content = []) {
    if (!Array.isArray(content)) return '';
    return content
      .map((item) => {
        if (!item || typeof item !== 'object') return '';
        if (typeof item.text === 'string') return item.text;
        if (typeof item.input_text === 'string') return item.input_text;
        if (typeof item.output_text === 'string') return item.output_text;
        if (typeof item.content === 'string') return item.content;
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  function extractConversationText(content) {
    if (typeof content === 'string') {
      return String(content).trim();
    }
    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (!item || typeof item !== 'object') return '';
          const itemType = String(item.type || '').toLowerCase();
          if (itemType === 'tool_result' || itemType === 'tool_use') return '';
          if (typeof item.text === 'string') return item.text;
          if (typeof item.content === 'string') return item.content;
          if (typeof item.thinking === 'string') return item.thinking;
          return extractTextFromContentValue(item);
        })
        .filter(Boolean)
        .join('\n')
        .trim();
    }
    return extractTextFromContentValue(content);
  }

  function isSkippableConversationText(text = '') {
    const value = String(text || '').trim();
    if (!value) return true;
    if (/^\[Request interrupted by user\]$/i.test(value)) return true;
    if (/^No files found$/i.test(value)) return true;
    if (/^Found \d+ file/i.test(value)) return true;
    return false;
  }

  function parseLatestConversationRoundFromSessionFile(sessionFilePath) {
    const fallback = { latestUserText: '', latestAssistantText: '' };
    try {
      const lines = readTailLines(sessionFilePath, 512 * 1024, 3000);
      const turns = [];
      for (const line of lines) {
        let parsed = null;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }
        if (!parsed || typeof parsed !== 'object') continue;

        if (parsed.type === 'event_msg' && parsed?.payload?.type === 'user_message') {
          const text = String(parsed?.payload?.message || '').trim();
          if (text) turns.push({ role: 'user', text });
          continue;
        }

        if (parsed.type === 'response_item' && parsed?.payload?.type === 'message') {
          const role = String(parsed?.payload?.role || '').toLowerCase();
          if (role !== 'user' && role !== 'assistant') continue;
          const text = extractMessageTextBlocks(parsed?.payload?.content || []);
          if (text) turns.push({ role, text });
          continue;
        }

        const directRole = String(
          parsed?.message?.role || parsed?.role || parsed?.type || '',
        ).toLowerCase();
        if (directRole === 'user' || directRole === 'assistant') {
          if (parsed?.isMeta) continue;
          const directText = extractConversationText(parsed?.message?.content ?? parsed?.content);
          if (!isSkippableConversationText(directText)) {
            turns.push({ role: directRole, text: directText });
          }
        }
      }

      if (turns.length === 0) return fallback;

      let assistantText = '';
      let userText = '';
      for (let i = turns.length - 1; i >= 0; i -= 1) {
        const item = turns[i];
        if (!assistantText && item.role === 'assistant') {
          assistantText = item.text;
          continue;
        }
        if ((assistantText && item.role === 'user') || (!assistantText && item.role === 'user')) {
          userText = item.text;
          break;
        }
      }

      return {
        latestUserText: String(userText || '').slice(0, 1200),
        latestAssistantText: String(assistantText || '').slice(0, 1200),
      };
    } catch {
      return fallback;
    }
  }

  return {
    extractTextFromContentValue,
    extractMessageTextBlocks,
    extractConversationText,
    isSkippableConversationText,
    parseLatestConversationRoundFromSessionFile,
  };
}

module.exports = {
  createConversationReader,
};
