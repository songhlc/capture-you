#!/usr/bin/env node
/**
 * trigger.js — 主动触发引擎
 * 
 * 定时检查各种信号，触发通知
 * - 承诺矛盾提醒
 * - 情绪异常提醒
 * - 盲区发现提醒
 * - 周报提醒
 */

const Database = require('better-sqlite3');
const path = require('path');
const SKILL_DIR = path.join(__dirname, '..');
const fs = require('fs');
const { spawn } = require('child_process');

const DB_PATH = path.join(SKILL_DIR, 'sqlite', 'capture.db');
const LOG_DIR = path.join(SKILL_DIR, 'logs');
const TRIGGER_LOG = path.join(LOG_DIR, `triggers-${new Date().toISOString().split('T')[0]}.log`);

// ─── 日志 ─────────────────────────────────────────

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function log(level, msg, data = null) {
  const entry = {
    time: new Date().toISOString(),
    level,
    msg,
    ...(data && { data }),
  };
  fs.appendFileSync(TRIGGER_LOG, JSON.stringify(entry) + '\n');
}

// ─── 承诺矛盾检查 ─────────────────────────────────

function checkCommitments() {
  const db = new Database(DB_PATH, { readonly: true });

  const commitments = db.prepare(`
    SELECT * FROM commitments 
    WHERE resolved = 0 
    ORDER BY created_at DESC
    LIMIT 10
  `).all();

  db.close();

  if (commitments.length === 0) return null;

  const CONTRADICTION_PATTERNS = [
    /没跑成|没做到|没去|没完成|又没|忘记|耽误了|太忙|来不及/,
    /还是没|仍然没|依然没/,
  ];

  const RECENT_NOTES_SINCE = new Date();
  RECENT_NOTES_SINCE.setDate(RECENT_NOTES_SINCE.getDate() - 14);

  const db2 = new Database(DB_PATH, { readonly: true });
  const recentNotes = db2.prepare(`
    SELECT * FROM notes 
    WHERE date >= ?
    ORDER BY date DESC
  `).all(RECENT_NOTES_SINCE.toISOString().split('T')[0]);
  db2.close();

  const triggered = [];

  for (const c of commitments) {
    if (c.triggered_count >= 3) continue;

    let contradictions = 0;
    for (const note of recentNotes) {
      if (note.id === c.source_note_id) continue;
      const text = note.raw_text;
      for (const pattern of CONTRADICTION_PATTERNS) {
        if (pattern.test(text)) {
          contradictions++;
          break;
        }
      }
    }

    if (contradictions >= 2) {
      triggered.push({
        alert_type: 'contradiction',
        title: `承诺连续未兑现`,
        body: `"${c.commitment_text.slice(0, 30)}..."已连续${contradictions}次未兑现`,
      });
    }
  }

  return triggered.length > 0 ? triggered : null;
}

// ─── 情绪异常检查 ─────────────────────────────────

function checkEmotionAnomaly() {
  const db = new Database(DB_PATH, { readonly: true });

  const now = new Date();
  const recent = new Date(now);
  recent.setDate(recent.getDate() - 7);
  const older = new Date(recent);
  older.setDate(older.getDate() - 7);

  const recentEmotions = db.prepare(`
    SELECT emotion_word FROM emotion_timeline WHERE date >= ?
  `).all(recent.toISOString().split('T')[0]);

  const olderEmotions = db.prepare(`
    SELECT emotion_word FROM emotion_timeline WHERE date >= ? AND date < ?
  `).all(older.toISOString().split('T')[0], recent.toISOString().split('T')[0]);

  db.close();

  if (recentEmotions.length < 3 || olderEmotions.length < 3) return null;

  const NEGATIVE = ['焦虑', '担心', '压力', '累', '疲惫', '郁闷', '烦躁', '沮丧'];

  const recentNeg = recentEmotions.filter(e => 
    NEGATIVE.some(kw => e.emotion_word && e.emotion_word.includes(kw))
  ).length;

  const olderNeg = olderEmotions.filter(e =>
    NEGATIVE.some(kw => e.emotion_word && kw in e.emotion_word)
  ).length;

  const recentRatio = recentNeg / recentEmotions.length;
  const olderRatio = olderNeg / olderEmotions.length;

  // 负面情绪上升超过 30%
  if (recentRatio > olderRatio * 1.3 && recentRatio > 0.3) {
    return [{
      alert_type: 'emotion',
      title: `情绪状态下降`,
      body: `近7天负面情绪占比${Math.round(recentRatio*100)}%，较前一周上升`,
    }];
  }

  return null;
}

// ─── 盲区检查 ─────────────────────────────────────

function checkBlindspots() {
  const db = new Database(DB_PATH, { readonly: true });

  const newBlindspots = db.prepare(`
    SELECT * FROM blindspots 
    WHERE notified = 0 
    ORDER BY first_detected DESC
    LIMIT 3
  `).all();

  db.close();

  if (newBlindspots.length === 0) return null;

  return newBlindspots.map(bs => ({
    alert_type: 'blindspot',
    title: `发现行为盲区`,
    body: bs.description,
  }));
}

// ─── 待办过期检查 ─────────────────────────────────

function checkOverdueTodos() {
  const db = new Database(DB_PATH, { readonly: true });

  const today = new Date().toISOString().split('T')[0];

  const overdue = db.prepare(`
    SELECT * FROM notes 
    WHERE is_todo = 1 AND todo_done = 0 AND todo_due < ?
  `).all(today);

  db.close();

  if (overdue.length === 0) return null;

  return [{
    alert_type: 'todo',
    title: `${overdue.length} 条待办已逾期`,
    body: overdue.map(t => `• ${t.raw_text.slice(0, 30)}...`).join('\n'),
  }];
}

