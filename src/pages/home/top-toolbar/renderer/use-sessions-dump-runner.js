import { useState } from 'react';

import { topToolbarBridge } from './top-toolbar.bridge';

export function useSessionsDumpRunner({ activeProject, setAppError }) {
  const [sessionsDumpRunning, setSessionsDumpRunning] = useState(false);
  const [sessionsDumpStatus, setSessionsDumpStatus] = useState('导出当前项目会话内容');

  async function onRunSessionsDump() {
    if (!activeProject?.id) {
      setAppError?.('请先选择一个项目后再导出会话内容');
      return;
    }
    setAppError?.('');
    setSessionsDumpStatus('正在导出当前项目会话内容');
    setSessionsDumpRunning(true);
    try {
      const result = await topToolbarBridge.sessionsDump.run({
        projectId: activeProject.id,
        trigger: 'manual',
      });
      if (!result?.ok) {
        setAppError?.(result?.error || '会话内容导出失败');
        setSessionsDumpStatus('会话内容导出失败');
        return;
      }
      setSessionsDumpStatus(
        `会话内容导出完成：${result.dumpedFiles} 个文件，新增 ${result.appendedRounds} 轮对话`,
      );
    } catch (e) {
      const rawMessage = e?.message || '会话内容导出失败';
      const noHandler = /No handler registered for 'sessions-dump:run'/i.test(rawMessage);
      setAppError?.(
        noHandler
          ? '主进程尚未加载 SESSIONS_DUMP_RUN 处理器。请重启应用后重试。'
          : rawMessage,
      );
      setSessionsDumpStatus('会话内容导出失败');
    } finally {
      setSessionsDumpRunning(false);
    }
  }

  return {
    sessionsDumpRunning,
    sessionsDumpStatus,
    onRunSessionsDump,
  };
}
