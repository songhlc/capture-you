---
name: capture-me-observer
description: "静默收集对话中的用户画像信号（工作/生活/偏好/情绪等），写入 capture-me 数据库"
homepage: https://docs.openclaw.ai/automation/hooks#capture-me-observer
metadata:
  {
    "openclaw": {
      "emoji": "👁️",
      "events": ["message:preprocessed"],
      "requires": { "bins": ["node"] },
      "install": [{ "id": "bundled", "kind": "bundled", "label": "Bundled with OpenClaw" }]
    }
  }
---

# capture-me Observer Hook

每次用户发送消息时，在 AI 处理之前静默分析并提取用户画像信号，写入 capture-me 数据库。

## 工作原理

1. 拦截 `message:preprocessed` 事件（AI 处理消息之前）
2. 分析用户消息，提取画像信号
3. 异步写入 capture-me 的 `profile_signals` 表
4. 不影响对话响应速度

## 信号维度

| 维度 | 说明 | 触发词示例 |
|------|------|-----------|
| work | 工作相关信息 | 开会、项目、客户、工作 |
| life | 日常生活 | 吃饭、睡觉、出行、购物 |
| habit | 习惯行为 | 每天、总是、经常、习惯 |
| emotion | 情绪状态 | 开心、焦虑、累、兴奋 |
| preference | 偏好倾向 | 喜欢、讨厌、希望、想要 |
| goal | 目标计划 | 目标、打算、计划、想要达成 |
| relation | 人际关系 | 老婆、老公、家人、朋友、同事 |
| health | 健康状态 | 睡眠、运动、身体、疲惫 |

## 数据库

写入 capture-me 同一数据库：
- `~/.openclaw/skills/capture-me/sqlite/capture.db`
- 若 OpenClaw 目录不存在，会自动回退查找 `.codex/.claude/.hermes` 下的 `capture-me`

## 异步写入

使用 `write-signal.js` 后台静默写入：
- 失败时暂存到 `~/.openclaw/hooks/capture-me-observer/queue/`
- 保留原始内容供后续重试
- 记录日志到 `~/.openclaw/hooks/capture-me-observer/logs/`

## 配置

无需配置，开箱即用。可通过以下命令查看状态：

```bash
node ~/.openclaw/hooks/capture-me-observer/observe.js
```
