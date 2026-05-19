import { Minus, Square, X } from 'lucide-react';
import React from 'react';

import { topToolbarBridge } from './top-toolbar.bridge';

export function WindowControls() {
  function onMinimize() {
    void topToolbarBridge.window.minimize().catch(() => {});
  }

  function onToggleMaximize() {
    void topToolbarBridge.window.toggleMaximize().catch(() => {});
  }

  function onClose() {
    void topToolbarBridge.window.close().catch(() => {});
  }

  return (
    <div className="window-controls" aria-label="窗口控制">
      <button
        type="button"
        className="window-control-btn"
        aria-label="最小化"
        title="最小化"
        onClick={onMinimize}
      >
        <Minus size={14} strokeWidth={1.8} />
      </button>
      <button
        type="button"
        className="window-control-btn"
        aria-label="最大化"
        title="最大化"
        onClick={onToggleMaximize}
      >
        <Square size={12} strokeWidth={1.8} />
      </button>
      <button
        type="button"
        className="window-control-btn close"
        aria-label="关闭"
        title="关闭"
        onClick={onClose}
      >
        <X size={15} strokeWidth={1.8} />
      </button>
    </div>
  );
}
