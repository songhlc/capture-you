#!/usr/bin/env node
/**
 * multi-mirror.js — 多面镜子 v1.0
 *
 * 超越单一视角的认知镜子矩阵
 * 6个镜子视角：
 *   1. 承诺镜子（contradiction）— 言行追踪
 *   2. 成长镜子（growth）— 变化回顾
 *   3. 关系镜子（relation）— 人际动态
 *   4. 习惯镜子（habit）— 重复行为
 *   5. 情绪镜子（emotion）— 波动曲线
 *   6. 目标镜子（goal）— 进度追踪
 *
 * 用法:
 *   node multi-mirror.js [mirror] [--days N] [--json]
 *   node multi-mirror.js all
 *   node multi-mirror.js growth --days 30
 */

const path = require('path');
const SKILL_DIR = path.join(__dirname, '..');
const Database = require(path.join(SKILL_DIR, 'node_modules', 'better-sqlite3'));

const DB_PATH = path.join(SKILL_DIR, 'sqlite', 'capture.db');
const LOG_DIR = path.join(SKILL_DIR, 'logs');

const fs = require('fs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

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

// ─── 镜子1: 承诺镜子 ───────────────────────────────────────

function mirror_contradiction(days = 14) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];

  // 获取未解决承诺
  const commitments = query(`
    SELECT * FROM commitments
    WHERE resolved = 0 AND date(created_at) >= ?
    ORDER BY created_at DESC
  `, [sinceStr]);

  // 获取矛盾模式出现次数
  const CONTRADICTION_PATTERNS = [
    /没跑成|没做到|没去|没完成|又没|忘记|耽误了|太忙|来不及/,
    /还是没|仍然没|依然没/,
  ];

  // 扫描近期记录找矛盾
  const recentNotes = query(`
    SELECT * FROM notes
    WHERE date >= ?
    ORDER BY date DESC, time DESC
    LIMIT 50
  `, [sinceStr]);

  const results = [];
  for (const c of commitments) {
    let contradictions = 0;
    let fulfilled = false;
    const behavior = c.target_behavior || '';

    for (const note of recentNotes) {
      if (note.id === c.source_note_id) continue;
      const text = note.raw_text || '';

      for (const p of CONTRADICTION_PATTERNS) {
        if (p.test(text) && (behavior.length < 3 || text.includes(behavior))) {
          contradictions++;
        }
      }

      if (/做到了?|完成了|去跑了|去健身了|达标了/.test(text) &&
          (behavior.length < 3 || text.includes(behavior))) {
        fulfilled = true;
      }
    }

    results.push({
      ...c,
      contradictions,
      fulfilled,
      gap_count: contradictions,
    });
  }

  const unfulfilled = results.filter(r => !r.fulfilled);
  const fulfilledList = results.filter(r => r.fulfilled);

  return {
    mirror: 'contradiction',
    period: `${sinceStr} ~ today`,
    summary: {
      total: commitments.length,
      fulfilled: fulfilledList.length,
      unfulfilled: unfulfilled.length,
      concern_rate: commitments.length > 0
        ? Math.round(unfulfilled.length / commitments.length * 100)
        : 0,
    },
    unfulfilled_promises: unfulfilled.map(r => ({
      text: r.commitment_text,
      created: r.created_at,
      gap_count: r.gap_count,
      alert: r.gap_count >= 3 ? '⚠️ 连续未兑现' : null,
    })),
    fulfilled_promises: fulfilledList.map(r => ({
      text: r.commitment_text,
      created: r.created_at,
    })),
  };
}

// ─── 镜子2: 成长镜子 ───────────────────────────────────────

