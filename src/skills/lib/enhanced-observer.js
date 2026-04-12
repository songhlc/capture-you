/**
 * capture-me 2.0 增强版观察器
 *
 * 在原有 pattern matching 基础上升级：
 * 1. 决策信号提取
 * 2. 情绪强度分析
 * 3. 关系动态追踪
 * 4. 自我认知信号
 * 5. 目标追踪
 *
 * 用法：
 *   const enhanced = require('./enhanced-observer');
 *   const signals = enhanced.analyzeEnhanced(text, source);
 */

const path = require('path');
const fs = require('fs');

// ─── 路径配置 ─────────────────────────────────────────────

const CAPTURE_ME_DIR = path.join(process.env.HOME, '.claude', 'skills', 'capture-me');
const DB_PATH = path.join(CAPTURE_ME_DIR, 'sqlite', 'capture.db');
const LOG_DIR = path.join(CAPTURE_ME_DIR, 'logs');
const QUEUE_DIR = path.join(CAPTURE_ME_DIR, 'queue');

[LOG_DIR, QUEUE_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ─── 日志 ─────────────────────────────────────────────────

const LOG_FILE = path.join(LOG_DIR, `enhanced-observer-${new Date().toISOString().split('T')[0]}.log`);

function log(level, msg, data) {
  const entry = { time: new Date().toISOString(), level, msg, ...(data && { data }) };
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  if (level === 'ERROR') console.error(`[ENHANCED ERROR] ${msg}`, data ? `(${JSON.stringify(data)})` : '');
}

// ─── 增强型信号提取规则 ─────────────────────────────────────

const EMOTION_INTENSITY = {
  // 强度 1-3（轻微）
  low: [/有点|些许|稍微|一点|略|有一丝|几分/],
  // 强度 4-6（中等）
  medium: [/比较|挺|蛮|相当|比较|真是|挺|太/],
  // 强度 7-10（强烈）
  high: [/非常|极其|极度|超级|简直|完全|彻底|太|太|非常/],
};

const EMOTION_VALENCE = {
  positive: [/开心|高兴|兴奋|满足|愉快|轻松|不错|顺利|成功|突破|成就感|爽|棒|美好|幸福|欣慰|庆幸/],
  negative: [/焦虑|担心|担忧|不安|紧张|压力|累|疲惫|困|郁闷|烦躁|沮丧|失落|失望|伤心|难过|崩溃|绝望|恐惧|害怕|愤怒|生气|讨厌|恶心|厌恶|痛苦/],
  neutral: [/平静|淡定|冷静|平常|一般|无所谓/],
};

// 决策信号模式
const DECISION_PATTERNS = [
  // 明确决定
  { pattern: /我决定|我决定了|已经决定|决定要|决定了/, type: 'decided', weight: 0.9 },
  { pattern: /我打算|我打算|打算要|打算去/, type: 'plan', weight: 0.7 },
  { pattern: /我想|我要|我想着|我想着要|我想去/, type: 'intention', weight: 0.6 },
  // 犹豫不决
  { pattern: /要不要|要不要|该不该|是不是要/, type: 'hesitating', weight: 0.4 },
  { pattern: /算了|算了不|算了就|还是算了/, type: 'giveup', weight: 0.3 },
  // 已行动
  { pattern: /已经|已完成|做好了|搞定了|落实了/, type: 'action_taken', weight: 0.95 },
];

// 自我认知信号
const SELF_REFLECTION_PATTERNS = [
  /我发现我|我意识到我|我才发现|我一直|我其实|我的问题是|我发现我自己/,
  /我又在|我又犯了|我改不掉|我总是|我一直都/,
  /我应该|我不应该|我本应该|我不应该/,
  /我像是在|我好像在|我是不是在/,
];

// 关系动态信号
const RELATION_DYNAMICS = {
  spouse: { patterns: [/老婆|老公|妻子|丈夫|伴侣|爱人|那口子/], context: ['吵架', '和好', '纪念日', '惊喜', '日常'] },
  child: { patterns: [/女儿|儿子|孩子|小孩|宝宝|宝贝|少爷|公主/], context: ['教育', '学习', '成长', '生病', '日常'] },
  parent: { patterns: [/妈妈|妈|爸爸|爸|父母|老妈|老爸|婆婆|公公|岳父|岳母/], context: ['照顾', '沟通', '担心', '日常'] },
  colleague: { patterns: [/同事|领导|老板|上司|下属|张总|李总|王总|赵总|刘总|陈总|总/], context: ['合作', '矛盾', '晋升', '工作'] },
  friend: { patterns: [/朋友|闺蜜|哥们|兄弟|姐妹|死党|发小|同学/], context: ['聚会', '倾诉', '矛盾', '日常'] },
};

// ─── 辅助函数 ─────────────────────────────────────────────

function matchAll(text, patterns) {
  const results = [];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) results.push({ pattern: p, match: m[0], index: m.index });
  }
  return results;
}

