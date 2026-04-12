#!/usr/bin/env node
/**
 * external-data.js — 外部数据接入
 * 
 * 从 macOS Shortcuts 获取 Health / Calendar 数据
 */

const { spawn } = require('child_process');
const Database = require('better-sqlite3');
const path = require('path');
const SKILL_DIR = path.join(__dirname, '..');

const DB_PATH = path.join(SKILL_DIR, 'sqlite', 'capture.db');

// ─── Shortcuts 执行 ─────────────────────────────────

function runShortcut(name, args = []) {
  return new Promise((resolve, reject) => {
    const cmd = spawn('shortcuts', ['run', name, ...args], { stdio: 'pipe' });
    let stdout = '';
    let stderr = '';

    cmd.stdout.on('data', d => stdout += d.toString());
    cmd.stderr.on('data', d => stderr += d.toString());

    cmd.on('close', code => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr || `shortcut exited with code ${code}`));
      }
    });

    cmd.on('error', reject);
  });
}

// ─── Health 数据 ──────────────────────────────────

async function fetchHealthData(type, days = 7) {
  // 使用 Shortcuts 获取健康数据
  // 需要先在 macOS Shortcuts 创建对应的 Shortcut
  // 
  // Shortcut 名称: "capture-me-health-xxx"
  // 返回格式: JSON
  
  const shortcutMap = {
    sleep: 'capture-me-health-sleep',
    exercise: 'capture-me-health-exercise',
    weight: 'capture-me-health-weight',
    heartRate: 'capture-me-health-heartrate',
  };

  const shortcut = shortcutMap[type];
  if (!shortcut) {
    throw new Error(`Unknown health type: ${type}`);
  }

  try {
    const result = await runShortcut(shortcut, ['-d', String(days)]);
    return JSON.parse(result);
  } catch (e) {
    // Shortcut 不存在时返回空数据
    if (e.message.includes('not found') || e.message.includes('does not exist')) {
      return null;
    }
    throw e;
  }
}

// ─── 健康数据存储 ─────────────────────────────────