function mirror_growth(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];

  const notes = query(`
    SELECT * FROM notes
    WHERE date >= ?
    ORDER BY date ASC
  `, [sinceStr]);

  if (notes.length === 0) {
    return { mirror: 'growth', period: `${sinceStr}~today`, summary: { total: 0 }, insights: [] };
  }

  // 自我认知信号
  const SELF_REFLECTION = [
    /我发现我|我意识到|我一直|我其实|我的问题是|我发现/,
    /我应该|我不应该|我本应该/,
    /我像是在|我好像在|我是不是在/,
  ];

  // 变化信号（比较句）
  const CHANGE_PATTERNS = [
    /比之前|比以前|比上周|相比|提升了|进步了|改善了/,
    /不如|退步了|下降了|恶化了/,
  ];

  // 学习信号
  const LEARNING_PATTERNS = [
    /学了|学会了|理解了|掌握了|新知|学到/,
    /读完了|看完了|听完了/,
  ];

  const insights = [];
  let reflectionCount = 0;
  let positiveChangeCount = 0;
  let negativeChangeCount = 0;
  let learningCount = 0;

  for (const note of notes) {
    const text = note.raw_text || '';

    for (const p of SELF_REFLECTION) {
      if (p.test(text)) { reflectionCount++; break; }
    }
    for (const p of LEARNING_PATTERNS) {
      if (p.test(text)) { learningCount++; break; }
    }
    for (const p of CHANGE_PATTERNS) {
      if (p.test(text)) {
        if (/不如|退步了|下降了|恶化了/.test(p.source)) negativeChangeCount++;
        else positiveChangeCount++;
        break;
      }
    }
  }

  // 生成洞察
  if (reflectionCount > 0) {
    insights.push({
      type: 'self_awareness',
      text: `期间有 ${reflectionCount} 次自我反思记录，说明你在主动审视自己`,
      weight: Math.min(reflectionCount * 2, 10),
    });
  }
  if (learningCount > 0) {
    insights.push({
      type: 'learning',
      text: `有 ${learningCount} 条学习/成长相关记录`,
      weight: Math.min(learningCount * 1.5, 8),
    });
  }
  if (positiveChangeCount > negativeChangeCount) {
    insights.push({
      type: 'positive_trend',
      text: `成长趋势正向（${positiveChangeCount} vs ${negativeChangeCount}）`,
      weight: 7,
    });
  } else if (negativeChangeCount > 0) {
    insights.push({
      type: 'concern',
      text: `有 ${negativeChangeCount} 条消极变化描述，需要关注`,
      weight: 5,
    });
  }

  // 按月/周分组看趋势
  const byWeek = {};
  for (const note of notes) {
    const d = new Date(note.date);
    const week = getWeekNumber(d);
    const key = `${d.getFullYear()}-W${week}`;
    byWeek[key] = (byWeek[key] || 0) + 1;
  }

  return {
    mirror: 'growth',
    period: `${sinceStr} ~ today`,
    summary: {
      total_notes: notes.length,
      reflections: reflectionCount,
      learning: learningCount,
      positive_changes: positiveChangeCount,
      negative_changes: negativeChangeCount,
    },
    weekly_trend: byWeek,
    insights,
  };
}

// ─── 镜子3: 关系镜子 ───────────────────────────────────────