function extractContext(text, keywords, window = 30) {
  const contexts = [];
  for (const kw of keywords) {
    const idx = text.indexOf(kw);
    if (idx !== -1) {
      const start = Math.max(0, idx - window);
      const end = Math.min(text.length, idx + kw.length + window);
      contexts.push(text.slice(start, end));
    }
  }
  return contexts;
}

function calculateEmotionScore(text) {
  let intensity = 0;
  let valence = 'neutral';

  // 检测强度
  for (const level of ['low', 'medium', 'high']) {
    for (const p of EMOTION_INTENSITY[level]) {
      if (p.test(text)) {
        intensity = level === 'low' ? 3 : level === 'medium' ? 6 : 9;
        break;
      }
    }
    if (intensity > 0) break;
  }

  // 检测情绪极性
  if (EMOTION_VALENCE.positive.some(p => p.test(text))) valence = 'positive';
  else if (EMOTION_VALENCE.negative.some(p => p.test(text))) valence = 'negative';

  return { intensity, valence, score: intensity * (valence === 'positive' ? 1 : valence === 'negative' ? -1 : 0) };
}

function extractDecision(text) {
  const decisions = [];

  for (const dp of DECISION_PATTERNS) {
    if (dp.pattern.test(text)) {
      // 提取决策内容（简化版：取决策词后面30个字）
      const match = text.match(dp.pattern);
      if (match && match.index !== undefined) {
        const start = match.index + match[0].length;
        const content = text.slice(start, start + 50).trim();
        decisions.push({
          type: dp.type,
          content: content.replace(/[，。、！？；：""''（）]/g, '').slice(0, 30),
          weight: dp.weight,
        });
      }
    }
  }

  return decisions;
}

function extractRelationDynamics(text) {
  const dynamics = [];

  for (const [relType, config] of Object.entries(RELATION_DYNAMICS)) {
    for (const p of config.patterns) {
      if (p.test(text)) {
        // 检测关系动态词
        let context = '日常互动';
        for (const c of config.context) {
          if (text.includes(c)) {
            context = c;
            break;
          }
        }
        dynamics.push({
          relation: relType,
          context,
          mention: p.toString().replace(/[\/\[\]\\]/g, ''),
        });
        break;
      }
    }
  }

  return dynamics;
}

function detectSelfReflection(text) {
  for (const p of SELF_REFLECTION_PATTERNS) {
    if (p.test(text)) {
      // 提取反思内容
      const match = text.match(p);
      if (match && match.index !== undefined) {
        const start = Math.max(0, match.index - 10);
        const end = Math.min(text.length, match.index + match[0].length + 50);
        return {
          detected: true,
          context: text.slice(start, end).trim(),
        };
      }
    }
  }
  return { detected: false };
}

function extractGoalStatements(text) {
  const goals = [];

  // 目标声明
  const goalPatterns = [
    /我的目标是|我的目标是|目标是|目标是[^不]/g,
    /我打算|我计划|我计划着/g,
    /我要[^做不没]|我想[^做不没]/g,
    /以后要|未来要|这学期要|今年要/g,
  ];

  for (const gp of goalPatterns) {
    let match;
    const regex = new RegExp(gp.source, gp.flags);
    while ((match = regex.exec(text)) !== null) {
      const content = text.slice(match.index, match.index + 60).trim();
      goals.push({
        type: 'statement',
        content: content.replace(/[，。、！？；：""''（）]/g, '').slice(0, 40),
        text: match[0],
      });
    }
  }

  return goals;
}

