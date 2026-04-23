const crypto = require("node:crypto");
const { loadSessionMessages } = require("./ingest");
const { openStateDb } = require("./index");
const { upsertSkill, writeDraftCandidate } = require("./writer");

const PROJECT_MUTEX = new Map();
const THROTTLE_MS = 30 * 1000;

function slugify(text) {
  const normalized = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return normalized || "session-workflow";
}

function compact(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function commandFromMessage(msg) {
  const fromToolArgs = msg?.tool_args?.command;
  if (typeof fromToolArgs === "string" && compact(fromToolArgs)) {
    return compact(fromToolArgs);
  }

  const content = String(msg?.content || "");
  const shellMatch = content.match(/(?:^|\n)\$\s+(.+?)(?:\n|$)/);
  if (shellMatch?.[1]) return compact(shellMatch[1]);

  const commandTag = content.match(/<command-name>([^<]+)<\/command-name>/);
  if (commandTag?.[1]) {
    const argsTag = content.match(/<command-args>([\s\S]*?)<\/command-args>/);
    const args = compact(argsTag?.[1] || "");
    return compact(`${commandTag[1]} ${args}`);
  }

  return "";
}

function evidenceFromMessage(msg) {
  const text = `${msg.content || ""}\n${msg.tool_result || ""}`.toLowerCase();
  const out = [];
  if (text.includes("exit code 0")) out.push("exit code 0");
  if (text.includes("tests passed") || text.includes("passed")) out.push("tests passed");
  if (text.includes("success") || text.includes("succeeded")) out.push("operation succeeded");
  return out;
}

function scoreCandidate(candidate) {
  const reuse = Math.min(1, candidate.steps.length / 4);
  const evidence = Math.min(1, candidate.evidence.length / 2);
  const clarity = Math.min(1, candidate.steps.filter((s) => s.length >= 8).length / Math.max(candidate.steps.length, 1));
  const stability = candidate.sourceCount >= 2 ? 1 : 0.5;
  const diff = 0.8;
  return (0.3 * reuse) + (0.25 * evidence) + (0.2 * clarity) + (0.15 * stability) + (0.1 * diff);
}

function uniqueStrings(list) {
  return Array.from(new Set((list || []).map((item) => compact(item)).filter(Boolean)));
}

function buildCandidate(projectPath, sessionRow, messages) {
  const commands = uniqueStrings(messages.map(commandFromMessage));
  if (commands.length === 0) return null;

  const userPrompt = messages.find((m) => m.role === "user" && compact(m.content))?.content || "session workflow";
  const promptTitle = compact(userPrompt).slice(0, 48) || `session-${String(sessionRow.provider_session_id || "").slice(0, 8)}`;
  const title = `Session Workflow: ${promptTitle}`;
  const slug = slugify(promptTitle);

  const evidence = uniqueStrings(messages.flatMap(evidenceFromMessage));
  const steps = commands.slice(0, 4).map((command) => `执行 \`${command}\`，并记录关键输出。`);
  const validation = evidence.length > 0
    ? evidence.map((item) => `确认包含：${item}`)
    : ["在相同输入下重复执行，确认结果稳定。"];

  const candidate = {
    id: crypto.randomUUID(),
    projectPath,
    slug,
    title,
    summary: `基于会话 ${sessionRow.provider_session_id} 的增量学习结果，沉淀可复用流程。`,
    whenToUse: [
      "遇到同类任务需要快速复用已有排障路径",
      "需要复现本项目已验证过的命令链路"
    ],
    steps,
    validation,
    notes: [
      "自动生成内容需人工快速复核后再长期复用",
      "若命令包含环境依赖，需补充前置条件"
    ],
    evidence,
    sourceCount: 1
  };

  candidate.score = scoreCandidate(candidate);
  candidate.status = candidate.score >= 0.7 ? "accepted" : (candidate.score >= 0.55 ? "draft" : "discarded");
  return candidate;
}

function filterNewMessages(state, messages) {
  return messages.filter((msg) => !state.isProcessed(msg.content_hash));
}

function matchSessionRow(sessionRows, input) {
  const rawSessionId = String(input.sessionId || "");
  const rawProviderSid = String(input.providerSessionId || "");
  const provider = String(input.provider || "").toLowerCase();

  for (const row of sessionRows) {
    const rowProvider = String(row.provider || "").toLowerCase();
    const rowSid = String(row.provider_session_id || row.providerSessionId || row.id || "");
    if (rawProviderSid && provider && rowSid === rawProviderSid && rowProvider === provider) return row;
    if (rawSessionId && rowSid === rawSessionId) return row;
  }
  return null;
}

async function withProjectLock(projectId, fn) {
  const pending = PROJECT_MUTEX.get(projectId) || Promise.resolve();
  const next = pending.then(fn, fn);
  PROJECT_MUTEX.set(projectId, next.finally(() => {
    if (PROJECT_MUTEX.get(projectId) === next) PROJECT_MUTEX.delete(projectId);
  }));
  return PROJECT_MUTEX.get(projectId);
}

function createSkillgenRunner({ projectStore, sessionStore, logInfo, logWarn, logError }) {
  async function runForProjectId(projectId, trigger = "manual", force = false) {
    const project = projectStore.getById(projectId);
    if (!project) return { ok: false, reason: "project_not_found" };

    return withProjectLock(projectId, async () => {
      const state = openStateDb(project.path);
      try {
        const lastRun = state.getLastRun(projectId);
        if (!force && lastRun?.last_run_at) {
          const lastAt = new Date(lastRun.last_run_at).getTime();
          if (Number.isFinite(lastAt) && (Date.now() - lastAt) < THROTTLE_MS) {
            return { ok: true, skipped: true, reason: "throttled" };
          }
        }

        const rows = sessionStore
          .listAllActive([projectId])
          .filter((row) => row.session_file_path && String(row.session_file_path).trim());

        let created = 0;
        let updated = 0;
        let drafted = 0;
        let discarded = 0;
        let processed = 0;

        for (const row of rows) {
          const loaded = loadSessionMessages(row);
          if (!loaded.ok) {
            logWarn("skillgen", "Skip unreadable session file", {
              projectId,
              provider: row.provider,
              providerSessionId: row.provider_session_id,
              sessionFilePath: row.session_file_path,
              reason: loaded.reason
            });
            continue;
          }

          const newMessages = filterNewMessages(state, loaded.messages);
          if (newMessages.length === 0) continue;

          state.markProcessed(newMessages);
          processed += newMessages.length;

          const candidate = buildCandidate(project.path, row, newMessages);
          if (!candidate) continue;

          if (candidate.status === "accepted") {
            const result = upsertSkill(project.path, candidate);
            if (result.created) created += 1;
            if (result.updated) updated += 1;
            logInfo("skillgen", "Skill upserted", {
              projectId,
              trigger,
              skillPath: result.path,
              score: Number(candidate.score.toFixed(3))
            });
            continue;
          }

          if (candidate.status === "draft") {
            writeDraftCandidate(project.path, candidate);
            drafted += 1;
            continue;
          }

          discarded += 1;
        }

        state.setLastRun(projectId, trigger);
        return {
          ok: true,
          skipped: false,
          projectId,
          trigger,
          processed,
          created,
          updated,
          drafted,
          discarded
        };
      } catch (error) {
        logError("skillgen", "Skillgen run failed", error, { projectId, trigger });
        return { ok: false, reason: "run_failed", error: error.message };
      } finally {
        state.close();
      }
    });
  }

  async function runForSession(input, trigger = "session-exit") {
    const allRows = sessionStore.listAllActive([]);
    const row = matchSessionRow(allRows, input || {});
    if (!row?.project_id) {
      return { ok: false, reason: "session_not_found" };
    }
    return runForProjectId(row.project_id, trigger);
  }

  async function runStartupCompensation() {
    const projects = projectStore.list();
    const results = [];
    for (const project of projects) {
      // Startup sweep is low-priority; throttle still applies.
      // eslint-disable-next-line no-await-in-loop
      const result = await runForProjectId(project.id, "startup-compensation", false);
      results.push({ projectId: project.id, ...result });
    }
    return results;
  }

  return {
    runForProjectId,
    runForSession,
    runStartupCompensation
  };
}

module.exports = {
  createSkillgenRunner
};