function mirror_relation(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];

  const notes = query(`
    SELECT * FROM notes WHERE date >= ? ORDER BY date DESC
  `, [sinceStr]);

  if (notes.length === 0) {
    return { mirror: 'relation', period: `${sinceStr}~today`, summary: { total: 0 }, relations: [] };
  }

  const RELATION_TYPES = {
    spouse: { patterns: [/老婆|老公|妻子|丈夫|伴侣|爱人|那口子/], label: '配偶' },
    child: { patterns: [/女儿|儿子|孩子|小孩|宝宝|宝贝/], label: '子女' },
    parent: { patterns: [/妈妈|妈|爸爸|爸|老妈|老爸|婆婆|公公|岳父|岳母/], label: '父母' },
    sibling: { patterns: [/哥哥|弟弟|姐姐|妹妹|兄弟姐妹/], label: '兄弟姐妹' },
    colleague: { patterns: [/同事|领导|老板|上司|下属|张总|李总|王总|赵总|刘总|陈总|总/], label: '同事/领导' },
    friend: { patterns: [/朋友|闺蜜|哥们|兄弟|姐妹|死党|发小|同学/], label: '朋友' },
  };

  const RELATION_CONTEXTS = {
    positive: [/惊喜|浪漫|开心|快乐|幸福|和好|和解|感谢|支持|鼓励/],
    negative: [/吵架|矛盾|冷战|争执|不满|失望|伤心|难过|生气|抱怨/],
    neutral: [/日常|一起|吃饭|聊天|通话|视频/],
  };

  const relations = {};

  for (const note of notes) {
    const text = note.raw_text || '';

    for (const [type, config] of Object.entries(RELATION_TYPES)) {
      for (const p of config.patterns) {
        if (p.test(text)) {
          if (!relations[type]) {
            relations[type] = { label: config.label, mentions: 0, contexts: { positive: 0, negative: 0, neutral: 0 }, episodes: [] };
          }
          relations[type].mentions++;

          for (const [ctx, patterns] of Object.entries(RELATION_CONTEXTS)) {
            for (const cp of patterns) {
              if (cp.test(text)) {
                relations[type].contexts[ctx]++;
                break;
              }
            }
          }

          // 记录episode（片段）
          if (RELATION_CONTEXTS.positive.some(cp => cp.test(text)) ||
              RELATION_CONTEXTS.negative.some(cp => cp.test(text))) {
            relations[type].episodes.push({
              date: note.date,
              snippet: text.slice(0, 80),
              context: RELATION_CONTEXTS.positive.some(cp => cp.test(text)) ? 'positive' : 'negative',
            });
          }
          break;
        }
      }
    }
  }

  // 计算关系健康度
  const healthScores = {};
  for (const [type, data] of Object.entries(relations)) {
    const total = data.contexts.positive + data.contexts.negative + data.contexts.neutral;
    if (total === 0) {
      healthScores[type] = { score: 5, label: '未知' };
    } else {
      const ratio = data.contexts.positive / total;
      const score = Math.round(ratio * 10);
      const label = score >= 7 ? '健康' : score >= 4 ? '一般' : '需关注';
      healthScores[type] = { score, label };
    }
  }

  return {
    mirror: 'relation',
    period: `${sinceStr} ~ today`,
    summary: {
      total_notes: notes.length,
      relation_types_mentioned: Object.keys(relations).length,
    },
    relations: Object.entries(relations).map(([type, data]) => ({
      type,
      label: data.label,
      mentions: data.mentions,
      ...data.contexts,
      health: healthScores[type],
      recent_episodes: data.episodes.slice(-3),
    })),
  };
}

// ─── 镜子4: 习惯镜子 ───────────────────────────────────────

