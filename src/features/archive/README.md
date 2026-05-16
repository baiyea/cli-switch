# Archive Feature

## 职责
归档会话的列表展示、恢复（回到活跃列表）、永久删除。

## 禁止事项
- 不直接操作数据库（通过 IPC 调用 kernel/db）