// ─── 触发通知 ─────────────────────────────────────

function insertAlert(alert) {
  const db = new Database(DB_PATH);
  const id = `alert-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  db.prepare(`
    INSERT INTO mirror_alerts (id, alert_type, title, body, sent_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(id, alert.alert_type, alert.title, alert.body);
  db.close();
  return id;
}

function getRecentAlertsSent() {
  const db = new Database(DB_PATH, { readonly: true });
  const since = new Date();
  since.setDate(since.getDate() - 1);
  const alerts = db.prepare(`
    SELECT * FROM mirror_alerts 
    WHERE sent_at >= ?
  `).all(since.toISOString());
  db.close();
  return alerts;
}

// ─── 主检查流程 ─────────────────────────────────

function runChecks() {
  const results = [];
  const sentAlerts = getRecentAlertsSent();
  const sentTypes = new Set(sentAlerts.map(a => a.title));

  // 承诺矛盾
  const commitmentAlerts = checkCommitments();
  if (commitmentAlerts) {
    for (const alert of commitmentAlerts) {
      if (!sentTypes.has(alert.title)) {
        insertAlert(alert);
        results.push(alert);
      }
    }
  }

  // 情绪异常
  const emotionAlerts = checkEmotionAnomaly();
  if (emotionAlerts) {
    for (const alert of emotionAlerts) {
      if (!sentTypes.has(alert.title)) {
        insertAlert(alert);
        results.push(alert);
      }
    }
  }

  // 盲区
  const blindspotAlerts = checkBlindspots();
  if (blindspotAlerts) {
    for (const alert of blindspotAlerts) {
      if (!sentTypes.has(alert.title)) {
        insertAlert(alert);
        results.push(alert);
      }
    }
  }

  // 待办过期
  const todoAlerts = checkOverdueTodos();
  if (todoAlerts) {
    for (const alert of todoAlerts) {
      if (!sentTypes.has(alert.title)) {
        insertAlert(alert);
        results.push(alert);
      }
    }
  }

  return results;
}

// ─── macOS 通知 ─────────────────────────────────

function sendMacNotification(title, body) {
  spawn('osascript', [
    '-e',
    `display notification "${body}" with title "${title}"`
  ], { stdio: 'ignore', detached: true });
}

// ─── CLI 入口 ───────────────────────────────────

const colors = {
  blue: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
};

function main() {
  const args = process.argv.slice(2);

  if (args[0] === 'check') {
    console.log(`${colors.blue}🔍 触发检查中...${colors.reset}\n`);
    
    const results = runChecks();
    
    if (results.length === 0) {
      console.log(`${colors.green}✓ 无新触发${colors.reset}`);
      return;
    }

    console.log(`${colors.yellow}触发 ${results.length} 个提醒：${colors.reset}\n`);
    
    for (const r of results) {
      const icon = r.alert_type === 'contradiction' ? '⚠️' :
                   r.alert_type === 'emotion' ? '💭' :
                   r.alert_type === 'blindspot' ? '🔍' : '📋';
      console.log(`${icon} ${colors.red}${r.title}${colors.reset}`);
      console.log(`   ${r.body}`);
      console.log('');

      // 发送 macOS 通知
      sendMacNotification(r.title, r.body.slice(0, 100));
    }

    console.log(`${colors.green}✓ 已发送通知${colors.reset}`);
    return;
  }

  if (args[0] === 'list') {
    const db = new Database(DB_PATH, { readonly: true });
    const alerts = db.prepare(`
      SELECT * FROM mirror_alerts 
      ORDER BY sent_at DESC 
      LIMIT 10
    `).all();
    db.close();

    console.log(`${colors.blue}📋 最近提醒${colors.reset}\n`);
    
    for (const a of alerts) {
      const icon = a.alert_type === 'contradiction' ? '⚠️' :
                   a.alert_type === 'emotion' ? '💭' :
                   a.alert_type === 'blindspot' ? '🔍' : '📋';
      const dismissed = a.dismissed ? ` ${colors.dim}[已关闭]${colors.reset}` : '';
      console.log(`${icon} ${a.title}${dismissed}`);
      console.log(`   ${a.body}`);
      console.log(`   ${colors.dim}${a.sent_at}${colors.reset}`);
      console.log('');
    }
    return;
  }

  if (args[0] === 'dismiss') {
    const id = args[1];
    if (!id) {
      console.log('用法: trigger.js dismiss <alert_id>');
      return;
    }
    const db = new Database(DB_PATH);
    db.prepare(`UPDATE mirror_alerts SET dismissed = 1 WHERE id = ?`).run(id);
    db.close();
    console.log(`${colors.green}✓ 已关闭提醒${colors.reset}`);
    return;
  }

  // 帮助
  console.log(`${colors.blue}⚡ 主动触发引擎${colors.reset}\n`);
  console.log('用法:');
  console.log('  node trigger.js check    # 执行检查并发送通知');
  console.log('  node trigger.js list      # 查看最近提醒');
  console.log('  node trigger.js dismiss <id>  # 关闭提醒');
}

if (require.main === module) {
  main();
}

module.exports = {
  runChecks,
  checkCommitments,
  checkEmotionAnomaly,
  checkBlindspots,
  checkOverdueTodos,
  insertAlert,
  sendMacNotification,
};