// ─── 增强型信号提取主函数 ─────────────────────────────────

/**
 * 增强型文本分析
 * @param {string} text - 用户消息文本
 * @param {string} source - 来源标识
 * @returns {Object} - 包含多维度分析结果
 */
function analyzeEnhanced(text, source = 'openclaw') {
  if (!text || typeof text !== 'string' || text.trim().length < 3) {
    return { signals: [], meta: {} };
  }

  const signals = [];
  const meta = {
    textLength: text.length,
    timestamp: new Date().toISOString(),
    source,
  };

  // 1. 情绪分析
  const emotion = calculateEmotionScore(text);
  meta.emotion = emotion;
  if (emotion.intensity > 0) {
    signals.push({
      dimension: 'emotion',
      signal: `${emotion.valence === 'positive' ? '积极' : emotion.valence === 'negative' ? '消极' : '中性'}情绪${emotion.intensity >= 7 ? '（强烈）' : emotion.intensity >= 4 ? '（中等）' : '（轻微）'}`,
      detail: `valence:${emotion.valence},intensity:${emotion.intensity}`,
      confidence: 0.7 + (emotion.intensity / 10) * 0.3,
      source,
    });
  }

  // 2. 决策信号
  const decisions = extractDecision(text);
  if (decisions.length > 0) {
    meta.decisions = decisions;
    const topDecision = decisions.reduce((a, b) => a.weight > b.weight ? a : b);
    signals.push({
      dimension: 'decision',
      signal: `决策倾向：${topDecision.type === 'decided' ? '已决定' : topDecision.type === 'plan' ? '有计划' : topDecision.type === 'intention' ? '有意图' : topDecision.type === 'hesitating' ? '犹豫中' : topDecision.type === 'giveup' ? '放弃' : '已行动'}`,
      detail: JSON.stringify(decisions.map(d => ({ t: d.type, c: d.content }))),
      confidence: topDecision.weight,
      source,
    });
  }

  // 3. 关系动态
  const relations = extractRelationDynamics(text);
  if (relations.length > 0) {
    meta.relations = relations;
    const relSummary = relations.map(r => `${r.relation}(${r.context})`).join(',');
    signals.push({
      dimension: 'relation',
      signal: `关系动态：${relSummary}`,
      detail: JSON.stringify(relations),
      confidence: 0.7,
      source,
    });
  }

  // 4. 自我反思
  const reflection = detectSelfReflection(text);
  if (reflection.detected) {
    meta.selfReflection = reflection;
    signals.push({
      dimension: 'self_awareness',
      signal: '自我反思/认知信号',
      detail: reflection.context.slice(0, 100),
      confidence: 0.75,
      source,
    });
  }

  // 5. 目标声明
  const goals = extractGoalStatements(text);
  if (goals.length > 0) {
    meta.goals = goals;
    signals.push({
      dimension: 'goal',
      signal: `目标声明：${goals[0].content.slice(0, 30)}`,
      detail: JSON.stringify(goals.map(g => g.content.slice(0, 30))),
      confidence: 0.65,
      source,
    });
  }

  // 6. 工作/生活信号（保留原有逻辑但更精细）
  const workSignals = detectWorkSignal(text);
  if (workSignals) {
    signals.push(workSignals);
  }

  const lifeSignals = detectLifeSignal(text);
  if (lifeSignals) {
    signals.push(lifeSignals);
  }

  // 7. 健康/习惯信号
  const healthSignals = detectHealthHabitSignal(text);
  if (healthSignals) {
    signals.push(...healthSignals);
  }

  return { signals, meta };
}

function detectWorkSignal(text) {
  const workPatterns = [
    { patterns: [/开会|会议|讨论|评审|对齐/, /客户|甲方|乙方|需求|方案/], signal: '工作会议', weight: 0.8 },
    { patterns: [/项目|里程碑|交付|上线|发布/], signal: '项目进展', weight: 0.7 },
    { patterns: [/老板|上司|领导|汇报|述职/], signal: '职场关系/汇报', weight: 0.6 },
    { patterns: [/加班|下班晚|上班早|通勤/], signal: '工作时间长', weight: 0.5 },
    { patterns: [/辞职|跳槽|面试|offer|入职/], signal: '职业变动', weight: 0.9 },
  ];

  for (const wp of workPatterns) {
    const matches = wp.patterns.filter(p => p.test(text));
    if (matches.length >= (wp.patterns.length > 1 ? 1 : 1)) {
      return {
        dimension: 'work',
        signal: wp.signal,
        confidence: wp.weight,
        source: 'enhanced',
      };
    }
  }
  return null;
}

