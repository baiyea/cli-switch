#!/usr/bin/env node

const platform = process.platform;
const targetArch = String(process.env.CLI_TARGET_ARCH || process.argv[2] || '').toLowerCase();

if (platform !== 'darwin') {
  console.error('⚠️ 当前系统不是 macOS，已阻止执行 dist:mac。');
  console.error('请在 macOS 环境执行 dist:mac:x64 / dist:mac:arm64。');
  process.exit(1);
}

if (targetArch && targetArch !== process.arch) {
  console.error(
    `⚠️ 当前 Node 架构是 ${process.arch}，目标 mac 架构是 ${targetArch}，已阻止执行 dist:mac:${targetArch}。`,
  );
  console.error(
    '当前打包流程会把本机 Node runtime 复制进 CLI runtime；跨架构打包会导致目标机器无法启动 Claude/Gemini CLI。',
  );
  console.error(
    `请在 ${targetArch} 架构的 macOS/Node 环境执行该打包命令，或先实现目标架构 Node runtime 下载/选择逻辑。`,
  );
  process.exit(1);
}

process.exit(0);
