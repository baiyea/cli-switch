'use strict';

const MAX_IM_TEXT_LENGTH = 4000;

function normalizeInput(input) {
  return String(input || '').trim();
}

function parsePositiveInteger(value) {
  if (!/^[1-9]\d*$/.test(String(value || ''))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function invalid(reason) {
  return { type: 'invalid', reason };
}

function parseImCommand(input) {
  const text = normalizeInput(input);
  if (!text) return invalid('empty-message');
  if (text.length > MAX_IM_TEXT_LENGTH) return invalid('message-too-long');
  if (text === '/list') return { type: 'list' };
  if (text === '/use') return { type: 'showBinding' };

  if (text.startsWith('/use ')) {
    const rest = text.slice('/use '.length).trim();
    const firstSpace = rest.search(/\s/);
    const rawId = firstSpace < 0 ? rest : rest.slice(0, firstSpace);
    const dbSessionId = parsePositiveInteger(rawId);
    if (!dbSessionId) return invalid('invalid-session-id');
    const message = firstSpace < 0 ? '' : rest.slice(firstSpace).trim();
    if (!message) return { type: 'bind', dbSessionId };
    return { type: 'bindAndSend', dbSessionId, text: message };
  }

  if (text.startsWith('/')) return invalid('unknown-command');
  return { type: 'send', text };
}

module.exports = {
  MAX_IM_TEXT_LENGTH,
  parseImCommand,
};