function detectLifeSignal(text) {
  const lifePatterns = [
    { patterns: [/吃饭|做饭|外卖|餐厅|下厨/], signal: '饮食生活', weight: 0.6 },
    { patterns: [/旅游|出行|度假|酒店|机票|火车/], signal: '出行/旅行', weight: 0.8 },
    { patterns: [/电影|音乐|展览|演出|娱乐/], signal: '娱乐生活', weight: 0.5 },
    { patterns: [/购物|买|网购|快递|代购/], signal: '消费购物', weight: 0.5 },
  ];

  for (const lp of lifePatterns) {
    if (lp.patterns.some(p => p.test(text))) {
      return {
        dimension: 'life',
        signal: lp.signal,
        confidence: lp.weight,
        source: 'enhanced',
      };
    }
  }
  return null;
}

function detectHealthHabitSignal(text) {
  const signals = [];

  // 健康信号
  const healthPatterns = [
    { patterns: [/头疼|头晕|感冒|发烧|咳嗽|流鼻涕|嗓子疼/], signal: '身体不适（轻微疾病）', weight: 0.7 },
    { patterns: [/很累|疲惫|困|没精神|不想动/], signal: '疲劳/低能量状态', weight: 0.6 },
    { patterns: [/运动|跑步|健身|瑜伽|游泳|打球/], signal: '运动活动', weight: 0.8 },
    { patterns: [/早睡|早起|早起了|睡得早/], signal: '作息习惯（积极）', weight: 0.7 },
    { patterns: [/熬夜|晚睡|失眠|睡不着/], signal: '作息习惯（消极）', weight: 0.6 },
  ];

  for (const hp of healthPatterns) {
    if (hp.patterns.some(p => p.test(text))) {
      signals.push({
        dimension: 'health',
        signal: hp.signal,
        confidence: hp.weight,
        source: 'enhanced',
      });
      break;
    }
  }

  return signals.length > 0 ? signals : null;
}

// ─── 数据库写入 ────────────────────────────────────────────

function writeSignals(signals, meta = {}) {
  if (!signals || signals.length === 0) return { success: true, count: 0 };

  let Database;
  try {
    Database = require(path.join(CAPTURE_ME_DIR, 'node_modules', 'better-sqlite3'));
  } catch (e) {
    log('ERROR', '无法加载 better-sqlite3', { error: e.message });
    return { success: false, error: 'DB not available' };
  }

  const db = new Database(DB_PATH);

  try {
    // 确保表存在（包含 enhanced_meta 字段）
    db.exec(`
      CREATE TABLE IF NOT EXISTS profile_signals (
        id TEXT PRIMARY KEY,
        dimension TEXT,
        signal TEXT,
        confidence REAL,
        source TEXT DEFAULT 'enhanced',
        conversation_id TEXT,
        detail TEXT,
        meta TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        last_reinforced TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_signals_dimension ON profile_signals(dimension);
      CREATE INDEX IF NOT EXISTS idx_signals_created ON profile_signals(created_at);
    `);

    const stmt = db.prepare(`
      INSERT INTO profile_signals (id, dimension, signal, confidence, source, conversation_id, detail, meta, created_at, last_reinforced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    const inserted = [];
    for (const s of signals) {
      if (!s.dimension || !s.signal) continue;
      const id = s.id || `sig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      stmt.run(
        id,
        s.dimension,
        s.signal,
        s.confidence || 0.5,
        s.source || 'enhanced',
        s.conversation_id || null,
        s.detail || null,
        s.meta ? JSON.stringify(s.meta) : null
      );
      inserted.push(id);
    }

    log('INFO', `增强观察写入成功: ${inserted.length} 条`, { meta: Object.keys(meta) });
    return { success: true, count: inserted.length, ids: inserted };
  } catch (err) {
    log('ERROR', '写入失败', { error: err.message });
    return { success: false, error: err.message };
  } finally {
    db.close();
  }
}

