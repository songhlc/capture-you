#!/usr/bin/env node
/**
 * dashboard.js — capture-me 仪表盘
 * 
 * 生成 HTML 格式的状态面板
 */

const fs = require('fs');
const path = require('path');
const SKILL_DIR = path.join(__dirname, '..');
const Database = require('better-sqlite3');

const DB_PATH = path.join(SKILL_DIR, 'sqlite', 'capture.db');
const DASHBOARD_FILE = path.join(SKILL_DIR, 'dashboard.html');

// ─── 数据获取 ─────────────────────────────────────

function getOverview() {
  const db = new Database(DB_PATH, { readonly: true });
  
  const stats = {
    totalNotes: db.prepare('SELECT COUNT(*) as c FROM notes').get().c,
    totalSignals: db.prepare('SELECT COUNT(*) as c FROM profile_signals').get().c,
    todayNotes: db.prepare("SELECT COUNT(*) as c FROM notes WHERE date = date('now')").get().c,
    activeCommitments: db.prepare('SELECT COUNT(*) as c FROM commitments WHERE resolved = 0').get().c,
    unresolvedAlerts: db.prepare('SELECT COUNT(*) as c FROM mirror_alerts WHERE dismissed = 0').get().c,
    newBlindspots: db.prepare('SELECT COUNT(*) as c FROM blindspots WHERE notified = 0').get().c,
  };
  
  // 情绪统计
  const emotionStats = db.prepare(`
    SELECT 
      SUM(CASE WHEN emotion_word LIKE '%开心%' OR emotion_word LIKE '%兴奋%' OR emotion_word LIKE '%满足%' THEN 1 ELSE 0 END) as positive,
      SUM(CASE WHEN emotion_word LIKE '%焦虑%' OR emotion_word LIKE '%压力%' OR emotion_word LIKE '%累%' THEN 1 ELSE 0 END) as negative,
      COUNT(*) as total
    FROM emotion_timeline
    WHERE date >= date('now', '-30 days')
  `).get();
  
  // 待办状态
  const todoStats = db.prepare(`
    SELECT 
      SUM(CASE WHEN todo_done = 1 THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN todo_done = 0 AND todo_due < date('now') THEN 1 ELSE 0 END) as overdue,
      SUM(CASE WHEN todo_done = 0 THEN 1 ELSE 0 END) as pending
    FROM notes
    WHERE is_todo = 1
  `).get();
  
  db.close();
  
  return { stats, emotionStats, todoStats };
}

function getRecentNotes(limit = 10) {
  const db = new Database(DB_PATH, { readonly: true });
  const notes = db.prepare(`
    SELECT id, date, time, raw_text, category, todo_done
    FROM notes
    ORDER BY date DESC, time DESC
    LIMIT ?
  `).all(limit);
  db.close();
  return notes;
}

function getRecentAlerts(limit = 5) {
  const db = new Database(DB_PATH, { readonly: true });
  const alerts = db.prepare(`
    SELECT * FROM mirror_alerts
    ORDER BY sent_at DESC
    LIMIT ?
  `).all(limit);
  db.close();
  return alerts;
}

function getBlindspots(limit = 5) {
  const db = new Database(DB_PATH, { readonly: true });
  const spots = db.prepare(`
    SELECT * FROM blindspots
    ORDER BY first_detected DESC
    LIMIT ?
  `).all(limit);
  db.close();
  return spots;
}

// ─── HTML 生成 ─────────────────────────────────────