function mirror_habit(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];

  const notes = query(`
    SELECT * FROM notes WHERE date >= ? ORDER BY date ASC
  `, [sinceStr]);

  if (notes.length === 0) {
    return { mirror: 'habit', period: `${sinceStr}~today`, habits: [], summary: { total: 0 } };
  }

  const HABIT_PATTERNS = {
    exercise: {
      patterns: [/跑步|健身|瑜伽|游泳|打球|骑行|爬山|运动/],
      label: '运动',
      positive: ['跑了','健身了','运动了','练了'],
      negative: ['没跑成','没健身','没运动'],
    },
    early_rise: {
      patterns: [/早起|早起了|6点起|7点起|5点起/],
      label: '早起',
      positive: ['早起了'],
      negative: ['熬夜','失眠','睡不着'],
    },
    reading: {
      patterns: [/读书|看书|阅读|听书|樊登/],
      label: '阅读',
      positive: ['读了','看完了','听完了'],
      negative: [],
    },
    water: {
      patterns: [/喝水|饮水量|水杯|8杯水/],
      label: '饮水',
      positive: ['喝了水'],
      negative: ['忘了喝水'],
    },
    stretch: {
      patterns: [/拉伸|伸展|站起|站立|休息/],
      label: '拉伸/休息',
      positive: ['拉伸了','站起来了','休息了'],
      negative: ['一直坐着','没起来'],
    },
    sleep_early: {
      patterns: [/早睡|10点睡|11点睡|睡得早/],
      label: '早睡',
      positive: ['早睡了'],
      negative: ['熬夜','1点','2点','3点'],
    },
  };

  const habitStats = {};

  for (const note of notes) {
    const text = note.raw_text || '';
    const date = note.date;

    for (const [habitKey, config] of Object.entries(HABIT_PATTERNS)) {
      if (!habitStats[habitKey]) {
        habitStats[habitKey] = {
          label: config.label,
          positive_days: new Set(),
          negative_days: new Set(),
          mention_days: new Set(),
          total_mentions: 0,
        };
      }

      const stats = habitStats[habitKey];

      // 检查是否有该习惯的记录
      const hasPattern = config.patterns.some(p => p.test(text));
      if (hasPattern) {
        stats.mention_days.add(date);
        stats.total_mentions++;

        // 检查正负
        const hasPositive = config.positive.some(kw => text.includes(kw));
        const hasNegative = config.negative.some(kw => text.includes(kw));

        if (hasPositive) stats.positive_days.add(date);
        if (hasNegative) stats.negative_days.add(date);
      }
    }
  }

  const habits = Object.entries(habitStats).map(([key, stats]) => {
    const mentionDays = stats.mention_days.size;
    const positiveDays = stats.positive_days.size;
    const negativeDays = stats.negative_days.size;
    const coverage = Math.round(mentionDays / days * 100);
    const consistency = Math.round(positiveDays / Math.max(mentionDays, 1) * 100);

    return {
      habit: key,
      label: stats.label,
      mention_days: mentionDays,
      coverage,
      consistency,
      positive_days: positiveDays,
      negative_days: negativeDays,
      total_mentions: stats.total_mentions,
      status: consistency >= 70 ? '养成中' : consistency >= 40 ? '努力中' : '待培养',
    };
  });

  habits.sort((a, b) => b.consistency - a.consistency);

  return {
    mirror: 'habit',
    period: `${sinceStr} ~ today`,
    summary: {
      tracked_habits: habits.length,
      well_formed: habits.filter(h => h.consistency >= 70).length,
      struggling: habits.filter(h => h.consistency < 40).length,
    },
    habits,
  };
}

// ─── 镜子5: 情绪镜子 ───────────────────────────────────────

function mirror_emotion(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];

  const signals = query(`
    SELECT * FROM profile_signals
    WHERE dimension = 'emotion' AND date(created_at) >= ?
    ORDER BY created_at ASC
  `, [sinceStr]);

  const EMOTION_MAP = {
    positive: '积极',
    negative: '消极',
    neutral: '中性',
  };

  // 按天聚合
  const byDay = {};
  for (const s of signals) {
    const day = s.created_at.split('T')[0];
    if (!byDay[day]) byDay[day] = { positive: 0, negative: 0, neutral: 0, intensities: [] };
    if (s.signal) {
      if (s.signal.includes('积极')) byDay[day].positive++;
      else if (s.signal.includes('消极')) byDay[day].negative++;
      else byDay[day].neutral++;
    }
    // 从detail解析intensity
    if (s.detail) {
      try {
        const d = JSON.parse(s.detail);
        if (d.intensity) byDay[day].intensities.push(d.intensity);
      } catch (e) {}
    }
  }

  // 计算趋势
  const days_arr = Object.keys(byDay).sort();
  const emotionTrend = days_arr.map(day => {
    const data = byDay[day];
    const avgIntensity = data.intensities.length > 0
      ? Math.round(data.intensities.reduce((a, b) => a + b, 0) / data.intensities.length)
      : 0;
    return {
      day,
      ...data,
      avg_intensity: avgIntensity,
      dominant: data.positive >= data.negative + data.neutral ? 'positive'
               : data.negative >= data.positive + data.neutral ? 'negative' : 'neutral',
    };
  });

  // 总体统计
  const totals = { positive: 0, negative: 0, neutral: 0 };
  for (const day of days_arr) {
    totals.positive += byDay[day].positive;
    totals.negative += byDay[day].negative;
    totals.neutral += byDay[day].neutral;
  }
  const total = totals.positive + totals.negative + totals.neutral;

  // 找出极端日期
  let most_negative_day = null;
  let most_positive_day = null;
  let min_neg = Infinity, max_pos = -Infinity;

  for (const [day, data] of Object.entries(byDay)) {
    if (data.negative > min_neg) { min_neg = data.negative; most_negative_day = day; }
    if (data.positive > max_pos) { max_pos = data.positive; most_positive_day = day; }
  }

  return {
    mirror: 'emotion',
    period: `${sinceStr} ~ today`,
    summary: {
      total_emotion_records: total,
      positive_days: totals.positive,
      negative_days: totals.negative,
      neutral_days: totals.neutral,
      positive_ratio: total > 0 ? Math.round(totals.positive / total * 100) : 0,
      negative_ratio: total > 0 ? Math.round(totals.negative / total * 100) : 0,
    },
    emotion_trend: emotionTrend.slice(-14), // 最近14天
    notable_days: {
      most_positive: most_positive_day ? { day: most_positive_day, score: max_pos } : null,
      most_negative: most_negative_day ? { day: most_negative_day, score: min_neg } : null,
    },
  };
}

