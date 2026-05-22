'use strict';

const path = require('node:path');
const { listProjectProviderSessions, readSessionRounds, normalizeProviderId } = require('./scanner');
const { resolveSessionsRoot, loadDumpIndex, saveDumpIndex, writeSessionDump } = require('./writer');

function buildSourceKey(provider, providerSessionId) {
  return `${normalizeProviderId(provider)}:${String(providerSessionId || '').trim()}`;
}

function startOfYesterdayMs() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - 1);
  return d.getTime();
}

function createSessionsDumpRunner({
  projectStore,
  logInfo = () => {},
  logWarn = () => {},
  logError = () => {},
}) {
  async function runForProject({ projectId, trigger = 'manual' }) {
    const project = projectStore.getById(projectId);
    if (!project?.path) {
      throw new Error('Project not found or path missing');
    }

    const projectPath = path.resolve(project.path);
    const sessionsRoot = resolveSessionsRoot(projectPath);
    const indexState = loadDumpIndex(projectPath);
    const yesterdayStartMs = startOfYesterdayMs();
    const result = {
      ok: true,
      projectId,
      projectPath,
      trigger,
      sessionsRoot,
      yesterdayStart: new Date(yesterdayStartMs).toISOString(),
      scanned: 0,
      inWindow: 0,
      changed: 0,
      dumpedFiles: 0,
      appendedRounds: 0,
      skippedUnchanged: 0,
      skippedOutOfWindow: 0,
      parseFailed: 0,
      warnings: [],
      files: [],
      elapsedMs: 0,
      finishedAt: '',
    };

    const startedAt = Date.now();
    try {
      const sessions = listProjectProviderSessions({ projectPath });
      result.scanned = sessions.length;

      for (const session of sessions) {
        const provider = normalizeProviderId(session?.provider);
        const providerSessionId = String(session?.providerSessionId || '').trim();
        if (!providerSessionId) continue;

        const sourceKey = buildSourceKey(provider, providerSessionId);
        const sourceRecord = indexState.sources[sourceKey] || {};
        const sourceMtimeMs = Number(session?.sourceMtimeMs || 0);
        if (sourceMtimeMs > 0 && sourceMtimeMs < yesterdayStartMs) {
          result.skippedOutOfWindow += 1;
          continue;
        }
        result.inWindow += 1;

        const sourceSize = Number(session?.sourceSize || 0);
        const unchangedByStat =
          sourceRecord.lastSourceMtimeMs === sourceMtimeMs &&
          sourceRecord.lastSourceSize === sourceSize &&
          !!sourceRecord.lastRoundSignature;
        if (unchangedByStat) {
          result.skippedUnchanged += 1;
          continue;
        }
        result.changed += 1;

        let rounds = [];
        try {
          rounds = readSessionRounds(session);
        } catch (error) {
          result.parseFailed += 1;
          result.warnings.push(`read rounds failed: ${session?.sessionFilePath || ''}`);
          logWarn('sessions-dump', 'Read session rounds failed', {
            provider,
            providerSessionId,
            path: session?.sessionFilePath || '',
            error: error instanceof Error ? error.message : String(error),
          });
          continue;
        }

        if (!Array.isArray(rounds) || rounds.length === 0) {
          result.skippedUnchanged += 1;
          continue;
        }

        const writeResult = writeSessionDump({
          projectPath,
          session: {
            ...session,
            provider,
            providerSessionId,
          },
          rounds,
          sourceRecord,
        });

        indexState.sources[sourceKey] = writeResult.nextRecord;
        if (writeResult.appendedRounds > 0) {
          result.appendedRounds += writeResult.appendedRounds;
          result.dumpedFiles += 1;
          result.files.push(writeResult.outputFilePath);
        } else {
          result.skippedUnchanged += 1;
        }
      }

      saveDumpIndex(projectPath, indexState);
      result.finishedAt = new Date().toISOString();
      result.elapsedMs = Date.now() - startedAt;
      logInfo('sessions-dump', 'Manual sessions dump finished', {
        projectId,
        scanned: result.scanned,
        dumpedFiles: result.dumpedFiles,
        appendedRounds: result.appendedRounds,
        elapsedMs: result.elapsedMs,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError('sessions-dump', 'Run sessions dump failed', error, {
        projectId,
        projectPath,
      });
      return {
        ...result,
        ok: false,
        error: message,
        finishedAt: new Date().toISOString(),
        elapsedMs: Date.now() - startedAt,
      };
    }
  }

  return { runForProject };
}

module.exports = { createSessionsDumpRunner };
