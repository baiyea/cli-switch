#!/usr/bin/env node

const platform = process.platform;
const targetArch = String(process.env.CLI_TARGET_ARCH || process.argv[2] || "").toLowerCase();

if (platform === "darwin") {
  console.error("⚠️ 当前系统是 macOS，已阻止执行 dist:win 以避免原生依赖被 Windows 构建污染。");
  console.error("请在 Windows/CI 环境执行 dist:win，或改用独立工作目录后再打包。");
  process.exit(1);
}

if (platform === "win32" && targetArch && targetArch !== process.arch) {
  console.error(`⚠️ 当前 Node 架构是 ${process.arch}，目标 Windows 架构是 ${targetArch}，已阻止执行 dist:win。`);
  console.error("当前打包流程会把本机 Node runtime 复制进 CLI runtime；跨架构打包会导致目标机器无法启动 Claude/Gemini CLI。");
  console.error(`请在 ${targetArch} 架构的 Windows/Node 环境执行该打包命令。`);
  process.exit(1);
}

process.exit(0);
