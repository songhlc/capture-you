#!/usr/bin/env node
/**
 * digital-twin.js — 数字分身 v1.0
 *
 * 基于 capture-me 数据的数字分身
 * 用途：
 *   1. 帮我起草消息（模拟我的风格）
 *   2. 帮我分析某个人会怎么反应
 *   3. 帮我预演重要对话
 *   4. 给我不同视角的建议
 *
 * 用法：
 *   node digital-twin.js profile          # 查看分身档案
 *   node digital-twin.js draft "场景描述"  # 生成草稿
 *   node digital-twin.js simulate "情境"   # 模拟反应
 *   node digital-twin.js persona          # 输出角色设定
 */

const path = require('path');
const SKILL_DIR = path.join(__dirname, '..');
const Database = require(path.join(SKILL_DIR, 'node_modules', 'better-sqlite3'));

const DB_PATH = path.join(SKILL_DIR, 'sqlite', 'capture.db');
const fs = require('fs');

// ─── 数据库 ────────────────────────────────────────────────

function getDb(readonly = true) {
  if (!fs.existsSync(DB_PATH)) return null;
  return new Database(DB_PATH, { readonly });
}

function query(sql, params = []) {
  const db = getDb();
  if (!db) return [];
  try {
    return db.prepare(sql).all(...params);
  } finally {
    db.close();
  }
}

function queryOne(sql, params = []) {
  const db = getDb();
  if (!db) return null;
  try {
    return db.prepare(sql).get(...params);
  } finally {
    db.close();
  }
}

// ─── 分身档案构建 ─────────────────────────────────────────

function buildProfile() {
  // 获取性格信号
  const personalitySignals = query(`
    SELECT * FROM profile_signals
    WHERE dimension IN ('personality', 'emotion', 'habit', 'work', 'life', 'self_awareness')
    ORDER BY created_at DESC
    LIMIT 100
  `);

  // 获取最近的工作/生活记录
  const recentNotes = query(`
    SELECT * FROM notes
    ORDER BY date DESC, time DESC
    LIMIT 200
  `);

  // 获取承诺和决策
  const commitments = query(`SELECT * FROM commitments ORDER BY created_at DESC LIMIT 20`);
  const decisions = query(`SELECT * FROM profile_signals WHERE dimension = 'decision' ORDER BY created_at DESC LIMIT 20`);

  // 获取关系概况
  const relationSignals = query(`
    SELECT * FROM profile_signals
    WHERE dimension = 'relation'
    ORDER BY created_at DESC
    LIMIT 50
  `);

  // 获取成就（表可能不存在）
  let achievements = [];
  try { achievements = query(`SELECT * FROM achievements ORDER BY earned_at DESC LIMIT 10`); } catch (e) {}

  // 分析沟通风格
  const communicationStyle = analyzeCommunicationStyle(recentNotes);

  // 分析价值观倾向
  const values = analyzeValues(recentNotes, personalitySignals);

  // 分析决策模式
  const decisionPattern = analyzeDecisionPattern(decisions, commitments);

  // 分析压力反应
  const stressResponse = analyzeStressResponse(recentNotes);

  // 分析关系模式
  const relationshipPattern = analyzeRelationshipPattern(relationSignals);

  return {
    generated_at: new Date().toISOString(),
    communication_style: communicationStyle,
    values,
    decision_pattern: decisionPattern,
    stress_response: stressResponse,
    relationship_pattern: relationshipPattern,
    personality_traits: extractTraits(personalitySignals),
    recent_context: extractRecentContext(recentNotes),
    achievements: achievements.map(a => a.name || a.title),
  };
}

// ─── 风格分析 ─────────────────────────────────────────────

