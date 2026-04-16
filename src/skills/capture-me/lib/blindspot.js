#!/usr/bin/env node
/**
 * blindspot.js — 盲区探测引擎
 * 
 * 发现用户自己没意识到但数据里存在的模式
 */

const Database = require('better-sqlite3');
const path = require('path');
const SKILL_DIR = path.join(__dirname, '..');

const DB_PATH = path.join(SKILL_DIR, 'sqlite', 'capture.db');

// ─── 盲区类型定义 ──────────────────────────────────────

const BLIND_SPOT_TYPES = {
  'frequency_anomaly': {
    name: '频率异常',
    description: '某行为突然变化但用户未提及',
  },
  'emotion_behavior_gap': {
    name: '言行情绪反差',
    description: '记录情绪"平静"但后续有冲动行为',
  },
  'assumption_break': {
    name: '因果断层',
    description: 'A事件后总伴随B行为但用户未建立连接',
  },
  'promise_decay': {
    name: '承诺衰减',
    description: '说了要改变但每次触发条件都一样',
  },
};

// ─── 承诺衰减检测 ───────────────────────────────────

function detectPromiseDecay() {
  const db = new Database(DB_PATH, { readonly: true });

  // 获取未解决的承诺
  const commitments = db.prepare(`
    SELECT * FROM commitments 
    WHERE resolved = 0 
    ORDER BY created_at DESC
    LIMIT 20
  `).all();

  db.close();

  if (commitments.length < 3) return [];

  const results = [];
  const patterns = {};

  for (const c of commitments) {
    // 提取关键词（简化：取前两个字）
    const key = c.target_behavior ? c.target_behavior.slice(0, 4) : c.commitment_text.slice(0, 4);
    
    if (!patterns[key]) {
      patterns[key] = [];
    }
    patterns[key].push(c);
  }

  // 找出发承诺模式但一直未解决
  for (const [key, items] of Object.entries(patterns)) {
    if (items.length >= 3) {
      const latest = items[0];
      const first = items[items.length - 1];
      const times = items.length;
      
      // 检查每次触发的原因是否类似
      const reasons = items.map(i => {
        const text = i.commitment_text;
        if (/太忙|没时间/.test(text)) return '太忙';
        if (/累了|疲惫/.test(text)) return '疲惫';
        if (/下次|以后/.test(text)) return '推迟';
        return '其他';
      });

      const uniqueReasons = [...new Set(reasons)];
      if (uniqueReasons.length === 1 && uniqueReasons[0] !== '其他') {
        results.push({
          type: 'promise_decay',
          pattern_type: 'promise_decay',
          description: `承诺"${key}..."连续${times}次因"${uniqueReasons[0]}"未能兑现`,
          evidence: items.map(i => i.commitment_text),
          first_detected: first.created_at,
          occurrences: times,
        });
      }
    }
  }

  return results;
}

// ─── 情绪-行为反差检测 ──────────────────────────────

function detectEmotionBehaviorGap() {
  const db = new Database(DB_PATH, { readonly: true });

  // 获取最近 30 天的记录
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const notes = db.prepare(`
    SELECT * FROM notes 
    WHERE date >= ?
    ORDER BY date ASC, time ASC
  `).all(since.toISOString().split('T')[0]);

  db.close();

  if (notes.length < 10) return [];

  const results = [];
  const EMOTION_POSITIVE = ['平静', '平静', '还好', '正常', '淡定'];
  const EMOTION_NEGATIVE = ['焦虑', '担心', '压力', '愤怒', '烦躁'];
  const IMPULSIVE_KEYWORDS = ['冲动', '忍不住', '马上下单', '马上去做', '立刻'];

  for (let i = 0; i < notes.length - 1; i++) {
    const current = notes[i];
    const next = notes[i + 1];
    const currentText = (current.ai_summary || '') + ' ' + (current.raw_text || '');
    const nextText = (next.ai_summary || '') + ' ' + (next.raw_text || '');

    // 检查当前情绪平静但下一条有冲动行为
    const currentPositive = EMOTION_POSITIVE.some(k => currentText.includes(k));
    const nextImpulsive = IMPULSIVE_KEYWORDS.some(k => nextText.includes(k));

    if (currentPositive && nextImpulsive) {
      results.push({
        type: 'emotion_behavior_gap',
        pattern_type: 'emotion-behavior-gap',
        description: `情绪平稳时记录"${current.raw_text.slice(0, 15)}..."但随后出现冲动行为`,
        evidence: [current.raw_text, next.raw_text],
        first_detected: current.date,
        occurrences: 1,
      });
    }

    // 检查负面情绪后的行为
    const currentNegative = EMOTION_NEGATIVE.some(k => currentText.includes(k));
    const nextNegative = EMOTION_NEGATIVE.some(k => nextText.includes(k));

    if (currentNegative && nextNegative) {
      // 连续两次负面情绪
      const timeDiff = new Date(next.date + 'T' + next.time) - new Date(current.date + 'T' + current.time);
      if (timeDiff < 3 * 24 * 60 * 60 * 1000) { // 3天内
        results.push({
          type: 'emotion_behavior_gap',
          pattern_type: 'emotion-behavior-gap',
          description: `连续出现负面情绪（间隔${Math.round(timeDiff/(24*60*60*1000))}天），可能是持续压力未释放`,
          evidence: [current.raw_text, next.raw_text],
          first_detected: current.date,
          occurrences: 1,
        });
      }
    }
  }

  return results;
}

