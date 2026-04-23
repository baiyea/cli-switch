const crypto = require("node:crypto");

function toIsoTs(value) {
  if (!value) return new Date().toISOString();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

function normalizeRole(raw) {
  const role = String(raw || "").toLowerCase();
  if (role === "assistant" || role === "user" || role === "tool") return role;
  if (role === "system") return "assistant";
  return "assistant";
}

function extractText(payload) {
  if (payload == null) return "";
  if (typeof payload === "string") return payload;
  if (Array.isArray(payload)) {
    return payload
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item.text === "string") return item.text;
        if (item && typeof item.content === "string") return item.content;
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  if (typeof payload === "object") {
    if (typeof payload.text === "string") return payload.text;
    if (typeof payload.content === "string") return payload.content;
    if (typeof payload.message === "string") return payload.message;
  }
  return "";
}

function normalizeMessage(raw, context, turnId) {
  const message = raw?.message && typeof raw.message === "object" ? raw.message : raw;

  const role = normalizeRole(
    raw?.role
      || message?.role
      || raw?.author
      || message?.author
      || raw?.sender
  );

  const content = extractText(
    raw?.content
      || message?.content
      || raw?.text
      || message?.text
      || raw?.prompt
      || message?.prompt
  );

  const toolName = raw?.tool_name
    || raw?.toolName
    || raw?.tool?.name
    || message?.tool_name
    || message?.toolName
    || "";

  const toolArgs = raw?.tool_args
    || raw?.toolArgs
    || raw?.tool?.args
    || message?.tool_args
    || message?.toolArgs
    || {};

  const toolResult = extractText(
    raw?.tool_result
      || raw?.toolResult
      || raw?.result
      || message?.tool_result
      || message?.toolResult
      || message?.result
  );

  const ts = toIsoTs(raw?.ts || raw?.timestamp || raw?.created_at || message?.ts || message?.timestamp || message?.created_at);

  const hashInput = [
    context.providerSessionId,
    turnId,
    role,
    content,
    toolName,
    JSON.stringify(toolArgs),
    toolResult
  ].join("\n");

  return {
    session_id: context.providerSessionId,
    turn_id: turnId,
    role,
    content,
    tool_name: toolName,
    tool_args: toolArgs,
    tool_result: toolResult,
    ts,
    cwd: context.cwd,
    content_hash: crypto.createHash("sha256").update(hashInput).digest("hex")
  };
}

function normalizeMessages(rawMessages, context) {
  const list = [];
  for (let i = 0; i < rawMessages.length; i += 1) {
    list.push(normalizeMessage(rawMessages[i], context, i + 1));
  }
  return list;
}

module.exports = {
  normalizeMessages
};