// ─── 异步写入 ─────────────────────────────────────────────

const { spawn } = require('child_process');

function writeSignalsAsync(signals, meta = {}) {
  if (!signals || signals.length === 0) return;

  spawn('node', [
    path.join(__dirname, 'enhanced-observer-write.js'),
    JSON.stringify({ signals, meta }),
  ], {
    detached: true,
    stdio: 'ignore',
  }).unref();
}

// ─── 统一 API ─────────────────────────────────────────────

/**
 * 分析并存储（同步）
 */
function analyzeAndStore(text, source = 'enhanced') {
  const { signals, meta } = analyzeEnhanced(text, source);
  const result = writeSignals(signals, meta);
  return { signals, meta, ...result };
}

/**
 * 分析并静默存储（异步）
 */
function analyzeAndStoreAsync(text, source = 'enhanced') {
  const { signals, meta } = analyzeEnhanced(text, source);
  if (signals.length === 0) return { signals: [], meta, success: true };
  writeSignalsAsync(signals, meta);
  return { signals, meta, success: true, count: signals.length };
}

// ─── CLI ─────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log('capture-me Enhanced Observer 2.0');
    console.log('');
    console.log('用法:');
    console.log('  node enhanced-observer.js "要分析的文本"');
    console.log('  node enhanced-observer.js --demo');
    console.log('  node enhanced-observer.js --stat');
    console.log('');
    console.log('维度: emotion, decision, relation, self_awareness, goal, work, life, health');
    return;
  }

  if (args[0] === '--stat') {
    const Database = require(path.join(CAPTURE_ME_DIR, 'node_modules', 'better-sqlite3'));
    const db = new Database(DB_PATH, { readonly: true });
    try {
      const total = db.prepare('SELECT COUNT(*) as c FROM profile_signals').get().c;
      const today = db.prepare(`SELECT COUNT(*) as c FROM profile_signals WHERE date(created_at) = date('now')`).get().c;
      const byDim = db.prepare('SELECT dimension, COUNT(*) as c FROM profile_signals GROUP BY dimension ORDER BY c DESC').all();
      console.log('📊 capture-me 信号统计');
      console.log('─'.repeat(40));
      console.log(`  总信号: ${total}  |  今日: ${today}`);
      console.log('');
      for (const d of byDim) {
        console.log(`  ${d.dimension}: ${d.c}`);
      }
    } finally {
      db.close();
    }
    return;
  }

  if (args[0] === '--demo') {
    const testTexts = [
      '今天开会开到晚上10点，老板又加需求了，真的好累，想辞职',
      '老婆今天生日，我准备了惊喜，希望她喜欢',
      '我发现我每次遇到困难就想逃避，这已经是第三次了，我应该面对',
      '我打算下个月去日本旅游，目标是提前做好攻略',
      '孩子今天在学校又被老师批评了，不知道该怎么教育',
    ];

    console.log('🎯 增强观察器 Demo');
    console.log('='.repeat(50));
    for (const t of testTexts) {
      const { signals, meta } = analyzeEnhanced(t, 'demo');
      console.log(`\n原文: ${t.slice(0, 40)}...`);
      console.log('分析:', JSON.stringify(signals.map(s => `[${s.dimension}] ${s.signal}`)));
    }
    return;
  }

  const text = args.join(' ');
  const { signals, meta, success, count } = analyzeAndStore(text, 'cli');

  console.log('📊 分析结果');
  console.log('─'.repeat(40));
  console.log(`原文: ${text.slice(0, 50)}...`);
  console.log(`信号数: ${signals.length}`);
  for (const s of signals) {
    console.log(`  [${s.dimension}] ${s.signal} (置信:${s.confidence?.toFixed(2)})`);
  }
  console.log('元数据:', JSON.stringify(meta, null, 2));
}

// ─── 导出 ─────────────────────────────────────────────────

module.exports = {
  analyzeEnhanced,
  analyzeAndStore,
  analyzeAndStoreAsync,
  writeSignals,
  EMOTION_INTENSITY,
  EMOTION_VALENCE,
};