function saveHealthRecord(type, data) {
  if (!data) return;

  const db = new Database(DB_PATH);
  
  // 创建健康记录表（如果不存在）
  db.exec(`
    CREATE TABLE IF NOT EXISTS health_records (
      id TEXT PRIMARY KEY,
      type TEXT,
      date TEXT,
      value REAL,
      unit TEXT,
      details TEXT,
      source TEXT DEFAULT 'health',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_health_type ON health_records(type);
    CREATE INDEX IF NOT EXISTS idx_health_date ON health_records(date);
  `);

  const id = `health-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  
  if (Array.isArray(data)) {
    for (const item of data) {
      db.prepare(`
        INSERT OR REPLACE INTO health_records (id, type, date, value, unit, details, source)
        VALUES (?, ?, ?, ?, ?, ?, 'health')
      `).run(
        `${id}-${item.date}`,
        type,
        item.date,
        item.value,
        item.unit || '',
        JSON.stringify(item.details || {})
      );
    }
  } else {
    db.prepare(`
      INSERT OR REPLACE INTO health_records (id, type, date, value, unit, details, source)
      VALUES (?, ?, ?, ?, ?, ?, 'health')
    `).run(
      id,
      type,
      data.date,
      data.value,
      data.unit || '',
      JSON.stringify(data.details || {})
    );
  }

  db.close();
}

// ─── 健康数据分析 ─────────────────────────────────

function analyzeHealthCorrelation() {
  const db = new Database(DB_PATH, { readonly: true });

  // 获取最近 30 天健康数据
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceStr = since.toISOString().split('T')[0];

  const healthData = db.prepare(`
    SELECT * FROM health_records WHERE date >= ? ORDER BY date
  `).all(sinceStr);

  const emotionData = db.prepare(`
    SELECT date, emotion_word, intensity FROM emotion_timeline WHERE date >= ?
  `).all(sinceStr);

  db.close();

  if (healthData.length === 0 || emotionData.length === 0) {
    return { ready: false, message: '数据不足' };
  }

  // 简化分析：睡眠时长 vs 情绪
  const sleepData = healthData.filter(h => h.type === 'sleep');
  const exerciseData = healthData.filter(h => h.type === 'exercise');

  const analysis = {
    sleepAvg: sleepData.length > 0 
      ? sleepData.reduce((sum, h) => sum + h.value, 0) / sleepData.length 
      : null,
    exerciseCount: exerciseData.length,
    correlation: [],
  };

  // 睡眠充足时情绪是否更好
  if (sleepData.length >= 3) {
    const goodSleepDays = sleepData.filter(h => h.value >= 7).map(h => h.date);
    const badSleepDays = sleepData.filter(h => h.value < 6).map(h => h.date);

    const emotionBySleep = { good: [], bad: [] };

    for (const em of emotionData) {
      if (goodSleepDays.includes(em.date)) emotionBySleep.good.push(em.emotion_word);
      if (badSleepDays.includes(em.date)) emotionBySleep.bad.push(em.emotion_word);
    }

    if (emotionBySleep.good.length > 0 && emotionBySleep.bad.length > 0) {
      analysis.correlation.push({
        type: 'sleep_emotion',
        description: '睡眠与情绪关联',
        insight: `睡眠充足(${goodSleepDays.length}天)时情绪词多为正面，睡眠不足(${badSleepDays.length}天)时反之`,
      });
    }
  }

  return { ready: true, analysis };
}

// ─── Calendar 数据 ────────────────────────────────

async function fetchCalendarEvents(days = 7) {
  // 方法1: 通过 Shortcuts
  try {
    const result = await runShortcut('capture-me-calendar', ['-d', String(days)]);
    return JSON.parse(result);
  } catch (e) {
    // Shortcut 不存在，继续尝试其他方法
  }

  // 方法2: 通过 AppleScript 直接读取 Calendar
  try {
    const script = `tell application "Calendar"
set theDate to current date
set startDate to theDate - (${days} * days)
set endDate to theDate
set eventList to {}
tell calendar "Home"
try
set theseEvents to (every event whose start date is greater than startDate and start date is less than endDate)
repeat with e in theseEvents
set end of eventList to {title:summary of e, startDate:start date of e as string, endDate:end date of e as string, calendarName:name of calendar of e}
end repeat
end try
end tell
return eventList as JSON
end tell`;

    const result = await runAppleScriptStdin(script);
    if (result && result.trim()) {
      return JSON.parse(result.trim());
    }
    return [];
  } catch (e) {
    // 忽略错误
    return [];
  }
}

function runAppleScriptStdin(script) {
  return new Promise((resolve, reject) => {
    const cmd = spawn('osascript', ['-s', 's'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    
    cmd.stdout.on('data', d => stdout += d.toString());
    cmd.stderr.on('data', d => stderr += d.toString());
    
    cmd.on('close', code => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `osascript exited with code ${code}`));
      }
    });
    
    cmd.on('error', reject);
    cmd.stdin.write(script);
    cmd.stdin.end();
  });
}

function saveCalendarEvents(events) {
  if (!events || events.length === 0) return;

  const db = new Database(DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      title TEXT,
      start_date TEXT,
      end_date TEXT,
      calendar TEXT,
      source TEXT DEFAULT 'calendar',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cal_date ON calendar_events(start_date);
  `);

  for (const event of events) {
    const id = event.id || `cal-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    db.prepare(`
      INSERT OR REPLACE INTO calendar_events (id, title, start_date, end_date, calendar)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, event.title, event.start, event.end, event.calendar || 'Default');
  }

  db.close();
}

// ─── Stock 数据 ──────────────────────────────────

async function fetchStockData(symbol) {
  // 这个需要 MCP server 或外部 API
  // 暂时返回空
  return null;
}

// ─── CLI 入口 ───────────────────────────────────