function analyzeCommunicationStyle(notes) {
  const text = notes.map(n => n.raw_text).join(' ');

  // 长度偏好
  const avgLength = text.length / Math.max(notes.length, 1);
  const lengthPref = avgLength > 200 ? '详尽' : avgLength > 100 ? '适中' : '简洁';

  // 直接程度
  const directPatterns = [/我觉得|我认为|我想|我要|应该|必须|不要/];
  const indirectPatterns = [/可能|也许|大概|是不是|要不要/];
  const directCount = directPatterns.reduce((acc, p) => acc + (p.test(text) ? 1 : 0), 0);
  const indirectCount = indirectPatterns.reduce((acc, p) => acc + (p.test(text) ? 1 : 0), 0);
  const directness = directCount > indirectCount ? '直接' : directCount === indirectCount ? '平衡' : '委婉';

  // 情感表达
  const emotionalScore = (() => {
    let score = 0;
    const emotionalWords = /开心|难过|生气|兴奋|焦虑|担心|害怕|幸福|感动|温暖/;
    for (const note of notes) {
      if (emotionalWords.test(note.raw_text)) score++;
    }
    return score > 10 ? '丰富' : score > 5 ? '适度' : '内敛';
  })();

  // 正式程度
  const formalPatterns = [/贵公司|贵司|烦请|敬请|特此|予以/];
  const casualPatterns = [/哈|嘿|呗|啦|呀|哇/];
  const formalCount = formalPatterns.reduce((acc, p) => acc + (p.test(text) ? 1 : 0), 0);
  const casualCount = casualPatterns.reduce((acc, p) => acc + (p.test(text) ? 1 : 0), 0);
  const formality = formalCount > casualCount ? '正式' : casualCount > formalCount ? '随性' : '半正式';

  // 结构化程度
  const structuredPatterns = [/第一|第二|第三|首先|其次|最后|综上|因此/];
  const structuredCount = structuredPatterns.reduce((acc, p) => acc + (p.test(text) ? 1 : 0), 0);
  const structure = structuredCount > notes.length * 0.3 ? '结构化' : '自然流畅';

  return {
    length_preference: lengthPref,
    directness,
    emotional_expression: notes.length > 0 ? emotionalScore : '未知',
    formality,
    structure_preference: structure,
    summary: `${formality}、${directness}、${structure}、${lengthPref}型表达`,
  };
}

function analyzeValues(notes, signals) {
  const text = notes.map(n => n.raw_text).join(' ');

  const valueIndicators = {
    family: { keywords: [/家庭|家人|老婆|孩子|父母/], weight: 0 },
    career: { keywords: [/工作|事业|职业|发展|晋升|成就/], weight: 0 },
    health: { keywords: [/健康|运动|睡眠|休息|身体/], weight: 0 },
    financial: { keywords: [/钱|收入|投资|理财|财务/], weight: 0 },
    growth: { keywords: [/学习|成长|提升|进步|改变/], weight: 0 },
    relationships: { keywords: [/朋友|社交|人脉|关系|沟通/], weight: 0 },
    freedom: { keywords: [/自由|自主|选择|掌控/], weight: 0 },
    impact: { keywords: [/影响|价值|意义|贡献/], weight: 0 },
  };

  for (const [key, config] of Object.entries(valueIndicators)) {
    for (const kw of config.keywords) {
      const matches = text.match(kw);
      if (matches) config.weight += matches.length;
    }
  }

  const sorted = Object.entries(valueIndicators)
    .filter(([, v]) => v.weight > 0)
    .sort((a, b) => b[1].weight - a[1].weight)
    .slice(0, 5)
    .map(([key]) => key);

  return {
    top_values: sorted.length > 0 ? sorted : ['未检测到明显倾向'],
    detected_weights: Object.fromEntries(
      Object.entries(valueIndicators).map(([k, v]) => [k, v.weight])
    ),
  };
}

