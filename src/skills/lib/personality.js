#!/usr/bin/env node
/**
 * personality.js — 大五人格评分 + MBTI 映射
 * 
 * 基于记录数据和 profile_signals 计算大五维度得分
 */

const Database = require('better-sqlite3');
const path = require('path');
const SKILL_DIR = path.join(__dirname, '..');

const DB_PATH = path.join(SKILL_DIR, 'sqlite', 'capture.db');

// ─── 大五关键词库 ────────────────────────────────────────

const OCEAN_KEYWORDS = {
  // 开放性 Openness
  openness: {
    high: ['好奇', '新事物', '创新', '创意', '想象', '审美', '艺术', '设计', '有趣', '探索', '尝试', '学新', '研究', '思考'],
    low: ['传统', '务实', '保守', '稳定', '按部就班', '常规', '惯例', '熟悉就好', '不喜欢变'],
  },
  // 尽责性 Conscientiousness
  conscientiousness: {
    high: ['计划', '目标', '自律', '完成', '坚持', '组织', '系统', '效率', '有条理', '规划', '准时', '守时', '认真', '负责'],
    low: ['随性', '灵活', '随遇而安', '拖延', '迟到', '忘记', '散漫', '懒得'],
  },
  // 外向性 Extraversion
  extraversion: {
    high: ['社交', '聚会', '聊天', '朋友多', '热闹', '活力', '能量', '外向', '开朗', '健谈', '主动联系'],
    low: ['独处', '安静', '内向', '一个人', '沉默', '慢热', '需要充电', '人多的地方累'],
  },
  // 宜人性 Agreeableness
  agreeableness: {
    high: ['合作', '配合', '信任', '帮助', '支持', '理解', '包容', '让步', '和谐', '避免冲突', '随和'],
    low: ['质疑', '挑战', '反驳', '怀疑', '不信任', '批评', '挑剔', '竞争', '对抗'],
  },
  // 神经质 Neuroticism
  neuroticism: {
    high: ['焦虑', '担心', '担忧', '压力', '紧张', '不安', '敏感', '情绪波动', '失眠', '胡思乱想'],
    low: ['平静', '稳定', '淡定', '沉稳', '抗压', '平和', '冷静', '放松'],
  },
};

// ─── SDT 动机关键词 ───────────────────────────────────

const SDT_KEYWORDS = {
  autonomy: {  // 自主感
    high: ['我自己决定', '我的选择', '我想要', '我决定', '自主', '自由', '掌控', '说了算', '不受控制'],
    low: ['被迫', '不得不', '没办法', '被逼', '身不由己', '别人让我', '安排好了'],
  },
  competence: {  // 胜任感
    high: ['完成', '做到', '成功', '擅长', '有能力', '搞定', '胜任', '进步', '成长', '学会了', '突破了'],
    low: ['做不到', '不会', '失败', '不行', '没能力', '搞砸', '搞不定', '受挫'],
  },
  relatedness: {  // 归属感
    high: ['家人', '朋友', '亲密', '陪伴', '归属', '连接', '温暖', '支持', '依靠', '在一起'],
    low: ['孤独', '疏远', '隔离', '没人理解', '独自', '孤单', '失落'],
  },
};

// ─── 评分计算 ─────────────────────────────────────────