// ─── 镜子6: 目标镜子 ───────────────────────────────────────

function mirror_goal(days = 90) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];

  const notes = query(`
    SELECT * FROM notes WHERE date >= ? ORDER BY date DESC
  `, [sinceStr]);

  const signals = query(`
    SELECT * FROM profile_signals
    WHERE dimension = 'goal' AND date(created_at) >= ?
    ORDER BY created_at DESC
  `, [sinceStr]);

  // 解析目标信号
  const goals = [];
  for (const s of signals) {
    if (s.detail) {
      try {
        const detail = JSON.parse(s.detail);
        if (Array.isArray(detail)) {
          for (const g of detail) {
            goals.push({
              text: typeof g === 'string' ? g : g.content || g.text || '',
              date: s.created_at.split('T')[0],
              confidence: s.confidence,
            });
          }
        }
      } catch (e) {}
    }
    if (!s.detail && s.signal) {
      const match = s.signal.match(/目标声明[：:]\s*(.+)/);
      if (match) {
        goals.push({ text: match[1], date: s.created_at.split('T')[0], confidence: s.confidence });
      }
    }
  }

  // 去重
  const uniqueGoals = [];
  const seen = new Set();
  for (const g of goals) {
    const key = g.text.slice(0, 20);
    if (!seen.has(key) && g.text.length > 3) {
      seen.add(key);
      uniqueGoals.push(g);
    }
  }

  // 估算进度（简单逻辑：检查目标关键词是否在近期记录中出现）
  const goalProgress = uniqueGoals.map(goal => {
    let mentions = 0;
    let positiveMentions = 0;
    for (const note of notes) {
      const text = note.raw_text || '';
      if (text.includes(goal.text.slice(0, 10))) {
        mentions++;
        if (/完成了|做到了|进展|推进|进度/.test(text)) positiveMentions++;
      }
    }
    return {
      ...goal,
      mentions,
      positive_mentions: positiveMentions,
      estimated_progress: Math.min(Math.round(positiveMentions / Math.max(mentions, 1) * 100), 100),
      status: mentions === 0 ? '未跟进' : positiveMentions > 0 ? '有进展' : '提及但无进展',
    };
  });

  return {
    mirror: 'goal',
    period: `${sinceStr} ~ today`,
    summary: {
      total_goals_declared: uniqueGoals.length,
      with_progress: goalProgress.filter(g => g.status === '有进展').length,
      stalled: goalProgress.filter(g => g.status === '未跟进').length,
      abandoned: goalProgress.filter(g => g.status === '提及但无进展').length,
    },
    goals: goalProgress.slice(0, 10),
  };
}

// ─── 全量镜子 ──────────────────────────────────────────────

function all_mirrors(days = 14) {
  return {
    contradiction: mirror_contradiction(days),
    growth: mirror_growth(days * 2),
    relation: mirror_relation(days * 2),
    habit: mirror_habit(days * 2),
    emotion: mirror_emotion(days * 2),
    goal: mirror_goal(days * 6),
  };
}

// ─── 工具函数 ─────────────────────────────────────────────

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// ─── 格式化输出 ────────────────────────────────────────────

