#!/usr/bin/env node

const platform = process.platform;

if (platform === "darwin") {
  console.error("⚠️ 当前系统是 macOS，已阻止执行 dist:win 以避免原生依赖被 Windows 构建污染。");
  console.error("请在 Windows/CI 环境执行 dist:win，或改用独立工作目录后再打包。");
  process.exit(1);
}

process.exit(0);