function analyzeBigFive(signals, notes) {
  const scores = {
    openness: 50,
    conscientiousness: 50,
    extraversion: 50,
    agreeableness: 50,
    neuroticism: 50,
  };

  const weights = { signals: 0.6, notes: 0.4 };
  const evidence = { signals: {}, notes: {} };

  // 从 signals 计算
  for (const signal of signals) {
    const dim = signal.dimension;
    const text = signal.signal || '';

    // emotion -> neuroticism
    if (dim === 'emotion') {
      if (OCEAN_KEYWORDS.neuroticism.high.some(k => text.includes(k))) {
        scores.neuroticism += 5 * signal.confidence;
        evidence.signals.neuroticism = (evidence.signals.neuroticism || 0) + 1;
      }
      if (OCEAN_KEYWORDS.neuroticism.low.some(k => text.includes(k))) {
        scores.neuroticism -= 5 * signal.confidence;
      }
    }

    // habit -> conscientiousness
    if (dim === 'habit') {
      if (OCEAN_KEYWORDS.conscientiousness.high.some(k => text.includes(k))) {
        scores.conscientiousness += 5 * signal.confidence;
        evidence.signals.conscientiousness = (evidence.signals.conscientiousness || 0) + 1;
      }
    }

    // goal -> conscientiousness
    if (dim === 'goal') {
      scores.conscientiousness += 3 * signal.confidence;
      evidence.signals.conscientiousness = (evidence.signals.conscientiousness || 0) + 1;
    }

    // preference -> openness
    if (dim === 'preference') {
      if (OCEAN_KEYWORDS.openness.high.some(k => text.includes(k))) {
        scores.openness += 5 * signal.confidence;
        evidence.signals.openness = (evidence.signals.openness || 0) + 1;
      }
    }
  }

  // 从 notes 计算
  for (const note of notes) {
    const text = (note.ai_summary || '') + ' ' + (note.raw_text || '');

    for (const [trait, kws] of Object.entries(OCEAN_KEYWORDS)) {
      const highMatches = kws.high.filter(k => text.includes(k)).length;
      const lowMatches = kws.low.filter(k => text.includes(k)).length;
      
      scores[trait] += highMatches * 2 * weights.notes;
      scores[trait] -= lowMatches * 2 * weights.notes;
    }
  }

  // 归一化到 0-100
  for (const trait of Object.keys(scores)) {
    scores[trait] = Math.max(0, Math.min(100, Math.round(scores[trait])));
  }

  return { scores, evidence };
}

// ─── SDT 动机分析 ────────────────────────────────────

function analyzeSDT(signals, notes) {
  const scores = { autonomy: 50, competence: 50, relatedness: 50 };

  for (const signal of signals) {
    const text = signal.signal || '';
    
    for (const [need, kws] of Object.entries(SDT_KEYWORDS)) {
      if (kws.high.some(k => text.includes(k))) {
        scores[need] += 8 * signal.confidence;
      }
      if (kws.low.some(k => text.includes(k))) {
        scores[need] -= 8 * signal.confidence;
      }
    }
  }

  for (const note of notes) {
    const text = (note.ai_summary || '') + ' ' + (note.raw_text || '');
    
    for (const [need, kws] of Object.entries(SDT_KEYWORDS)) {
      scores[need] += kws.high.filter(k => text.includes(k)).length * 2;
      scores[need] -= kws.low.filter(k => text.includes(k)).length * 2;
    }
  }

  for (const need of Object.keys(scores)) {
    scores[need] = Math.max(0, Math.min(100, Math.round(scores[need])));
  }

  return scores;
}

// ─── MBTI 映射 ──────────────────────────────────────

function bigFiveToMBTI(scores) {
  const result = {
    EI: scores.extraversion > 60 ? 'E' : scores.extraversion < 40 ? 'I' : 'X',
    NS: scores.openness > 60 ? 'N' : scores.openness < 40 ? 'S' : 'X',
    TF: scores.agreeableness > 60 ? 'F' : scores.agreeableness < 40 ? 'T' : 'X',
    JP: scores.conscientiousness > 60 ? 'J' : scores.conscientiousness < 40 ? 'P' : 'X',
    AT: scores.neuroticism > 60 ? 'T' : scores.neuroticism < 40 ? 'A' : 'X',
  };

  const type = result.EI + result.NS + result.TF + result.JP;
  const variant = result.AT === 'T' ? '-T' : '-A';

  return { type: type + variant, ...result };
}

// ─── 获取数据 ──────────────────────────────────────

