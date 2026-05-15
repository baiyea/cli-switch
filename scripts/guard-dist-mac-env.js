#!/usr/bin/env node

const platform = process.platform;

if (platform !== "darwin") {
  console.error("⚠️ 当前系统不是 macOS，已阻止执行 dist:mac。");
  console.error("请在 macOS 环境执行 dist:mac:x64 / dist:mac:arm64。");
  process.exit(1);
}

process.exit(0);
