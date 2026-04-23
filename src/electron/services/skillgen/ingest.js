const fs = require("node:fs");
const path = require("node:path");
const { normalizeMessages } = require("./normalize");

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readJsonl(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const out = [];
  for (const line of lines) {
    const parsed = safeJsonParse(line);
    if (parsed) out.push(parsed);
  }
  return out;
}

function readJson(filePath) {
  const parsed = safeJsonParse(fs.readFileSync(filePath, "utf8"));
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.messages)) return parsed.messages;
  if (Array.isArray(parsed.entries)) return parsed.entries;
  return [parsed];
}

function readMarkdown(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const blocks = text
    .split(/\n\s*\n/g)
    .map((part) => part.trim())
    .filter(Boolean);
  return blocks.map((content) => ({ role: "user", content }));
}

function readRawMessages(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jsonl") return readJsonl(filePath);
  if (ext === ".json") return readJson(filePath);
  if (ext === ".md" || ext === ".markdown") return readMarkdown(filePath);
  return [];
}

function loadSessionMessages(sessionRow) {
  const sessionFilePath = sessionRow.session_file_path || sessionRow.sessionFilePath;
  if (!sessionFilePath || !fs.existsSync(sessionFilePath)) {
    return { ok: false, reason: "missing_session_file", messages: [] };
  }

  const raw = readRawMessages(sessionFilePath);
  const normalized = normalizeMessages(raw, {
    providerSessionId: sessionRow.provider_session_id || sessionRow.providerSessionId || sessionRow.sessionId,
    cwd: sessionRow.project_path || sessionRow.cwd || ""
  });

  return {
    ok: true,
    reason: "",
    sessionFilePath,
    messages: normalized
  };
}

module.exports = {
  loadSessionMessages
};