function analyzeDecisionPattern(decisions, commitments) {
  const patterns = {
    quick: { keywords: [/决定|果断|马上|立刻/], count: 0 },
    deliberate: { keywords: [/考虑|思考|分析|评估|计划/], count: 0 },
    cautious: { keywords: [/担心|顾虑|风险|万一|不确定/], count: 0 },
    optimistic: { keywords: [/相信|应该可以|没问题|肯定/], count: 0 },
    pessimistic: { keywords: [/可能不行|估计难|不确定|万一/], count: 0 },
  };

  for (const d of decisions) {
    const text = d.signal || '';
    for (const [key, config] of Object.entries(patterns)) {
      for (const kw of config.keywords) {
        if (kw.test(text)) config.count++;
      }
    }
  }

  const sorted = Object.entries(patterns)
    .filter(([, v]) => v.count > 0)
    .sort((a, b) => b[1].count - a[1].count);

  const style = sorted.length > 0 ? sorted[0][0] : 'balanced';

  const styleLabels = {
    quick: '快速果断型',
    deliberate: '深思熟虑型',
    cautious: '谨慎保守型',
    optimistic: '乐观进取型',
    pessimistic: '悲观防御型',
    balanced: '平衡综合型',
  };

  return {
    primary_style: styleLabels[style] || '未知',
    styles_detected: sorted.map(([k]) => k),
    commitments_made: commitments.length,
    commitments_fulfilled: commitments.filter(c => c.resolved).length,
    reliability_score: commitments.length > 0
      ? Math.round(commitments.filter(c => c.resolved).length / commitments.length * 100)
      : 0,
  };
}

function analyzeStressResponse(notes) {
  const stressNotes = notes.filter(n => {
    const stressKeywords = /焦虑|压力|烦躁|崩溃|累|疲惫|紧张|担心|害怕/;
    return stressKeywords.test(n.raw_text);
  });

  const responses = {
    action: { keywords: [/去跑|健身|游泳|打球|运动/], label: '行动宣泄', count: 0 },
    avoidance: { keywords: [/刷手机|看剧|打游戏|睡觉|躺/], label: '逃避放松', count: 0 },
    social: { keywords: [/找人|聊天|打电话|倾诉|朋友/], label: '社交倾诉', count: 0 },
    reflection: { keywords: [/想想|思考|分析|为什么/], label: '自我反思', count: 0 },
    suppression: { keywords: [/忍着|算了|没事|还好/], label: '压抑控制', count: 0 },
  };

  for (const note of stressNotes) {
    const text = note.raw_text;
    for (const [, config] of Object.entries(responses)) {
      for (const kw of config.keywords) {
        if (kw.test(text)) config.count++;
      }
    }
  }

  const sorted = Object.entries(responses)
    .filter(([, v]) => v.count > 0)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 2);

  return {
    primary_response: sorted.length > 0 ? sorted[0][1].label : '未确定',
    secondary_response: sorted.length > 1 ? sorted[1][1].label : null,
    stress_episodes: stressNotes.length,
  };
}

function analyzeRelationshipPattern(signals) {
  if (signals.length === 0) {
    return { primary_style: '数据不足', trust_building: '未知' };
  }

  let positive = 0;
  let negative = 0;

  for (const s of signals) {
    if (s.signal && s.signal.includes('积极')) positive++;
    if (s.signal && s.signal.includes('消极')) negative++;
  }

  const ratio = positive + negative > 0 ? positive / (positive + negative) : 0.5;

  const trustBuilding = ratio > 0.7 ? '快速信任型'
    : ratio > 0.4 ? '谨慎验证型'
    : '慢热观察型';

  const conflictStyle = negative > positive * 0.5 ? '直面解决型'
    : negative > 0 ? '柔和回避型'
    : '跟随配合型';

  return {
    primary_style: trustBuilding,
    conflict_style: conflictStyle,
    positive_ratio: Math.round(ratio * 100),
    signals_analyzed: signals.length,
  };
}

function extractTraits(signals) {
  const traitCounts = {};
  for (const s of signals) {
    if (s.signal) {
      const traits = s.signal.match(/[A-Za-z0-9_]+/g) || [];
      for (const t of traits) {
        traitCounts[t] = (traitCounts[t] || 0) + 1;
      }
    }
  }

  return Object.entries(traitCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([trait]) => trait);
}

function extractRecentContext(notes) {
  if (notes.length === 0) return '暂无近期数据';

  const domains = { work: 0, life: 0, health: 0, social: 0, growth: 0 };
  for (const note of notes.slice(0, 50)) {
    const text = note.raw_text || '';
    if (/工作|项目|开会|老板|客户/.test(text)) domains.work++;
    if (/吃饭|睡觉|家里|日常/.test(text)) domains.life++;
    if (/运动|健康|累|休息/.test(text)) domains.health++;
    if (/朋友|家人|老婆|孩子|父母/.test(text)) domains.social++;
    if (/学习|读书|成长|提升/.test(text)) domains.growth++;
  }

  const top = Object.entries(domains).sort((a, b) => b[1] - a[1])[0];
  return top[1] > 0 ? `近期主要关注：${top[0]}` : '近期关注较均衡';
}

