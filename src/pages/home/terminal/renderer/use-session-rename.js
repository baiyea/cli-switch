import { useEffect, useRef, useState } from "react";
import { terminalSessionBridge } from "./terminal.bridge";

export function useSessionRename({ sessions, renameSession, setAppError }) {
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameSessionId, setRenameSessionId] = useState("");
  const [renameDraft, setRenameDraft] = useState("");
  const [renameSubmitting, setRenameSubmitting] = useState(false);
  const [renameSuggestedTitle, setRenameSuggestedTitle] = useState("");
  const [renameSuggesting, setRenameSuggesting] = useState(false);
  const [renameSuggestSource, setRenameSuggestSource] = useState("");
  const renameInputRef = useRef(null);

  function openRenameModal(sessionId) {
    const target = sessions.find((item) => item.sessionId === sessionId);
    if (!target) return;
    setAppError?.("");
    setRenameSessionId(target.sessionId);
    setRenameDraft(target.name || "");
    setRenameSubmitting(false);
    setRenameSuggestedTitle("");
    setRenameSuggesting(true);
    setRenameSuggestSource("");
    setRenameModalOpen(true);
    void terminalSessionBridge.suggestTitle({
      sessionId: target.sessionId,
      provider: target.provider,
      providerSessionId: target.providerSessionId
    }).then((result) => {
      if (!result?.ok) return;
      setRenameSuggestedTitle(result.title || "");
      setRenameSuggestSource(result.source || "");
    }).catch(() => {
      setRenameSuggestSource("fallback");
    }).finally(() => {
      setRenameSuggesting(false);
    });
  }

  function closeRenameModal(forceClose = false) {
    if (renameSubmitting && !forceClose) return;
    setRenameModalOpen(false);
    setRenameSessionId("");
    setRenameDraft("");
    setRenameSubmitting(false);
    setRenameSuggestedTitle("");
    setRenameSuggesting(false);
    setRenameSuggestSource("");
  }

  async function submitRenameModal() {
    if (!renameModalOpen || !renameSessionId || renameSubmitting) return;
    const targetSession = sessions.find((item) => item.sessionId === renameSessionId);
    const originalTitle = targetSession?.name || "";
    const nextTitle = String(renameDraft || "").trim();
    if (!nextTitle) {
      setAppError?.("会话标题不能为空");
      return;
    }

    try {
      setRenameSubmitting(true);
      if (nextTitle !== originalTitle) {
        await renameSession(renameSessionId, nextTitle);
      }
      closeRenameModal(true);
    } catch (e) {
      setAppError?.(`重命名会话失败：${e?.message || "未知错误"}`);
      setRenameSubmitting(false);
    }
  }

  useEffect(() => {
    if (!renameModalOpen) return;
    const input = renameInputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [renameModalOpen]);

  useEffect(() => {
    if (!renameModalOpen || !renameSessionId) return;
    const exists = sessions.some((item) => item.sessionId === renameSessionId);
    if (!exists) closeRenameModal();
  }, [renameModalOpen, renameSessionId, sessions]);

  return {
    openRenameModal,
    renameDialogProps: {
      open: renameModalOpen,
      onClose: closeRenameModal,
      submitting: renameSubmitting,
      inputRef: renameInputRef,
      draft: renameDraft,
      onDraftChange: setRenameDraft,
      onSubmit: () => void submitRenameModal(),
      suggesting: renameSuggesting,
      suggestedTitle: renameSuggestedTitle,
      suggestSource: renameSuggestSource,
      onUseSuggestedTitle: setRenameDraft
    }
  };
}