function getData(days = 90) {
  const db = new Database(DB_PATH, { readonly: true });

  const since = new Date();
  since.setDate(since.getDate() - days);

  const signals = db.prepare(`
    SELECT dimension, signal, confidence 
    FROM profile_signals 
    WHERE created_at >= ?
  `).all(since.toISOString());

  const notes = db.prepare(`
    SELECT ai_summary, raw_text 
    FROM notes 
    WHERE date >= ?
  `).all(since.toISOString().split('T')[0]);

  db.close();
  return { signals, notes };
}

// ─── 主函数 ───────────────────────────────────────

function analyze() {
  const { signals, notes } = getData();

  if (signals.length < 5 && notes.length < 10) {
    return {
      ready: false,
      message: '数据不足，需要更多记录才能生成准确画像',
      signalsCount: signals.length,
      notesCount: notes.length,
    };
  }

  const bigFive = analyzeBigFive(signals, notes);
  const sdt = analyzeSDT(signals, notes);
  const mbti = bigFiveToMBTI(bigFive.scores);

  return {
    ready: true,
    bigFive: bigFive.scores,
    sdt,
    mbti,
    evidence: bigFive.evidence,
    confidence: Math.min(1, (signals.length + notes.length) / 100),
  };
}

// ─── 输出格式化 ──────────────────────────────────────

function formatScore(score, max = 100) {
  const barLen = Math.round(score / 10);
  const bar = '█'.repeat(barLen) + '░'.repeat(10 - barLen);
  return { score, bar };
}

function formatOutput(result) {
  if (!result.ready) {
    return `
⚠️ 数据不足，无法生成完整画像

当前数据：
- 信号数：${result.signalsCount}（需要 5+）
- 记录数：${result.notesCount}（需要 10+）

建议：继续使用 capture-me 记录更多内容
`;
  }

  const { bigFive, sdt, mbti, confidence } = result;

  const lines = [];
  lines.push('🧩 MBTI 类型');
  lines.push(`   ${mbti.type}  (置信度: ${Math.round(confidence * 100)}%)`);
  lines.push('');

  const traits = [
    { key: 'openness', label: '开放性', high: '好奇、创新', low: '务实、传统' },
    { key: 'conscientiousness', label: '尽责性', high: '自律、有序', low: '随性、灵活' },
    { key: 'extraversion', label: '外向性', high: '外向、社交', low: '内向、独处' },
    { key: 'agreeableness', label: '宜人性', high: '信任、合作', low: '质疑、竞争' },
    { key: 'neuroticism', label: '情绪稳定性', high: '敏感、情绪波动', low: '沉稳、抗压' },
  ];

  const mbtiLabels = {
    EI: { E: '外向', I: '内向' },
    NS: { N: '直觉', S: '感知' },
    TF: { T: '思考', F: '情感' },
    JP: { J: '判断', P: '知觉' },
    AT: { A: '稳定', T: '波动' },
  };

  lines.push('📊 大五人格维度');
  for (const t of traits) {
    const s = formatScore(bigFive[t.key]);
    const dim = mbti[t.key.slice(0, 2)] || 'X';
    const dimLabel = mbtiLabels[t.key.slice(0, 2)]?.[dim] || '';
    lines.push(`   ${t.label.padEnd(10)} ${s.bar} ${String(s.score).padStart(3)} ${dimLabel}`);
  }
  lines.push('');

  lines.push('🎯 SDT 动机分析');
  const sdtLabels = {
    autonomy: '自主感',
    competence: '胜任感',
    relatedness: '归属感',
  };
  for (const [key, label] of Object.entries(sdtLabels)) {
    const s = formatScore(sdt[key]);
    lines.push(`   ${label.padEnd(10)} ${s.bar} ${String(s.score).padStart(3)}`);
  }
  lines.push('');

  lines.push('💡 解读提示');
  lines.push('   (基于数据推断，仅供参考)');

  return lines.join('\n');
}

// ─── CLI ────────────────────────────────────────────

if (require.main === module) {
  const result = analyze();
  console.log(formatOutput(result));
}

module.exports = {
  analyze,
  analyzeBigFive,
  analyzeSDT,
  bigFiveToMBTI,
  formatOutput,
  getData,
};
