'use strict';

const NO_BINDING_TEXT = '尚未绑定会话。发送 /list 查看会话，然后使用 /use <id> 绑定。';

function normalizePreview(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function formatSession(session, starred = false) {
  const mark = starred ? '★ ' : '  ';
  const summary = `${mark}[${session.dbSessionId}] ${session.title} · ${session.provider} · ${session.status} · ${session.updatedAt}`;
  const assistantPreview = normalizePreview(session.latestAssistantText, 120);
  return assistantPreview ? `${summary}\n    最后回复：${assistantPreview}` : summary;
}

function formatBinding(session) {
  return `[${session.dbSessionId}] ${session.title} · ${session.provider} · ${session.status}`;
}

function formatSessionDetail(prefix, session) {
  const assistantText = String(session.latestAssistantText || '').trim();
  const detail = assistantText
    ? `\n最后回复：\n${assistantText.slice(0, 1200)}`
    : '\n最后回复：暂无可读取的大模型回复。';
  return `${prefix} ${formatBinding(session)}${detail}`;
}

function createImSessionRouter({ platform, bindingRepository, sessionPort, t }) {
  const tr = (key, params = {}) => {
    if (typeof t === 'function') {
      const result = t(key, params);
      if (result && result !== key) return result;
    }
    const fallbacks = {
      'settings.imChannel.router.noBinding': NO_BINDING_TEXT,
      'settings.imChannel.router.lastReply': '最后回复：',
      'settings.imChannel.router.boundPrefix': '已绑定',
      'settings.imChannel.router.notWritable': '会话不可写，请先在桌面端打开或恢复：',
      'settings.imChannel.router.sentTo': '已发送到',
      'settings.imChannel.router.writeFailed': '写入失败：',
      'settings.imChannel.router.currentBinding': '当前绑定',
      'settings.imChannel.router.noSessions': '暂无可用会话。请先在桌面端创建会话。',
      'settings.imChannel.router.sessionNotFound': '未找到可用会话：{dbSessionId}',
      'settings.imChannel.router.invalidCommand': '命令无效：{reason}',
      'settings.imChannel.router.projectLabel': '项目：{name}',
      'settings.imChannel.router.noAssistantReply': '暂无可读取的大模型回复。',
    };
    let text = fallbacks[key] || key;
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v ?? ''));
    }
    return text;
  };
  async function resolveBinding(imUserId) {
    const binding = await bindingRepository.getBinding({ platform, imUserId });
    if (!binding) return null;
    return await sessionPort.getSessionById(binding.sessionId);
  }

  async function bind(imUserId, dbSessionId) {
    const session = await sessionPort.getSessionByDbId(dbSessionId);
    if (!session || session.isArchived) {
      return { ok: false, text: tr('settings.imChannel.router.sessionNotFound', { dbSessionId }) };
    }
    await bindingRepository.setBinding({
      platform,
      imUserId,
      sessionId: session.sessionId,
      sessionDbId: session.dbSessionId,
    });
    return { ok: true, session, text: formatSessionDetail(tr('settings.imChannel.router.boundPrefix'), session) };
  }

  async function sendToSession(session, text) {
    if (!await sessionPort.isSessionWritable(session)) {
      return { ok: false, text: `${tr('settings.imChannel.router.notWritable')}${formatBinding(session)}` };
    }
    const ok = await sessionPort.writeSessionInput(session.sessionId, `${text}\r`);
    return ok
      ? { ok: true, text: `${tr('settings.imChannel.router.sentTo')}${formatBinding(session)}` }
      : { ok: false, text: `${tr('settings.imChannel.router.writeFailed')}${formatBinding(session)}` };
  }

  return {
    async handleCommand({ imUserId, command }) {
      if (command.type === 'invalid') return { ok: false, text: tr('settings.imChannel.router.invalidCommand', { reason: command.reason }) };
      if (command.type === 'list') {
        const current = await bindingRepository.getBinding({ platform, imUserId });
        const groups = await sessionPort.listProjectsWithRecentSessions();
        const text = groups
          .map((group) => [
            tr('settings.imChannel.router.projectLabel', { name: group.projectName }),
            ...group.sessions.map((session) =>
              formatSession(session, current?.sessionId === session.sessionId),
            ),
          ].join('\n'))
          .join('\n\n');
        return { ok: true, text: text || tr('settings.imChannel.router.noSessions') };
      }
      if (command.type === 'showBinding') {
        const session = await resolveBinding(imUserId);
        if (!session) return { ok: false, text: tr('settings.imChannel.router.noBinding') };
        return { ok: true, text: formatSessionDetail(tr('settings.imChannel.router.currentBinding'), session) };
      }
      if (command.type === 'bind') {
        return bind(imUserId, command.dbSessionId);
      }
      if (command.type === 'bindAndSend') {
        const bound = await bind(imUserId, command.dbSessionId);
        if (!bound.ok) return bound;
        return sendToSession(bound.session, command.text);
      }
      if (command.type === 'send') {
        const session = await resolveBinding(imUserId);
        if (!session) return { ok: false, text: tr('settings.imChannel.router.noBinding') };
        return sendToSession(session, command.text);
      }
      return { ok: false, text: '命令无效：unknown-command' };
    },
  };
}

module.exports = {
  NO_BINDING_TEXT,
  createImSessionRouter,
};
