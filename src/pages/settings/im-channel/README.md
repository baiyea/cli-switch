# Settings IM Channel Block

首版只支持飞书/Lark 私聊远程操作已有 session。

边界：

- 代码归属 `src/pages/settings/im-channel/`。
- 不创建 session。
- 不读取 provider 会话文件或聊天内容。
- 不 import terminal renderer/preload/bridge。
- 写入 session 只通过主进程注入的 session port。
