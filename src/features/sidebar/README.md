# Sidebar Feature

## 职责
项目列表、会话列表、拖拽排序、右键菜单（重命名/归档）。

## 通信模型
```
sidebar 选择会话 → workspace.selectSession()
sidebar 不知道 terminal 存在
```

## 禁止事项
- 不直接调用 terminal 的切换方法
- 跨 feature 通信只通过 workspace.store
