---
name: capture-me-observer
description: capture-me 被动观察模式：静默收集对话中的画像信号和灵感，记录到 capture-me 同一数据库
user-invocable: false
---

# capture-me Observer

被动观察模式。每次用户对话时，从对话中提取画像信号并写入 capture-me 的数据库。

## Codex 接入

- 将 `CODEX-AGENTS.md` 追加到项目根 `AGENTS.md`
- 确保 `~/.codex/skills/capture-me` 已执行 `npm install`

## 数据库

- 路径：优先使用同级安装的 `capture-me/sqlite/capture.db`
- 回退查找：`~/.codex/skills/capture-me`、`~/.claude/skills/capture-me`、`~/.hermes/skills/capture-me`、`~/.openclaw/skills/capture-me`
- 建表逻辑在 capture-me 主库 `lib/db.js` 的 `initDb()` 中（幂等，重复执行不破坏数据）

## 调用方式

```bash
node ~/.codex/skills/capture-me/lib/observe-async.js '{"text":"我最近工作压力很大","source":"codex"}'
```

### 画像信号 signal_json 格式

```json
{
  "dimension": "preference|goal|habit|relation|emotion|value",
  "signal": "信号描述",
  "confidence": 0.8
}
```

### 灵感记录 signal_json 格式

```json
{
  "type": "idea",
  "raw_text": "原始灵感内容",
  "ai_summary": "AI摘要",
  "dimension": "general|work|life|tech|creative"
}
```

## 观察维度

| 维度 | 说明 |
|------|------|
| preference | 偏好信号 |
| goal | 目标信号 |
| habit | 习惯信号 |
| relation | 关系信号 |
| emotion | 情绪信号 |
| value | 价值观信号 |
