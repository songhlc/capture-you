#!/usr/bin/env node
/**
 * observe-core.js — capture-me 被动观察核心库
 *
 * 供各类 Agent（OpenClaw、Claude Code、Codex 等）调用的统一接口
 *
 * 用法：
 *   const observer = require('./observe-core');
 *   await observer.analyzeAndStore(userMessage, source);
 */

const path = require('path');
const SKILL_DIR = path.join(__dirname, '..');
const fs = require('fs');
const { spawn } = require('child_process');

// ─── 路径配置 ─────────────────────────────────────────────

const CAPTURE_ME_DIR = SKILL_DIR;
const DB_PATH = path.join(CAPTURE_ME_DIR, 'sqlite', 'capture.db');
const LOG_DIR = path.join(CAPTURE_ME_DIR, 'logs');
const QUEUE_DIR = path.join(CAPTURE_ME_DIR, 'queue');

// ─── 信号提取规则 ────────────────────────────────────────

const SIGNAL_RULES = [
  {
    dimension: 'work',
    patterns: [/开会|会议|项目|客户|工作|上班|下班|加班|老板|同事|上司|汇报|方案|合同|谈判|面试|入职|辞职|晋升|加薪/],
    extract: (text) => {
      if (/开会|会议/.test(text)) return '工作中频繁开会';
      if (/项目|客户/.test(text)) return '项目/客户相关工作';
      if (/加班|上班/.test(text)) return '工作时间长/加班';
      return '工作相关内容';
    }
  },
  {
    dimension: 'life',
    patterns: [/吃饭|早餐|午餐|晚餐|外卖|做饭|购物|买|出行|旅游|回家|出门|电影|娱乐|休息/],
    extract: (text) => {
      if (/吃饭|外卖|做饭/.test(text)) return '日常饮食相关';
      if (/购物|买/.test(text)) return '购物消费';
      if (/出行|旅游/.test(text)) return '出行/旅游';
      return '日常生活';
    }
  },
  {
    dimension: 'habit',
    patterns: [/每天|总是|经常|通常|习惯|了一般|以往都|向来|熬夜|早起|晚睡|晨跑|夜跑/],
    extract: (text) => {
      if (/熬夜|晚睡/.test(text)) return '晚睡/熬夜习惯';
      if (/早起|晨跑/.test(text)) return '早起/晨跑习惯';
      if (/每天|习惯/.test(text)) return '日常习惯行为';
      return '习惯性行为模式';
    }
  },
  {
    dimension: 'emotion',
    patterns: [
      /开心|高兴|兴奋|满足|愉快|轻松|不错|顺利|成功|突破|成就感/,
      /焦虑|担心|担忧|不安|紧张|压力|累|疲惫|困|郁闷|烦躁|沮丧|失落|失望|伤心|难过/,
    ],
    extract: (text) => {
      if (/开心|高兴|兴奋|满足/.test(text)) return '积极情绪';
      if (/焦虑|担心|担忧|压力/.test(text)) return '焦虑/压力情绪';
      if (/累|疲惫|困/.test(text)) return '疲惫/低能量状态';
      if (/郁闷|烦躁|沮丧|失落/.test(text)) return '负面情绪';
      return '情绪波动';
    }
  },
  {
    dimension: 'preference',
    patterns: [/喜欢|讨厌|偏好|宁愿|宁可|比起|宁愿.*也不|从不|绝不|从来不|希望|想要|期望/],
    extract: (text) => {
      if (/喜欢/.test(text)) return '表达了偏好';
      if (/讨厌|不喜欢/.test(text)) return '表达了厌恶';
      if (/希望|想要|期望/.test(text)) return '表达了期望';
      return '偏好/意愿倾向';
    }
  },
  {
    dimension: 'goal',
    patterns: [/目标|打算|计划|想要达成|立志|决心|决定要|以后要|未来要|这辈子要|这次一定要|一定要/],
    extract: (text) => {
      if (/目标/.test(text)) return '设定了目标';
      if (/打算|计划/.test(text)) return '有计划/打算';
      if (/决定|决心/.test(text)) return '做出决定/决心';
      return '目标/计划声明';
    }
  },
  {
    dimension: 'relation',
    patterns: [
      /老婆|老公|妻子|丈夫|男票|女票|男朋友|女朋友|伴侣|对象|家人|父母|爸妈|爸|妈/,
      /女儿|儿子|孩子|小孩|儿童|宝贝|少爷|公主|宝宝/,
      /张总|李总|王总|赵总|刘总|陈总|总|老板|上司|领导|同事|同学|朋友|哥们|闺蜜|兄弟|姐姐|妹妹|哥哥|弟弟/,
      /家长会|老师|学校|班主任|辅导班|培训班/,
    ],
    extract: (text) => {
      if (/老婆|老公|妻子|丈夫/.test(text)) return '配偶关系动态';
      if (/女儿|儿子|孩子|小孩|宝宝/.test(text)) return '亲子关系动态';
      if (/爸妈|父母|家人/.test(text)) return '家庭关系动态';
      if (/家长会|老师|学校/.test(text)) return '子女教育相关动态';
      if (/张总|李总|王总|总/.test(text)) return '职场关系动态（领导/客户）';
      if (/同事|同学|朋友/.test(text)) return '社交关系动态';
      return '人际关系提及';
    }
  },
  {
    dimension: 'health',
    patterns: [/睡眠|睡|做梦|失眠|早睡|熬夜|累|疲惫|困|没精神|健康|身体|运动|跑步|健身|瑜伽|锻炼|头疼|感冒|发烧|咳嗽/],
    extract: (text) => {
      if (/睡眠|睡|做梦|失眠|早睡|熬夜/.test(text)) return '睡眠相关状态';
      if (/运动|跑步|健身|瑜伽|锻炼/.test(text)) return '运动/健身活动';
      if (/累|疲惫|困|没精神/.test(text)) return '身体疲劳/低能量';
      if (/头疼|感冒|发烧|咳嗽/.test(text)) return '身体不适/疾病';
      return '健康/身体状态';
    }
  },
];