// ─── 消息起草 ─────────────────────────────────────────────

function draftMessage(scenario) {
  const profile = buildProfile();
  const style = profile.communication_style;

  // 解析场景
  const recipient = extractRecipient(scenario);
  const tone = extractTone(scenario);
  const goal = extractGoal(scenario);

  // 根据沟通风格调整
  let prefix = '';
  let suffix = '';
  let structure = '';

  if (style.formality === '正式') {
    prefix = '您好，';
    suffix = '祝好';
  } else if (style.formality === '随性') {
    prefix = '';
    suffix = '';
  } else {
    prefix = 'hi，';
    suffix = '';
  }

  if (style.structure_preference === '结构化') {
    structure = '第一、第二、第三';
  }

  // 生成草稿框架
  const templates = {
    appreciation: {
      formal: `尊敬的${recipient}：

首先感谢您${goal}。

${structure ? '第一，' : ''}关于您提到的${goal}，我认为非常及时且必要。
${structure ? '第二，' : ''}针对这一情况，我的建议是：
${structure ? '第三，' : ''}如有任何问题，请随时联系我。

${suffix}`,
      casual: `${prefix}感谢你${goal}～

我觉得${goal}挺好的。我的想法是……

有什么需要我做的随时说！${suffix}`,
    },
    request: {
      formal: `${recipient}您好：

关于${goal}，有以下几点需要您的支持：

1. ${goal}的具体要求
2. 时间节点
3. 资源需求

盼复。`,
      casual: `${prefix}有个事情想请你帮忙：${goal}

具体是……

你看这样行不？`,
    },
    feedback: {
      formal: `${recipient}，

关于${goal}，经过评估，我的看法如下：

优点：
1. ${goal}做得好的方面

建议：
2. 可进一步优化的地方

总体评价：${goal}达到预期。`,
      casual: `${prefix}关于${goal}，说说我的想法：

👍 做得好的地方：……

💡 可以更好的地方：……

总体来说我觉得……${suffix}`,
    },
    apology: {
      formal: `${recipient}：

对于${goal}造成的不便，我深感抱歉。

经过反思，问题出在：
1. ${goal}的根本原因
2. 我应该采取的措施

今后我将${goal}避免类似情况发生。恳请您的谅解。`,
      casual: `${prefix}抱歉${goal}，是我的问题。

我反思了一下，主要是因为……

下次我会注意的。${suffix}`,
    },
  };

  const type = detectMessageType(scenario);
  const template = templates[type] || templates.appreciation;

  return {
    scenario,
    recommended_type: type,
    profile_used: profile.communication_style.summary,
    draft: template[style.formality === '正式' ? 'formal' : 'casual'],
    alternatives: Object.keys(templates).filter(t => t !== type).map(t => ({
      type: t,
      draft: templates[t][style.formality === '正式' ? 'formal' : 'casual'],
    })),
  };
}

function extractRecipient(scenario) {
  const patterns = [
    /给([^\s]{2,5})(?:さん|总|先生|女士|姐|哥)?/,
    /(?:找|跟|和|对)([^\s]{2,5})(?:说|聊|讲|沟通|谈)/,
    /致([^\s]{2,5})/,
  ];

  for (const p of patterns) {
    const m = scenario.match(p);
    if (m) return m[1];
  }

  return '对方';
}

function extractTone(scenario) {
  if (/紧急|急|马上|立刻/.test(scenario)) return 'urgent';
  if (/感谢|谢谢|感激/.test(scenario)) return 'grateful';
  if (/道歉|抱歉|对不起/.test(scenario)) return 'apologetic';
  return 'neutral';
}

function extractGoal(scenario) {
  const text = scenario.replace(/给|跟|对|找|说|聊|沟通|谈|的信息|的话/g, ' ');
  const words = text.split(/\s+/).filter(w => w.length > 2).slice(-5);
  return words.join(' ');
}

