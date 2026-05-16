# File Tree Feature

## 职责
项目文件树浏览、展开/折叠文件夹、点击文件打开。

## 通信模型
```
file-tree 读取 ← workspace.activeCwd
file-tree 不知道 sidebar 和 terminal 存在
```

## 禁止事项
- 不直接读取文件系统（通过 IPC 调用）
- 跨 feature 通信只通过 workspace.store
