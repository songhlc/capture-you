---
name: capture-me-standup
description: 站会助手 (Standup Assistant) — 将 B站/语音/文字记录转换为结构化工作汇报。支持多轮对话格式解析、列表格式提取、AI 摘要生成。Use when user mentions "站会", "standup", "工作汇报", "B站转文字", "语音转文字站会".
---

# 站会助手 (Standup Assistant)

## 功能

将零散的站会记录（B站语音、语音消息、文字列表）转换为结构化的工作汇报。

### 输入格式
- B站语音/视频转文字
- 语音助手转文字
- 飞书妙记/Zeemo 等工具导出文字
- 多轮对话格式（Q: / A: 交错）
- 列表格式（1. xxx 2. xxx）

### 输出格式
```markdown
## 站会汇报

### 昨日完成
- [完成项1]
- [完成项2]

### 今日计划
- [计划项1]
- [计划项2]

### 阻塞/风险
- [风险项]
```

## CLI 用法

```bash
# 交互式输入
node ~/.claude/skills/capture-me/lib/standup.js

# 传入文字直接解析
echo "完成了A 准备开始B" | node ~/.claude/skills/capture-me/lib/standup.js

# 演示模式（用内置示例）
node ~/.claude/skills/capture-me/lib/standup.js demo

# 输出JSON格式
node ~/.claude/skills/capture-me/lib/standup.js --json
```

## 语音转文字方案

当需要将语音转为文字时（如 B站语音、语音消息、会议录音等），调用语音转文字技能处理。支持的输入格式：wav、m4a、mp3、ogg 等常见音频格式。

### 推荐方案

**本地优先**：优先使用本地方案（whisper.cpp / faster-whisper），隐私保护且无 API 费用。
**云端备选**：如需更高准确率或无本地环境，使用 OpenAI Whisper API 或飞书妙记等第三方工具。
**工作流**：录音 → 语音转文字 → standup.js 解析 → 结构化汇报。

## 已知限制

- 正则模式对多轮对话格式的提取有时不完整
- 列表格式需明确使用数字编号
- 方言识别准确率有限
