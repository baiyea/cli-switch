const fs = require("node:fs");
const path = require("node:path");
const { ensureDir } = require("./index");

function skillPath(projectPath, slug) {
  return path.join(projectPath, ".claude", "skills", slug, "SKILL.md");
}

function buildSkillMarkdown(candidate) {
  const whenLines = candidate.whenToUse.map((item) => `- ${item}`).join("\n");
  const stepLines = candidate.steps.map((item, idx) => `${idx + 1}. ${item}`).join("\n");
  const verificationLines = candidate.validation.map((item) => `- ${item}`).join("\n");
  const notesLines = candidate.notes.map((item) => `- ${item}`).join("\n");

  return `---
name: ${candidate.slug}
description: |
  ${candidate.summary}
author: ZeeLinCode
version: 1.0.0
tags: [session-learning, auto-generated]
---

# ${candidate.title}

## When To Use
${whenLines}

## Context
- 来源：会话自动学习（增量）

## Steps
${stepLines}

## Verification
${verificationLines}

## Notes
${notesLines}
`;
}

function appendIncrementalEvidence(existing, candidate) {
  const sectionTitle = "## Incremental Evidence";
  const lines = candidate.evidence.map((item) => `- ${item}`);
  const uniqueLines = lines.filter((line) => !existing.includes(line));
  if (uniqueLines.length === 0) return existing;

  if (existing.includes(sectionTitle)) {
    return `${existing.trimEnd()}\n${uniqueLines.join("\n")}\n`;
  }

  return `${existing.trimEnd()}\n\n${sectionTitle}\n${uniqueLines.join("\n")}\n`;
}

function upsertSkill(projectPath, candidate) {
  const outPath = skillPath(projectPath, candidate.slug);
  ensureDir(path.dirname(outPath));

  if (!fs.existsSync(outPath)) {
    fs.writeFileSync(outPath, buildSkillMarkdown(candidate), "utf8");
    return { created: true, updated: false, path: outPath };
  }

  const existing = fs.readFileSync(outPath, "utf8");
  const next = appendIncrementalEvidence(existing, candidate);
  if (next !== existing) {
    fs.writeFileSync(outPath, next, "utf8");
    return { created: false, updated: true, path: outPath };
  }

  return { created: false, updated: false, path: outPath };
}

function writeDraftCandidate(projectPath, candidate) {
  const dir = path.join(projectPath, ".claude", ".skillgen", "candidates");
  ensureDir(dir);
  const outPath = path.join(dir, `${candidate.id}.json`);
  fs.writeFileSync(outPath, JSON.stringify(candidate, null, 2), "utf8");
  return outPath;
}

module.exports = {
  upsertSkill,
  writeDraftCandidate
};
