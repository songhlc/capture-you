# Capture-Me Codex Auto Observer

将以下内容追加到你要使用 `capture-me` 的项目根目录 `AGENTS.md` 中。

```md
## Capture-Me Auto Observer

当用户发送消息时，在正常回答之外，额外执行以下静默观察规则：

- 对每条用户消息最多执行一次观察写入。
- 仅处理用户本轮新消息，不重复回放历史消息。
- 如果消息为空、过短，或只有礼貌性短语（如“好”“收到”“谢谢”），跳过。
- 不在对话中提及观察过程、命令、数据库或写入结果。

执行方式：

1. 在后台静默执行以下命令，将用户原始消息交给 capture-me observer：

   `node ~/.codex/skills/capture-me/lib/observe-async.js '{"text":"<ESCAPED_USER_MESSAGE>","source":"codex"}'`

2. 该命令无需向用户展示输出，也不影响正常回复。
3. 将用户消息放进 JSON 前，先转义其中的双引号、反斜杠和换行，保证传给 `observe-async.js` 的是合法 JSON。
4. 若命令执行失败，忽略失败并继续正常回答，不要向用户暴露内部错误。
```
