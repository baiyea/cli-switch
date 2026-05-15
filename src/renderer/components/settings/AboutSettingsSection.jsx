import React, { useState } from "react";
import { settingsBridge } from "../../../bridge";
import { Button } from "../ui/button";

export function AboutSettingsSection({ appVersion, appLogo }) {
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState({ type: "", message: "", paths: [] });

  const toDisplayPath = (value) => {
    const raw = String(value || "");
    if (!raw) return raw;
    const userHome = (typeof process !== "undefined" && process?.env?.HOME) || "";
    if (userHome && raw.startsWith(userHome)) {
      return `~${raw.slice(userHome.length)}`;
    }
    return raw;
  };

  const handleCleanRuntimeData = async () => {
    if (cleaning) return;
    const confirmed = window.confirm("确认清理运行数据库和缓存文件吗？该操作不可撤销。");
    if (!confirmed) return;
    setCleaning(true);
    setCleanResult({ type: "", message: "", paths: [] });
    try {
      const result = await settingsBridge.cleanRuntimeData();
      if (!result?.ok) {
        throw new Error(result?.message || "运行数据清理失败");
      }
      const uniquePaths = Array.from(new Set([...(result.runtimeDirs || []), result.dbPath].filter(Boolean)));
      setCleanResult({
        type: "success",
        message: "运行数据已清理完成",
        paths: uniquePaths.map((item) => toDisplayPath(item))
      });
    } catch (error) {
      setCleanResult({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
        paths: []
      });
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 flex flex-col gap-3.5">
        <div className="flex items-center gap-3.5">
          {appLogo ? (
            <img src={appLogo} alt="Cli-Switch logo" className="h-20 w-20 rounded-lg object-cover" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-[#565e74]">
              <span className="text-[30px] text-white">▣</span>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <div className="text-[22px] font-extrabold tracking-tight text-[#EDEDEF]">Cli-Switch</div>
            <div className="text-[12px] text-[#8A8A90]">Seamlessly switch between AI coding assistants.</div>
          </div>
        </div>

        <div className="h-px w-full bg-white/10" />

        <div className="flex flex-col gap-2.5">
          <div className="flex justify-between items-center">
            <span className="text-[12px] text-[#8A8A90]">Platform</span>
            <span className="text-[12px] font-semibold text-[#EDEDEF]">Electron + React + TypeScript</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[12px] text-[#8A8A90]">Terminal Core</span>
            <span className="text-[12px] font-semibold text-[#EDEDEF]">@xterm/xterm v5.x</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[12px] text-[#8A8A90]">Storage</span>
            <span className="text-[12px] font-semibold text-[#EDEDEF]">SQLite 3 (Local)</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[12px] text-[#8A8A90]">Version</span>
            <span className="text-[12px] font-semibold text-[#EDEDEF]">{appVersion}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="h-px w-full bg-white/10" />
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#8A8A90]">应用数据</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleCleanRuntimeData}
              disabled={cleaning}
              className="h-7 rounded-[4px] border border-white/10 bg-white/[0.08] px-3 text-[12px] font-semibold text-[#EDEDEF] transition-opacity duration-150 hover:bg-white/[0.12]"
            >
              {cleaning ? "清理中..." : "一键清理"}
            </Button>
          </div>
          {cleanResult.message ? (
            <div className={`text-xs ${cleanResult.type === "error" ? "text-[#f6a3ad]" : "text-[#8A8A90]"}`}>
              {cleanResult.message}
              {cleanResult.paths.length > 0 ? `：${cleanResult.paths.join("、")}` : ""}
            </div>
          ) : null}
          <div className="h-px w-full bg-white/[0.08]" />
        </div>

        <div className="mt-auto flex justify-center gap-4 pt-5">
          <Button variant="ghost" size="sm" className="h-auto rounded-lg px-0 text-[12px] font-semibold text-[#5E6AD2] hover:bg-transparent hover:text-[#5E6AD2] hover:opacity-80">
            Check for Updates
          </Button>
          <Button variant="ghost" size="sm" className="h-auto rounded-lg px-0 text-[12px] font-semibold text-[#8A8A90] hover:bg-transparent hover:text-[#EDEDEF]">
            Documentation
          </Button>
          <Button variant="ghost" size="sm" className="h-auto rounded-lg px-0 text-[12px] font-semibold text-[#8A8A90] hover:bg-transparent hover:text-[#EDEDEF]">
            GitHub
          </Button>
        </div>
      </div>
    </div>
  );
}