const C = { reset: '\x1b[0m', bright: '\x1b[1m', dim: '\x1b[2m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[36m', red: '\x1b[31m', cyan: '\x1b[96m' };

function log(color, ...args) {
  console.log(`${color}${args.join(' ')}${C.reset}`);
}

function formatMirror(mirrorName, data) {
  const f = {
    contradiction: () => {
      const { summary, unfulfilled_promises } = data;
      const lines = [
        '',
        `${C.cyan}🪞 承诺镜子（言行追踪）${C.reset}`,
        `${C.dim}${data.period}${C.reset}`,
        `${C.yellow}概览：${summary.total}个承诺 | ${summary.fulfilled}已兑现 | ${summary.unfulfilled}未兑现 | 背离率${summary.concern_rate}%${C.reset}`,
        '',
      ];
      if (unfulfilled_promises.length > 0) {
        lines.push(`${C.red}⚠️ 未兑现承诺：${C.reset}`);
        for (const p of unfulfilled_promises.slice(0, 5)) {
          lines.push(`  · ${p.text.slice(0, 50)} ${C.dim}[创建于${p.created.split('T')[0]}]${C.reset} ${p.alert || ''}`);
        }
      } else {
        lines.push(`${C.green}✅ 所有承诺均已兑现或无新增承诺${C.reset}`);
      }
      return lines.join('\n');
    },

    growth: () => {
      const { summary, insights } = data;
      const lines = [
        '',
        `${C.cyan}🪞 成长镜子（变化回顾）${C.reset}`,
        `${C.dim}${data.period}${C.reset}`,
        `${C.yellow}概览：${summary.total_notes}条记录 | ${summary.reflections}次反思 | ${summary.learning}条学习${C.reset}`,
        '',
      ];
      if (insights.length > 0) {
        lines.push(`${C.green}洞察：${C.reset}`);
        for (const i of insights) {
          lines.push(`  · ${i.text} ${C.dim}[${C.reset}${i.weight >= 7 ? C.green : i.weight >= 4 ? C.yellow : C.red}${i.weight}${C.reset}${C.dim}]${C.reset}`);
        }
      }
      return lines.join('\n');
    },

    relation: () => {
      const { relations } = data;
      const lines = [
        '',
        `${C.cyan}🪞 关系镜子（人际动态）${C.reset}`,
        `${C.dim}${data.period}${C.reset}`,
        `${C.yellow}概览：提及${data.summary.relation_types_mentioned}种关系类型${C.reset}`,
        '',
      ];
      for (const r of relations.slice(0, 5)) {
        const health = r.health;
        const healthColor = health.score >= 7 ? C.green : health.score >= 4 ? C.yellow : C.red;
        lines.push(`${C.bright}${r.label}${C.reset} ${healthColor}健康度${health.score}/10(${health.label})${C.reset}`);
        lines.push(`  ${C.dim}提及${r.mentions}次 | 积极${r.positive} | 消极${r.negative}${C.reset}`);
        if (r.recent_episodes.length > 0) {
          lines.push(`  ${C.dim}最近：${r.recent_episodes[r.recent_episodes.length - 1]?.snippet?.slice(0, 40)}...${C.reset}`);
        }
      }
      return lines.join('\n');
    },

    habit: () => {
      const { habits, summary } = data;
      const lines = [
        '',
        `${C.cyan}🪞 习惯镜子（重复行为）${C.reset}`,
        `${C.dim}${data.period}${C.reset}`,
        `${C.yellow}概览：追踪${summary.tracked_habits}个习惯 | ${summary.well_formed}养成中 | ${summary.struggling}待培养${C.reset}`,
        '',
      ];
      for (const h of habits.slice(0, 6)) {
        const statusColor = h.status === '养成中' ? C.green : h.status === '努力中' ? C.yellow : C.red;
        lines.push(`${C.bright}${h.label}${C.reset} ${statusColor}${h.status}${C.reset} ${C.dim}频率${h.coverage}% | 一致性${h.consistency}%${C.reset}`);
      }
      return lines.join('\n');
    },

    emotion: () => {
      const { summary, emotion_trend } = data;
      const lines = [
        '',
        `${C.cyan}🪞 情绪镜子（情感波动）${C.reset}`,
        `${C.dim}${data.period}${C.reset}`,
        `${C.yellow}概览：积极${summary.positive_ratio}% | 消极${summary.negative_ratio}%${C.reset}`,
        '',
      ];
      // 简单情绪曲线
      if (emotion_trend.length > 0) {
        lines.push(`${C.dim}最近情绪曲线（积极/消极/中性）：${C.reset}`);
        const last7 = emotion_trend.slice(-7);
        const curve = last7.map(d => {
          if (d.positive > d.negative) return `${C.green}↑${C.reset}`;
          if (d.negative > d.positive) return `${C.red}↓${C.reset}`;
          return `${C.dim}－${C.reset}`;
        }).join(' ');
        lines.push(`  ${curve}`);
      }
      return lines.join('\n');
    },

    goal: () => {
      const { goals, summary } = data;
      const lines = [
        '',
        `${C.cyan}🪞 目标镜子（进度追踪）${C.reset}`,
        `${C.dim}${data.period}${C.reset}`,
        `${C.yellow}概览：声明${summary.total_goals_declared}个目标 | ${summary.with_progress}有进展 | ${summary.stalled}未跟进${C.reset}`,
        '',
      ];
      for (const g of goals.slice(0, 5)) {
        const statusColor = g.status === '有进展' ? C.green : g.status === '未跟进' ? C.red : C.yellow;
        lines.push(`${statusColor}[${g.status}]${C.reset} ${g.text.slice(0, 40)}`);
        lines.push(`  ${C.dim}提及${g.mentions}次 | 进展${g.positive_mentions}次 | 估算进度${g.estimated_progress}%${C.reset}`);
      }
      return lines.join('\n');
    },
  };

  const formatter = f[mirrorName];
  return formatter ? formatter() : JSON.stringify(data, null, 2);
}