// ─── 频率异常检测 ──────────────────────────────────

function detectFrequencyAnomaly() {
  const db = new Database(DB_PATH, { readonly: true });

  // 获取行为关键词的出现频率
  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);
  const since7 = new Date();
  since7.setDate(since7.getDate() - 7);
  const since14 = new Date();
  since14.setDate(since14.getDate() - 14);

  const notes30 = db.prepare(`SELECT * FROM notes WHERE date >= ?`).all(since30.toISOString().split('T')[0]);
  const notes7 = db.prepare(`SELECT * FROM notes WHERE date >= ?`).all(since7.toISOString().split('T')[0]);
  const notes14 = db.prepare(`SELECT * FROM notes WHERE date >= ?`).all(since14.toISOString().split('T')[0]);

  db.close();

  if (notes30.length < 15 || notes7.length < 3) return [];

  // 检测最近 7 天频率突然变化的行为
  const BEHAVIOR_KEYWORDS = ['运动', '跑步', '健身', '读书', '学习', '早睡', '熬夜', '外卖', '购物', '查股价'];

  const results = [];

  for (const kw of BEHAVIOR_KEYWORDS) {
    const count30 = notes30.filter(n => n.raw_text.includes(kw)).length;
    const count7 = notes7.filter(n => n.raw_text.includes(kw)).length;
    const count14 = notes14.filter(n => n.raw_text.includes(kw)).length;

    if (count30 === 0) continue;

    const avgPerWeek = count30 / 4;
    const recentRate = count7;

    // 突然增加或减少超过 50%
    if (avgPerWeek > 0 && (recentRate < avgPerWeek * 0.5 || recentRate > avgPerWeek * 2)) {
      const direction = recentRate < avgPerWeek * 0.5 ? '减少' : '增加';
      results.push({
        type: 'frequency_anomaly',
        pattern_type: 'frequency-anomaly',
        description: `"${kw}"行为${direction}：周均${avgPerWeek.toFixed(1)}次 → 近7天${recentRate}次`,
        evidence: notes7.filter(n => n.raw_text.includes(kw)).map(n => n.raw_text.slice(0, 30)),
        first_detected: new Date().toISOString(),
        occurrences: count7,
      });
    }
  }

  return results;
}

// ─── 综合检测 ──────────────────────────────────────

function detectAll() {
  const allResults = [];

  const promiseDecay = detectPromiseDecay();
  allResults.push(...promiseDecay);

  const emotionGap = detectEmotionBehaviorGap();
  allResults.push(...emotionGap);

  const freqAnomaly = detectFrequencyAnomaly();
  allResults.push(...freqAnomaly);

  return allResults;
}

// ─── 存储检测结果 ─────────────────────────────────