// ─── 日志 ─────────────────────────────────────────────────

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = path.join(LOG_DIR, `observe-${new Date().toISOString().split('T')[0]}.log`);

function log(level, msg, data = null) {
  const entry = {
    time: new Date().toISOString(),
    level,
    msg,
    ...(data && { data: typeof data === 'string' ? data.slice(0, 200) : data }),
  };
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  if (level === 'ERROR') {
    console.error(`[OBSERVER ERROR] ${msg}`, data ? `(${JSON.stringify(data).slice(0, 100)})` : '');
  }
}

// ─── 信号提取 ─────────────────────────────────────────────

/**
 * 从文本中提取画像信号
 * @param {string} text - 用户消息文本
 * @param {string} source - 来源标识（openclaw/claude_code/codex等）
 * @returns {Array} - 信号数组
 */
function extractSignals(text, source = 'unknown') {
  if (!text || typeof text !== 'string' || text.trim().length < 3) {
    return [];
  }

  const signals = [];

  for (const rule of SIGNAL_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) {
        const signalText = rule.extract ? rule.extract(text) : `检测到${rule.dimension}相关内容`;
        
        // 避免重复（同一维度只取第一个匹配）
        if (!signals.some(s => s.dimension === rule.dimension)) {
          signals.push({
            dimension: rule.dimension,
            signal: signalText,
            confidence: 0.7,
            source,
            conversation_id: null,
          });
        }
        break;
      }
    }
  }

  return signals;
}

// ─── 同步写入 ─────────────────────────────────────────────

const Database = require(path.join(CAPTURE_ME_DIR, 'node_modules', 'better-sqlite3'));

function writeSync(signals) {
  if (!signals || signals.length === 0) return { success: true, count: 0 };

  const db = new Database(DB_PATH);

  try {
    // 确保表存在
    db.exec(`
      CREATE TABLE IF NOT EXISTS profile_signals (
        id TEXT PRIMARY KEY,
        dimension TEXT,
        signal TEXT,
        confidence REAL,
        source TEXT DEFAULT 'observe',
        conversation_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        last_reinforced TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_signals_dimension ON profile_signals(dimension);
      CREATE INDEX IF NOT EXISTS idx_signals_created ON profile_signals(created_at);
    `);

    const stmt = db.prepare(`
      INSERT INTO profile_signals (id, dimension, signal, confidence, source, conversation_id, created_at, last_reinforced)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    const inserted = [];
    for (const signal of signals) {
      if (!signal.dimension || !signal.signal) continue;
      
      const id = signal.id || `sig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      stmt.run(
        id,
        signal.dimension,
        signal.signal,
        signal.confidence || 0.5,
        signal.source || 'observe',
        signal.conversation_id || null
      );
      inserted.push(id);
    }

    log('INFO', `写入成功: ${inserted.length} 条信号`, { source: signals[0]?.source });
    return { success: true, count: inserted.length, ids: inserted };
  } catch (err) {
    log('ERROR', '数据库写入失败', { error: err.message });
    
    // 暂存队列
    if (!fs.existsSync(QUEUE_DIR)) fs.mkdirSync(QUEUE_DIR, { recursive: true });
    const queueFile = path.join(QUEUE_DIR, `failed-${Date.now()}.json`);
    fs.writeFileSync(queueFile, JSON.stringify({ signals, error: err.message, at: new Date().toISOString() }));
    
    return { success: false, queueFile };
  } finally {
    db.close();
  }
}

