import React from "react";
import { Card, CardContent } from "../ui/card";

export function AppearanceSettingsSection() {
  return (
    <div className="space-y-4 text-[var(--text-main)]">
      <h3 className="text-[30px] font-semibold leading-tight text-[var(--text-main)]">Appearance</h3>
      <Card className="rounded-lg border border-white/10 bg-white/[0.03]">
        <CardContent className="pt-4 text-sm text-[var(--text-muted)]">外观主题设置将在下一步接入。</CardContent>
      </Card>
    </div>
  );
}
