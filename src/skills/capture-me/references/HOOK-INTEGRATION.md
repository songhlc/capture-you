# capture-me Hook 集成指南

## OpenClaw Hook

capture-me 的被动观察功能通过 OpenClaw Hook 实现，位于：

```
~/.openclaw/hooks/capture-me-observer/
├── HOOK.md        # Hook 元数据
├── handler.js     # OpenClaw 事件处理
└── write-signals.js  # 异步写入
```

### 工作原理

1. OpenClaw 监听 `message:preprocessed` 事件
2. Hook 的 `handler.js` 提取消息中的画像信号
3. 通过 `write-signals.js` 异步写入 capture-me 数据库
4. 不影响对话响应速度

### 数据库

Hook 写入 capture-me 的同一数据库：
```
<agent-home>/skills/capture-me/sqlite/capture.db
```

### 文件同步关系

| OpenClaw Hook | capture-me 核心 |
|----------------|----------------|
| `handler.js` | 调用 `observe-async.js` |
| `write-signals.js` | 写入 `profile_signals` 表 |
| `observe-core.js` | 核心信号提取逻辑 |
| `observe-async.js` | 异步写入包装 |

### 查看 Hook 状态

```bash
openclaw hooks list
openclaw hooks info capture-me-observer
```

### 查看收集的信号

```bash
# 在 capture-me 目录
node observe-core.js --stat

# 查看最近信号
node observe-core.js --list 20
```

## 多 Agent 集成

capture-me 的 observer 核心库可以被多个 Agent 共用：

```
Agent Hook/集成          → capture-me 核心库
─────────────────────────────────────────────
OpenClaw Hook             → observe-async.js
Claude Code Prompt       → observe-async.js
Codex AGENTS.md          → observe-async.js
```

各 Agent 只需调用 `observe-async.js` 即可将信号写入 capture-me 数据库。

## 信号维度

| 维度 | 说明 | 触发词示例 |
|------|------|-----------|
| work | 工作相关信息 | 开会、项目、加班、老板 |
| life | 日常生活 | 吃饭、购物、出行 |
| habit | 习惯行为 | 每天、熬夜、习惯 |
| emotion | 情绪状态 | 开心、焦虑、累 |
| preference | 偏好倾向 | 喜欢、讨厌、希望 |
| goal | 目标计划 | 目标、打算、计划 |
| relation | 人际关系 | 老婆、同事、朋友 |
| health | 健康状态 | 睡眠、运动、身体 |

## 失败处理

- 异步写入失败时暂存到 `queue/failed-*.json`
- 日志记录到 `logs/observe-*.log`
- 可手动运行 `node observe-core.js --retry` 重试
