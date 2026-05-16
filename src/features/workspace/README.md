# Workspace Feature

## 职责
跨 feature UI 状态协调。sidebar / terminal / file-tree 通过 workspace.store 通信。

## 通信模型
```
sidebar 选择会话 → workspace.selectSession()
terminal 读取 ← workspace.activeSessionId
file-tree 读取 ← workspace.activeCwd
```

sidebar 不知道 terminal 存在，terminal 不知道 sidebar 存在。

## 文件边界
- renderer/workspace.store.ts  — Zustand store
- renderer/use-workspace.ts     — hook
- shared/workspace.types.ts     — 类型定义

## 禁止事项
- 不放业务逻辑（只放选中状态）
- 只暴露 activeProjectId / activeSessionId / activeCwd 三个字段
- 不直接操作数据库
