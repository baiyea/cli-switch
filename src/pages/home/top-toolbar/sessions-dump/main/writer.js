'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { resolveProjectAppDataPath } = require('../../../../../shared/project-app-data');

const INDEX_VERSION = 1;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cleanSessionId(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function resolveSessionsRoot(projectPath) {
  return resolveProjectAppDataPath(projectPath, 'sessions');
}

function resolveIndexPath(projectPath) {
  return path.join(resolveSessionsRoot(projectPath), '.index.json');
}

function safeReadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function loadDumpIndex(projectPath) {
  const sessionsRoot = resolveSessionsRoot(projectPath);
  const indexPath = resolveIndexPath(projectPath);
  ensureDir(sessionsRoot);
  const parsed = safeReadJson(indexPath, null);
  if (!parsed || typeof parsed !== 'object') {
    return {
      version: INDEX_VERSION,
      updatedAt: '',
      sources: {},
    };
  }

  const sources = parsed.sources && typeof parsed.sources === 'object' ? parsed.sources : {};
  return {
    version: INDEX_VERSION,
    updatedAt: String(parsed.updatedAt || ''),
    sources,
  };
}

function saveDumpIndex(projectPath, indexState) {
  const indexPath = resolveIndexPath(projectPath);
  const payload = {
    version: INDEX_VERSION,
    updatedAt: new Date().toISOString(),
    sources:
      indexState?.sources && typeof indexState.sources === 'object' ? indexState.sources : {},
  };
  fs.writeFileSync(indexPath, JSON.stringify(payload, null, 2), 'utf8');
}

function toDateDirName(ts) {
  const date = new Date(ts || Date.now());
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function ensureDumpFileHeader(filePath, meta = {}) {
  if (fs.existsSync(filePath)) return;
  const lines = [
    `# Session Dump`,
    '',
    `- Provider: ${meta.provider || ''}`,
    `- Provider Session ID: ${meta.providerSessionId || ''}`,
    `- Session Title: ${meta.sessionTitle || ''}`,
    `- Source File: ${meta.sourceFilePath || ''}`,
    `- Project Path: ${meta.projectPath || ''}`,
    `- Created At: ${new Date().toISOString()}`,
    '',
  ];
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

function appendRoundsToDumpFile(filePath, rounds = []) {
  if (!Array.isArray(rounds) || rounds.length === 0) return;
  const nowIso = new Date().toISOString();
  const lines = [`## Extracted At ${nowIso}`, ''];
  for (const round of rounds) {
    const roundIndex = Number(round?.roundIndex || 0);
    const userText = String(round?.userText || '').trim();
    const assistantText = String(round?.assistantText || '').trim();
    if (!userText || !assistantText) continue;
    lines.push(`### Round ${roundIndex}`);
    lines.push('**User**');
    lines.push('');
    lines.push(userText);
    lines.push('');
    lines.push('**Assistant**');
    lines.push('');
    lines.push(assistantText);
    lines.push('');
  }
  fs.appendFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function findAppendStartIndex(rounds, lastSignature) {
  if (!Array.isArray(rounds) || rounds.length === 0) return 0;
  if (!lastSignature) return 0;
  let lastIndex = -1;
  for (let i = rounds.length - 1; i >= 0; i -= 1) {
    if (String(rounds[i]?.signature || '') === String(lastSignature)) {
      lastIndex = i;
      break;
    }
  }
  if (lastIndex < 0) return 0;
  return lastIndex + 1;
}

function writeSessionDump({ projectPath, session, rounds, sourceRecord = {} }) {
  const provider = String(session?.provider || 'claude');
  const providerSessionId = cleanSessionId(session?.providerSessionId || 'unknown');
  const sessionsRoot = resolveSessionsRoot(projectPath);
  const dayDirName = toDateDirName(session?.sourceMtimeMs || Date.now());
  const dayDirPath = path.join(sessionsRoot, dayDirName);
  ensureDir(dayDirPath);

  const outputFileName = `${provider}-${providerSessionId}.md`;
  const outputFilePath = path.join(dayDirPath, outputFileName);
  ensureDumpFileHeader(outputFilePath, {
    provider,
    providerSessionId,
    sessionTitle: session?.name || '',
    sourceFilePath: session?.sessionFilePath || '',
    projectPath,
  });

  const startIndex = findAppendStartIndex(rounds, sourceRecord?.lastRoundSignature || '');
  const roundsToAppend = rounds.slice(startIndex);
  if (roundsToAppend.length > 0) {
    appendRoundsToDumpFile(outputFilePath, roundsToAppend);
  }

  const lastRound = rounds[rounds.length - 1] || null;
  return {
    outputFilePath,
    appendedRounds: roundsToAppend.length,
    totalRounds: rounds.length,
    nextRecord: {
      provider,
      providerSessionId,
      sourceFilePath: String(session?.sessionFilePath || ''),
      outputFilePath,
      lastRoundSignature: String(lastRound?.signature || ''),
      lastRoundIndex: Number(lastRound?.roundIndex || 0),
      lastSourceMtimeMs: Number(session?.sourceMtimeMs || 0),
      lastSourceSize: Number(session?.sourceSize || 0),
      lastExtractedAt: new Date().toISOString(),
    },
  };
}

module.exports = {
  resolveSessionsRoot,
  loadDumpIndex,
  saveDumpIndex,
  writeSessionDump,
};