function generateHTML() {
  const data = getOverview();
  const { stats, emotionStats, todoStats } = data;
  const recentNotes = getRecentNotes(10);
  const alerts = getRecentAlerts(5);
  const blindspots = getBlindspots(5);
  
  const emotionPositivePct = emotionStats.total > 0 
    ? Math.round(emotionStats.positive / emotionStats.total * 100) : 0;
  const emotionNegativePct = emotionStats.total > 0 
    ? Math.round(emotionStats.negative / emotionStats.total * 100) : 0;
  
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>capture-me 仪表盘</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f7; color: #1d1d1f; padding: 20px; }
    .container { max-width: 900px; margin: 0 auto; }
    h1 { font-size: 24px; margin-bottom: 20px; color: #1d1d1f; }
    h2 { font-size: 16px; color: #86868b; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    
    .card { background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
    .card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
    .stat { text-align: center; }
    .stat-value { font-size: 32px; font-weight: 600; color: #0071e3; }
    .stat-label { font-size: 12px; color: #86868b; margin-top: 4px; }
    
    .note-item { padding: 12px 0; border-bottom: 1px solid #f5f5f7; }
    .note-item:last-child { border-bottom: none; }
    .note-date { font-size: 12px; color: #86868b; margin-bottom: 4px; }
    .note-text { font-size: 14px; line-height: 1.4; }
    .note-done { text-decoration: line-through; color: #86868b; }
    
    .alert-item { padding: 12px; background: #fff5e6; border-radius: 8px; margin-bottom: 8px; border-left: 4px solid #ff9500; }
    .alert-title { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
    .alert-body { font-size: 13px; color: #666; }
    .alert-time { font-size: 11px; color: #999; margin-top: 4px; }
    
    .progress-bar { height: 8px; background: #e5e5e5; border-radius: 4px; overflow: hidden; margin-top: 8px; }
    .progress-fill { height: 100%; border-radius: 4px; }
    .progress-positive { background: #34c759; }
    .progress-negative { background: #ff3b30; }
    
    .blindspot { padding: 12px; background: #f0f0f5; border-radius: 8px; margin-bottom: 8px; }
    .blindspot-type { font-size: 11px; color: #0071e3; text-transform: uppercase; margin-bottom: 4px; }
    .blindspot-desc { font-size: 14px; }
    
    .footer { text-align: center; padding: 20px; color: #86868b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 capture-me 仪表盘</h1>
    
    <!-- 概览 -->
    <div class="card">
      <h2>概览</h2>
      <div class="card-grid">
        <div class="stat">
          <div class="stat-value">${stats.totalNotes}</div>
          <div class="stat-label">总记录</div>
        </div>
        <div class="stat">
          <div class="stat-value">${stats.todayNotes}</div>
          <div class="stat-label">今日新增</div>
        </div>
        <div class="stat">
          <div class="stat-value">${stats.activeCommitments}</div>
          <div class="stat-label">活跃承诺</div>
        </div>
        <div class="stat">
          <div class="stat-value">${stats.unresolvedAlerts}</div>
          <div class="stat-label">待处理提醒</div>
        </div>
      </div>
    </div>
    
    <!-- 情绪 -->
    <div class="card">
      <h2>情绪状态（近30天）</h2>
      ${emotionStats.total > 0 ? `
        <div style="display:flex; gap: 20px; margin-bottom: 12px;">
          <div style="flex:1;">
            <div style="font-size:14px; color:#34c759;">积极 ${emotionPositivePct}%</div>
            <div class="progress-bar"><div class="progress-fill progress-positive" style="width:${emotionPositivePct}%"></div></div>
          </div>
          <div style="flex:1;">
            <div style="font-size:14px; color:#ff3b30;">消极 ${emotionNegativePct}%</div>
            <div class="progress-bar"><div class="progress-fill progress-negative" style="width:${emotionNegativePct}%"></div></div>
          </div>
        </div>
        <div style="font-size:12px; color:#86868b;">总计 ${emotionStats.total} 条情绪记录</div>
      ` : '<div style="color:#86868b;">暂无数据</div>'}
    </div>
    
    <!-- 待办 -->
    <div class="card">
      <h2>待办状态</h2>
      ${todoStats.pending > 0 ? `
        <div style="display:flex; gap: 20px;">
          <div class="stat">
            <div class="stat-value" style="color:#34c759;">${todoStats.completed}</div>
            <div class="stat-label">已完成</div>
          </div>
          <div class="stat">
            <div class="stat-value" style="color:#ff9500;">${todoStats.overdue}</div>
            <div class="stat-label">已逾期</div>
          </div>
          <div class="stat">
            <div class="stat-value">${todoStats.pending - todoStats.completed - todoStats.overdue}</div>
            <div class="stat-label">待处理</div>
          </div>
        </div>
      ` : '<div style="color:#86868b;">暂无待办</div>'}
    </div>
    
    <!-- 最近记录 -->
    <div class="card">
      <h2>最近记录</h2>
      ${recentNotes.length > 0 ? recentNotes.map(n => `
        <div class="note-item ${n.todo_done ? 'note-done' : ''}">
          <div class="note-date">${n.date} ${n.time}</div>
          <div class="note-text">${n.raw_text.slice(0, 100)}${n.raw_text.length > 100 ? '...' : ''}</div>
        </div>
      `).join('') : '<div style="color:#86868b;">暂无记录</div>'}
    </div>
    
    <!-- 提醒 -->
    ${alerts.length > 0 ? `
    <div class="card">
      <h2>最近提醒</h2>
      ${alerts.map(a => `
        <div class="alert-item">
          <div class="alert-title">${a.title}</div>
          <div class="alert-body">${a.body}</div>
          <div class="alert-time">${a.sent_at}</div>
        </div>
      `).join('')}
    </div>
    ` : ''}
    
    <!-- 盲区 -->
    ${blindspots.length > 0 ? `
    <div class="card">
      <h2>发现的行为盲区</h2>
      ${blindspots.map(b => `
        <div class="blindspot">
          <div class="blindspot-type">${b.pattern_type}</div>
          <div class="blindspot-desc">${b.description}</div>
        </div>
      `).join('')}
    </div>
    ` : ''}
    
    <div class="footer">
      capture-me 仪表盘 | 更新于 ${new Date().toLocaleString('zh-CN')}
    </div>
  </div>
</body>
</html>`;
  
  return html;
}

// ─── CLI 入口 ─────────────────────────────────────

const colors = {
  blue: '\x1b[36m',
  green: '\x1b[32m',
  reset: '\x1b[0m',
};

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === 'generate') {
    const html = generateHTML();
    fs.writeFileSync(DASHBOARD_FILE, html);
    console.log(`${colors.green}✓ 仪表盘已生成: ${DASHBOARD_FILE}${colors.reset}`);
    console.log(`  用浏览器打开查看`);
    return;
  }

  if (cmd === 'open') {
    const html = generateHTML();
    fs.writeFileSync(DASHBOARD_FILE, html);
    
    // macOS 用浏览器打开
    const { spawn } = require('child_process');
    spawn('open', [DASHBOARD_FILE], { detached: true });
    console.log(`${colors.green}✓ 已在浏览器打开仪表盘${colors.reset}`);
    return;
  }

  // 默认：生成并提示
  const html = generateHTML();
  fs.writeFileSync(DASHBOARD_FILE, html);
  
  console.log(`${colors.blue}📊 capture-me 仪表盘${colors.reset}\n`);
  console.log(`  文件: ${DASHBOARD_FILE}`);
  console.log(`  记录: ${getOverview().stats.totalNotes} 条`);
  console.log(`  今日: ${getOverview().stats.todayNotes} 条\n`);
  console.log(`  用法:`);
  console.log(`    node dashboard.js open     # 在浏览器打开`);
  console.log(`    node dashboard.js generate  # 仅生成 HTML`);
}

if (require.main === module) {
  main();
}

module.exports = { generateHTML, getOverview, getRecentNotes, getRecentAlerts, getBlindspots };