function saveBlindspots(blindspots) {
  const db = new Database(DB_PATH);

  for (const bs of blindspots) {
    // 检查是否已存在类似盲区
    const existing = db.prepare(`
      SELECT * FROM blindspots 
      WHERE pattern_type = ? AND notified = 0
    `).all(bs.pattern_type);

    const isDuplicate = existing.some(e => 
      e.description.includes(bs.description.slice(0, 20))
    );

    if (!isDuplicate) {
      const id = `blindspot-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      db.prepare(`
        INSERT INTO blindspots (id, pattern_type, description, evidence, first_detected, occurrences, notified)
        VALUES (?, ?, ?, ?, ?, ?, 0)
      `).run(id, bs.pattern_type, bs.description, JSON.stringify(bs.evidence), bs.first_detected, bs.occurrences || 1);
    }
  }

  db.close();
}

// ─── 获取未通知的盲区 ─────────────────────────────

function getNewBlindspots() {
  const db = new Database(DB_PATH, { readonly: true });
  const results = db.prepare(`
    SELECT * FROM blindspots 
    WHERE notified = 0 
    ORDER BY first_detected DESC
    LIMIT 5
  `).all();
  db.close();
  return results;
}

// ─── 标记为已通知 ─────────────────────────────────

function markNotified(ids) {
  const db = new Database(DB_PATH);
  for (const id of ids) {
    db.prepare(`UPDATE blindspots SET notified = 1 WHERE id = ?`).run(id);
  }
  db.close();
}

// ─── CLI 入口 ────────────────────────────────────

const colors = {
  blue: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
};

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === 'detect') {
    console.log(`${colors.blue}🔍 盲区扫描中...${colors.reset}\n`);
    
    const results = detectAll();
    
    if (results.length === 0) {
      console.log(`${colors.green}✓ 未发现新的盲区${colors.reset}`);
      return;
    }

    console.log(`${colors.yellow}发现 ${results.length} 个潜在盲区：${colors.reset}\n`);
    
    for (let i = 0; i < results.length; i++) {
      const bs = results[i];
      const typeName = BLIND_SPOT_TYPES[bs.pattern_type]?.name || bs.pattern_type;
      console.log(`${i + 1}. ${colors.red}[${typeName}]${colors.reset}`);
      console.log(`   ${bs.description}`);
      if (bs.evidence && bs.evidence.length > 0) {
        console.log(`   证据: ${bs.evidence[0].slice(0, 50)}...`);
      }
      console.log('');
    }

    // 保存
    saveBlindspots(results);
    console.log(`${colors.green}✓ 已保存到数据库${colors.reset}`);
    return;
  }

  if (cmd === 'list') {
    const blindspots = getNewBlindspots();
    
    if (blindspots.length === 0) {
      console.log(`${colors.green}✓ 暂无未处理的盲区${colors.reset}`);
      return;
    }

    console.log(`${colors.blue}📋 未处理的盲区 (${blindspots.length})${colors.reset}\n`);
    
    for (let i = 0; i < blindspots.length; i++) {
      const bs = blindspots[i];
      const typeName = BLIND_SPOT_TYPES[bs.pattern_type]?.name || bs.pattern_type;
      console.log(`${i + 1}. ${colors.yellow}[${typeName}]${colors.reset}`);
      console.log(`   ${bs.description}`);
      console.log(`   发现时间: ${bs.first_detected}`);
      console.log('');
    }
    return;
  }

  if (cmd === 'dismiss') {
    const ids = args.slice(1);
    if (ids.length === 0) {
      console.log('用法: blindspot.js dismiss <id1> <id2> ...');
      return;
    }
    markNotified(ids);
    console.log(`${colors.green}✓ 已关闭 ${ids.length} 个盲区${colors.reset}`);
    return;
  }

  // 默认：检测 + 列表
  console.log(`${colors.blue}🔍 盲区探测引擎${colors.reset}\n`);
  console.log('用法:');
  console.log('  node blindspot.js detect   # 检测并保存');
  console.log('  node blindspot.js list     # 查看未处理');
  console.log('  node blindspot.js dismiss <ids>  # 关闭');
}

if (require.main === module) {
  main();
}

module.exports = {
  detectPromiseDecay,
  detectEmotionBehaviorGap,
  detectFrequencyAnomaly,
  detectAll,
  saveBlindspots,
  getNewBlindspots,
  markNotified,
  BLIND_SPOT_TYPES,
};