// ─── CLI ─────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  let mirrorName = args[0] || 'all';
  let days = 14;
  let json = false;

  const mirrors = ['contradiction', 'growth', 'relation', 'habit', 'emotion', 'goal'];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days' && args[i + 1]) {
      days = parseInt(args[i + 1]);
      args.splice(i, 2);
      i--;
    }
    if (args[i] === '--json') {
      json = true;
      args.splice(i, 1);
      i--;
    }
  }

  mirrorName = args[0] || 'all';

  log(C.cyan, '╔══════════════════════════════════════════════════╗');
  log(C.cyan, '║  🪞 多面镜子 v1.0 — 认知镜子矩阵                ║');
  log(C.cyan, '╚══════════════════════════════════════════════════╝');

  if (mirrorName === 'all') {
    const data = all_mirrors(days);
    if (json) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      for (const m of mirrors) {
        console.log(formatMirror(m, data[m]));
      }
    }
  } else if (mirrorName === 'help') {
    console.log(`
${C.green}用法:${C.reset}
  node multi-mirror.js [mirror] [--days N] [--json]
  node multi-mirror.js all                  # 所有镜子
  node multi-mirror.js contradiction        # 承诺追踪
  node multi-mirror.js growth               # 成长回顾
  node multi-mirror.js relation             # 关系动态
  node multi-mirror.js habit                # 习惯养成
  node multi-mirror.js emotion              # 情绪波动
  node multi-mirror.js goal                 # 目标进度

${C.green}示例:${C.reset}
  node multi-mirror.js all --json
  node multi-mirror.js emotion --days 7
  node multi-mirror.js habit --days 30
`);
  } else if (mirrors.includes(mirrorName)) {
    const fn = eval(`mirror_${mirrorName}`);
    const data = fn(days);
    if (json) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(formatMirror(mirrorName, data));
    }
  } else {
    log(C.red, `未知镜子: ${mirrorName}`);
    log(C.dim, `可用: ${mirrors.join(', ')}, all`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  mirror_contradiction,
  mirror_growth,
  mirror_relation,
  mirror_habit,
  mirror_emotion,
  mirror_goal,
  all_mirrors,
};