function detectMessageType(scenario) {
  if (/感谢|谢谢|感激/.test(scenario)) return 'appreciation';
  if (/道歉|抱歉|对不起/.test(scenario)) return 'apology';
  if (/请求|帮忙|帮助|需要支持/.test(scenario)) return 'request';
  if (/反馈|意见|建议|看法|评价/.test(scenario)) return 'feedback';
  return 'appreciation';
}

// ─── 模拟反应 ─────────────────────────────────────────────

function simulateReaction(situation) {
  const profile = buildProfile();

  const reactions = [];

  // 根据性格预测反应
  const { decision_pattern, stress_response, relationship_pattern } = profile;

  // 决策风格相关
  if (decision_pattern.primary_style.includes('快速')) {
    reactions.push({
      type: 'decision_speed',
      likely: '快速做出决定',
      advice: '建议先冷静30秒再回复，避免冲动决策',
    });
  } else if (decision_pattern.primary_style.includes('深思')) {
    reactions.push({
      type: 'decision_speed',
      likely: '需要时间思考',
      advice: '对方会想要更多信息来辅助决策',
    });
  }

  // 压力反应
  if (stress_response.primary_response === '行动宣泄') {
    reactions.push({
      type: 'under_stress',
      likely: '通过行动来缓解压力',
      advice: '可以约运动或具体活动来缓解',
    });
  } else if (stress_response.primary_response === '社交倾诉') {
    reactions.push({
      type: 'under_stress',
      likely: '需要找人倾诉',
      advice: '耐心倾听比给建议更有效',
    });
  }

  // 关系风格
  if (relationship_pattern.conflict_style === '直面解决型') {
    reactions.push({
      type: 'in_conflict',
      likely: '倾向于直接沟通解决',
      advice: '有矛盾时建议当面说清楚',
    });
  } else if (relationship_pattern.conflict_style === '柔和回避型') {
    reactions.push({
      type: 'in_conflict',
      likely: '可能会暂时回避冲突',
      advice: '给一些空间再沟通会更有效',
    });
  }

  // 价值观相关
  const { top_values } = profile.values;
  if (top_values.includes('family')) {
    reactions.push({
      type: 'value_based',
      likely: '家庭因素会影响决策',
      advice: '涉及家庭的事情需要特别考虑',
    });
  }
  if (top_values.includes('career')) {
    reactions.push({
      type: 'value_based',
      likely: '职业发展是重要考量',
      advice: '工作相关决策会相对理性',
    });
  }

  return {
    situation,
    profile_summary: profile.communication_style.summary,
    predicted_reactions: reactions,
    communication_advice: generateAdvice(reactions),
  };
}

function generateAdvice(reactions) {
  const advices = reactions.map(r => r.advice);
  if (advices.length === 0) return '数据不足，无法提供具体建议';

  return advices.join('；') + '。';
}

// ─── 角色设定输出 ─────────────────────────────────────────

function outputPersona() {
  const profile = buildProfile();

  return `# ${getName()} 的数字分身

## 沟通风格
${profile.communication_style.summary}
- 长度偏好：${profile.communication_style.length_preference}
- 直接程度：${profile.communication_style.directness}
- 情感表达：${profile.communication_style.emotional_expression}
- 正式程度：${profile.communication_style.formality}
- 结构偏好：${profile.communication_style.structure_preference}

## 价值观排序
${profile.values.top_values.join(' > ')}

## 决策模式
${profile.decision_pattern.primary_style}
- 承诺可信度：${profile.decision_pattern.reliability_score}%

## 压力应对
主要方式：${profile.stress_response.primary_response}
次要方式：${profile.stress_response.secondary_response || '未确定'}

## 人际关系
建立信任方式：${profile.relationship_pattern.primary_style}
冲突处理方式：${profile.relationship_pattern.conflict_style}

## 近期状态
${profile.recent_context}

## 性格标签
${profile.personality_traits.join(', ') || '数据不足'}

---
*档案生成时间：${profile.generated_at}*
*数据来源：capture-me v2.0*
`;
}