// ─── 异步写入 ─────────────────────────────────────────────

/**
 * 静默异步写入（不阻塞调用者）
 */
function writeAsync(signals) {
  if (!signals || signals.length === 0) return;

  // spawn 脱离父进程，静默执行
  spawn('node', [
    path.join(CAPTURE_ME_DIR, 'observe-async.js'),
    JSON.stringify(signals),
  ], {
    detached: true,
    stdio: 'ignore',
  }).unref();
}

// ─── 核心 API ─────────────────────────────────────────────

/**
 * 分析文本并存储信号（同步版本，用于 CLI）
 */
async function analyzeAndStore(text, source = 'cli') {
  const signals = extractSignals(text, source);
  if (signals.length === 0) {
    return { success: true, count: 0, signals: [] };
  }
  return writeSync(signals);
}

/**
 * 分析文本并静默存储（异步版本，用于 Agent Hook）
 */
async function analyzeAndStoreAsync(text, source = 'agent') {
  const signals = extractSignals(text, source);
  if (signals.length === 0) {
    return { success: true, count: 0 };
  }
  writeAsync(signals);
  return { success: true, count: signals.length };
}

// ─── 队列重试 ─────────────────────────────────────────────

function retryFailed(maxRetries = 3) {
  if (!fs.existsSync(QUEUE_DIR)) return { success: 0, failed: 0, message: '队列目录不存在' };

  const files = fs.readdirSync(QUEUE_DIR).filter(f => f.startsWith('failed-') && f.endsWith('.json'));
  if (files.length === 0) {
    return { success: 0, failed: 0, message: '队列为空' };
  }

  let success = 0, failed = 0;

  for (const file of files) {
    const filePath = path.join(QUEUE_DIR, file);
    const item = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    if (item.retryCount >= maxRetries) continue;

    const result = writeSync(item.signals);
    if (result.success) {
      fs.unlinkSync(filePath);
      success++;
    } else {
      item.retryCount = (item.retryCount || 0) + 1;
      item.lastRetry = new Date().toISOString();
      fs.writeFileSync(filePath, JSON.stringify(item));
      failed++;
    }
  }

  return { success, failed };
}

// ─── 统计 ─────────────────────────────────────────────────

function getStats() {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const total = db.prepare('SELECT COUNT(*) as c FROM profile_signals').get().c;
    const today = db.prepare(`SELECT COUNT(*) as c FROM profile_signals WHERE date(created_at) = date('now')`).get().c;
    const byDim = db.prepare('SELECT dimension, COUNT(*) as c FROM profile_signals GROUP BY dimension').all();
    return { total, today, byDimension: byDim };
  } finally {
    db.close();
  }
}

function queueStatus() {
  if (!fs.existsSync(QUEUE_DIR)) return { count: 0 };
  const files = fs.readdirSync(QUEUE_DIR).filter(f => f.startsWith('failed-') && f.endsWith('.json'));
  return { count: files.length, files };
}

// ─── CLI 入口 ─────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // 默认：显示状态
    const s = getStats();
    const q = queueStatus();

    console.log('📊 capture-me Observer');
    console.log('─'.repeat(40));
    console.log(`  总信号: ${s.total}  |  今日新增: ${s.today}`);
    for (const dim of s.byDimension) {
      console.log(`  ${dim.dimension}: ${dim.c}`);
    }
    console.log('─'.repeat(40));
    console.log(`  队列待重试: ${q.count} 条`);
    console.log('');
    console.log('  用法:');
    console.log('    node observe-core.js --stat             # 统计');
    console.log('    node observe-core.js --retry            # 重试队列');
    console.log('    node observe-core.js --queue           # 查看队列');
    console.log('    node observe-core.js "文本"            # 分析文本');
    return;
  }

  const cmd = args[0];

  if (cmd === '--stat') {
    console.log(JSON.stringify(getStats(), null, 2));
    return;
  }

  if (cmd === '--retry') {
    console.log(JSON.stringify(retryFailed(), null, 2));
    return;
  }

  if (cmd === '--queue') {
    console.log(JSON.stringify(queueStatus(), null, 2));
    return;
  }

  // 分析文本
  analyzeAndStore(args.join(' '), 'cli').then(r => {
    console.log(r.success ? '✓' : '✗', `分析完成: ${r.count} 条信号`);
  });
}

// ─── 导出 ─────────────────────────────────────────────────

module.exports = {
  extractSignals,
  analyzeAndStore,
  analyzeAndStoreAsync,
  writeSync,
  writeAsync,
  retryFailed,
  getStats,
  queueStatus,
};
