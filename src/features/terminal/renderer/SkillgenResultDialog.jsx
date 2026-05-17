import React from "react";
import { Button } from "../../../ui/button";
import { Dialog, DialogContent, DialogTitle } from "../../../ui/dialog";

export function SkillgenResultDialog({
  open,
  running,
  result,
  onClose
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !running) onClose();
      }}
    >
      <DialogContent className="skillgen-modal p-0 gap-0" showClose={false}>
        <div className="skillgen-modal-header">
          <DialogTitle className="skillgen-modal-title">Skill 生成结果</DialogTitle>
          <Button
            type="button"
            className="skillgen-modal-close-btn"
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={running}
          >
            ×
          </Button>
        </div>
        {running ? (
          <div className="skillgen-modal-body">正在分析会话内容并提取可复用技能...</div>
        ) : (
          <div className="skillgen-modal-body">
            {result?.ok ? (
              <>
                <div>已扫描会话文件：{result.scanned}</div>
                <div>本次增量处理：{result.changed}（跳过 {result.skipped}）</div>
                <div>模型抽取候选：{result.modelExtracted || 0}（采纳 {result.modelAccepted || 0}）</div>
                <div>生成 skill：新增 {result.created}，更新 {result.updated}</div>
                <div>草稿候选：{result.drafted}，丢弃：{result.discarded}</div>
                {result.created + result.updated === 0 && (
                  <div>未提取到高价值可复用内容。</div>
                )}
              </>
            ) : (
              <div>{result?.error || "Skill 生成失败"}</div>
            )}
          </div>
        )}
        <div className="skillgen-modal-footer">
          <Button
            type="button"
            className="skillgen-modal-ok-btn"
            onClick={onClose}
            disabled={running}
          >
            确定
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