const colors = {
  blue: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
};

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === 'health') {
    const type = args[1] || 'sleep';
    const days = parseInt(args[2]) || 7;

    console.log(`${colors.blue}📊 获取健康数据: ${type} (近${days}天)${colors.reset}\n`);

    try {
      const data = await fetchHealthData(type, days);
      if (data) {
        console.log(`${colors.green}获取成功${colors.reset}`);
        console.log(JSON.stringify(data, null, 2));
        saveHealthRecord(type, data);
        console.log(`${colors.green}✓ 已保存到数据库${colors.reset}`);
      } else {
        console.log(`${colors.yellow}⚠️ Shortcut "${type}" 未配置或无数据${colors.reset}`);
        console.log(`请在 macOS Shortcuts 创建 "${type}" Shortcut`);
      }
    } catch (e) {
      console.log(`${colors.red}错误: ${e.message}${colors.reset}`);
    }
    return;
  }

  if (cmd === 'calendar') {
    const days = parseInt(args[1]) || 7;

    console.log(`${colors.blue}📅 获取日历事件 (近${days}天)${colors.reset}\n`);

    try {
      const events = await fetchCalendarEvents(days);
      if (events && events.length > 0) {
        console.log(`${colors.green}获取到 ${events.length} 个事件${colors.reset}`);
        for (const ev of events.slice(0, 5)) {
          console.log(`  • ${ev.title} (${ev.startDate || ev.start || '无时间'})`);
        }
        if (events.length > 5) console.log(`  ... 还有 ${events.length - 5} 个`);
        saveCalendarEvents(events);
        console.log(`${colors.green}✓ 已保存到数据库${colors.reset}`);
      } else {
        console.log(`${colors.yellow}⚠️ 无事件${colors.reset}`);
        console.log(`提示: 确保 Calendar 应用有访问权限，或创建 Shortcut`);
      }
    } catch (e) {
      console.log(`${colors.red}错误: ${e.message}${colors.reset}`);
    }
    return;
  }

  if (cmd === 'huawei') {
    console.log(`${colors.blue}📱 华为健康数据${colors.reset}\n`);
    console.log(`${colors.yellow}华为健康接入需要：${colors.reset}`);
    console.log('1. 华为健康 App → 设置 → 数据分享 → 开启第三方接入');
    console.log('2. 使用华为 HMS Core API 或第三方导出工具');
    console.log('3. 或使用 "健康闪记" 等 Shortcuts 将华为数据同步到 iOS');
    console.log('');
    console.log('建议方案：创建一个 Shortcuts 从 iOS 健康 App 读取数据');
    console.log('(华为手环数据通过华为健康 App → iOS 健康 App 同步后即可使用)');
    return;
  }

  if (cmd === 'debug-calendar') {
    console.log(`${colors.blue}🔧 Calendar 调试${colors.reset}\n`);
    
    // 检查 TCC 权限
    const tccCheck = `/usr/bin/sqlite3 ~/Library/Application\ Support/com.apple.TCC/TCC.db "SELECT service, client FROM access WHERE service LIKE '%calendar%'" 2>/dev/null`;
    
    // 列出可用日历
    try {
      const calendars = await runAppleScriptStdin(`tell application "Calendar"
set calList to {}
repeat with cal in calendars
set end of calList to name of cal
end repeat
return calList as JSON
end tell`);
      
      if (calendars && calendars.trim()) {
        const calNames = JSON.parse(calendars.trim());
        console.log(`${colors.green}可用日历：${colors.reset}`);
        calNames.forEach(name => console.log(`  • ${name}`));
      }
    } catch (e) {
      console.log(`${colors.red}无法读取日历列表${colors.reset}`);
      console.log('可能原因：Calendar 应用没有 Automation 权限');
      console.log('解决：系统偏好设置 → 安全性与隐私 → 隐私 → Calendar → 允许 Automation');
    }
    return;
  }

  if (cmd === 'analyze') {
    console.log(`${colors.blue}🔬 健康数据分析${colors.reset}\n`);

    const result = analyzeHealthCorrelation();
    
    if (!result.ready) {
      console.log(`${colors.yellow}⚠️ ${result.message}${colors.reset}`);
      return;
    }

    const { analysis } = result;
    
    if (analysis.sleepAvg) {
      console.log(`睡眠平均: ${analysis.sleepAvg.toFixed(1)} 小时`);
    }
    
    if (analysis.exerciseCount) {
      console.log(`运动记录: ${analysis.exerciseCount} 次`);
    }

    if (analysis.correlation && analysis.correlation.length > 0) {
      console.log(`\n${colors.green}发现关联:${colors.reset}`);
      for (const c of analysis.correlation) {
        console.log(`• ${c.description}`);
        console.log(`  ${c.insight}`);
      }
    }
    return;
  }

  // 帮助
  console.log(`${colors.blue}📡 外部数据接入${colors.reset}\n`);
  console.log('用法:');
  console.log('  node external-data.js health [type] [days]  # 获取健康数据');
  console.log('  node external-data.js calendar [days]      # 获取日历事件');
  console.log('  node external-data.js analyze               # 健康数据分析');
  console.log('  node external-data.js huawei [days]          # 华为健康数据');
  console.log('');
  console.log('健康数据类型: sleep, exercise, weight, heartRate');
  console.log('');
  console.log(`${colors.yellow}Calendar 接入方式：${colors.reset}`);
  console.log('  方式1: 创建 Shortcut "capture-me-calendar"');
  console.log('  方式2: AppleScript 直接读取（需日历读取权限）');
  console.log('');
  console.log(`${colors.yellow}Health 接入方式：${colors.reset}`);
  console.log('  macOS: 通过 Shortcuts 调用 iPhone Health');
  console.log('  华为手环: 华为健康 App → 第三方 API / 导出');
}

if (require.main === module) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}

module.exports = {
  fetchHealthData,
  fetchCalendarEvents,
  fetchStockData,
  saveHealthRecord,
  saveCalendarEvents,
  analyzeHealthCorrelation,
};
