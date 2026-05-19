import React from 'react';

import { Button } from '../../ui/button';
import { DownloadIcon, ExternalLinkIcon, FolderCodeIcon, PlusIcon } from '../../ui/icon-registry';

export function WelcomeView({ onCreateProject, onImportProject, onLearnMore }) {
  return (
    <div className="welcome-wrap">
      <div className="welcome-card">
        <div className="welcome-header">
          <span className="welcome-media" aria-hidden="true">
            <FolderCodeIcon size={24} />
          </span>
          <h2 className="welcome-title">欢迎使用 Cli-Switch</h2>
          <p className="welcome-desc">创建您的第一个项目，开始 CLI 会话管理。</p>
        </div>
        <div className="welcome-actions">
          <Button type="button" className="welcome-btn-primary" onClick={onCreateProject}>
            <PlusIcon size={14} />
            <span>创建项目</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="welcome-btn-secondary"
            onClick={onImportProject}
          >
            <DownloadIcon size={14} />
            <span>导入项目</span>
          </Button>
        </div>
        <Button type="button" variant="ghost" className="welcome-link-btn" onClick={onLearnMore}>
          <span>了解更多</span>
          <ExternalLinkIcon size={12} />
        </Button>
      </div>
    </div>
  );
}
