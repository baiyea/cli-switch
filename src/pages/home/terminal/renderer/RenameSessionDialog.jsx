import React from 'react';

import { Button } from '../../../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../../ui/dialog';
import { Input } from '../../../../ui/input';

export function RenameSessionDialog({
  open,
  onClose,
  submitting,
  inputRef,
  draft,
  onDraftChange,
  onSubmit,
  suggesting,
  suggestedTitle,
  suggestSource,
  onUseSuggestedTitle,
}) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="rename-modal p-0 gap-0" showClose={false}>
        <div className="rename-modal-header">
          <div className="rename-modal-title-wrap">
            <DialogHeader>
              <DialogTitle className="rename-modal-title">重命名会话</DialogTitle>
              <DialogDescription className="rename-modal-subtitle">
                保持简短且易于识别。
              </DialogDescription>
            </DialogHeader>
          </div>
          <Button
            type="button"
            className="rename-modal-close-btn"
            aria-label="关闭"
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={submitting}
          >
            ×
          </Button>
        </div>
        <div className="rename-modal-body">
          <Input
            ref={inputRef}
            type="text"
            className="rename-modal-input"
            maxLength={64}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onSubmit();
                return;
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
          />
          <div className="rename-suggest-block">
            <div className="rename-suggest-label">推荐标题</div>
            {suggesting ? (
              <div className="rename-suggest-loading">正在生成推荐标题...</div>
            ) : suggestedTitle ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="rename-suggest-chip"
                onClick={() => onUseSuggestedTitle(suggestedTitle)}
                title={suggestSource === 'llm' ? '模型生成，点击使用' : '本地回退生成，点击使用'}
              >
                {suggestedTitle}
              </Button>
            ) : (
              <div className="rename-suggest-loading">暂无推荐标题</div>
            )}
          </div>
        </div>
        <div className="rename-modal-footer">
          <Button
            type="button"
            variant="secondary"
            className="rename-modal-cancel-btn"
            onClick={onClose}
            disabled={submitting}
          >
            取消
          </Button>
          <Button
            type="button"
            className="rename-modal-submit-btn"
            onClick={onSubmit}
            disabled={submitting}
          >
            保存
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
