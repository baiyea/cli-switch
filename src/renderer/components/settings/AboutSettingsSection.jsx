import React from "react";
import { ExternalLinkIcon } from "../../icons/icon-registry";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

export function AboutSettingsSection({ appVersion, appLogo }) {
  return (
    <div className="space-y-4 text-[var(--text-main)]">
      <h3 className="text-[30px] font-semibold leading-tight text-[var(--text-main)]">About</h3>

      <div className="flex items-center gap-4 rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/[0.05]">
          <img src={appLogo} alt="" className="h-8 w-8" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[var(--text-main)]">ZeeLin Code</div>
          <div className="text-xs text-[var(--text-muted)]">查看应用版本、版权与项目联系信息。</div>
        </div>
        <Badge variant="muted">v{appVersion}</Badge>
      </div>

      <Card className="rounded-lg border border-white/10 bg-white/[0.03]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-[var(--text-main)]">ZeeLin Code Docs</CardTitle>
          <CardDescription className="text-xs text-[var(--text-muted)]">
            用于管理 AI 编程工具配置、环境变量与本地文档的设置中心。
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="rounded-lg border border-white/10 bg-white/[0.03]">
        <div className="divide-y divide-white/10">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-xs text-[var(--text-muted)]">版本</span>
            <span className="text-sm font-medium text-[var(--text-main)]">{appVersion}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-xs text-[var(--text-muted)]">版权</span>
            <span className="text-sm font-medium text-[var(--text-main)]">Copyright © 2026 ZeeLin.cn All rights reserved.</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-xs text-[var(--text-muted)]">联系人</span>
            <span className="text-sm font-medium text-[var(--text-main)]">ZeeLin</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-xs text-[var(--text-muted)]">联系邮箱</span>
            <span className="text-sm font-medium text-[var(--text-main)]">g_2007@qq.com</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-xs text-[var(--text-muted)]">项目来源</span>
            <span className="text-sm font-medium text-[var(--text-main)]">ZeeLinCode</span>
          </div>
        </div>
      </Card>

      <Card className="rounded-lg border border-white/10 bg-white/[0.03]">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded bg-white/[0.05]" aria-hidden="true">
              <ExternalLinkIcon size={14} />
            </span>
            <span className="text-sm font-semibold text-[var(--text-main)]">项目来源说明</span>
          </div>
          <CardDescription className="text-xs text-[var(--text-muted)]">
            项目来自@ZeeLin 原创设计 @2026 用于集中维护模型工具配置、归档与外观选项。
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-2">
            <Badge variant="muted">ZeeLinCode</Badge>
            <Badge variant="success">内部使用</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