// ─── 工具函数 ─────────────────────────────────────────────

function getName() {
  // 尝试从环境或配置获取名字
  return '风知'; // fallback
}

const C = { reset: '\x1b[0m', bright: '\x1b[1m', dim: '\x1b[2m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[36m', red: '\x1b[31m', cyan: '\x1b[96m' };

function log(color, ...args) {
  console.log(`${color}${args.join(' ')}${C.reset}`);
}

// ─── CLI ─────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === 'help') {
    log(C.cyan, '╔══════════════════════════════════════════════════╗');
    log(C.cyan, '║  🎭 数字分身 v1.0 — digital-twin               ║');
    log(C.cyan, '╚══════════════════════════════════════════════════╝');
    console.log(`
${C.green}用法:${C.reset}
  node digital-twin.js profile     # 查看分身档案
  node digital-twin.js persona    # 输出角色设定（Markdown）
  node digital-twin.js draft "场景描述"  # 生成消息草稿
  node digital-twin.js simulate "情境"   # 模拟反应预测

${C.green}示例:${C.reset}
  node digital-twin.js profile
  node digital-twin.js draft "给老板写一封感谢邮件"
  node digital-twin.js simulate "老婆因为加班生气"
`);
    return;
  }

  if (cmd === 'profile') {
    const profile = buildProfile();
    console.log('\n' + C.cyan + '🎭 数字分身档案' + C.reset);
    console.log(C.dim + '═'.repeat(50) + C.reset);
    console.log(`${C.yellow}沟通风格：${C.reset}${profile.communication_style.summary}`);
    console.log(`${C.yellow}价值观：${C.reset}${profile.values.top_values.join(' > ')}`);
    console.log(`${C.yellow}决策模式：${C.reset}${profile.decision_pattern.primary_style}`);
    console.log(`${C.yellow}压力应对：${C.reset}${profile.stress_response.primary_response}`);
    console.log(`${C.yellow}关系风格：${C.reset}${profile.relationship_pattern.primary_style}`);
    console.log(`${C.dim}${'═'.repeat(50)}${C.reset}`);
    console.log(`${C.dim}近期：${profile.recent_context}${C.reset}`);
    return;
  }

  if (cmd === 'persona') {
    console.log(outputPersona());
    return;
  }

  if (cmd === 'draft') {
    const scenario = args.slice(1).join(' ');
    if (!scenario) {
      log(C.red, '请提供场景描述');
      return;
    }
    const result = draftMessage(scenario);
    console.log('\n' + C.cyan + '📝 消息草稿' + C.reset);
    console.log(C.dim + `场景：${scenario}` + C.reset);
    console.log(C.dim + `推荐类型：${result.recommended_type} | 风格：${result.profile_used}` + C.reset);
    console.log(C.yellow + '\n主推草稿：\n' + C.reset);
    console.log(result.draft);
    if (result.alternatives.length > 0) {
      console.log(C.dim + '\n备选方案：' + C.reset);
      for (const alt of result.alternatives) {
        console.log(`\n[${alt.type}]`);
        console.log(alt.draft);
      }
    }
    return;
  }

  if (cmd === 'simulate') {
    const situation = args.slice(1).join(' ');
    if (!situation) {
      log(C.red, '请提供情境描述');
      return;
    }
    const result = simulateReaction(situation);
    console.log('\n' + C.cyan + '🔮 反应预测' + C.reset);
    console.log(C.dim + `情境：${situation}` + C.reset);
    console.log(C.dim + `沟通风格：${result.profile_summary}` + C.reset);
    console.log(C.yellow + '\n可能的反应：' + C.reset);
    for (const r of result.predicted_reactions) {
      console.log(`  · ${C.bright}${r.likely}${C.reset}`);
      console.log(`    ${C.dim}建议：${r.advice}${C.reset}`);
    }
    return;
  }

  log(C.red, `未知命令: ${cmd}`);
  log(C.dim, '用 digital-twin.js help 查看用法');
}

if (require.main === module) {
  main();
}

module.exports = {
  buildProfile,
  draftMessage,
  simulateReaction,
  outputPersona,
};
