#!/usr/bin/env node
/**
 * write-signals.js — 静默异步写入信号到 capture-me 数据库
 * 
 * 由 handler.ts spawn 调用，后台静默执行
 */

const path = require('path');
const fs = require('fs');
const { resolveCaptureMeDir } = require('./paths');

const CAPTURE_ME_DIR = resolveCaptureMeDir();
const DB_PATH = path.join(CAPTURE_ME_DIR, 'sqlite', 'capture.db');
const LOG_DIR = path.join(__dirname, 'logs');
const QUEUE_DIR = path.join(__dirname, 'queue');

// 确保目录存在
[LOG_DIR, QUEUE_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const LOG_FILE = path.join(LOG_DIR, `observe-${new Date().toISOString().split('T')[0]}.log`);

function log(level, msg, data = null) {
  const entry = {
    time: new Date().toISOString(),
    level,
    msg,
    ...(data && { data }),
  };
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    log('ERROR', '缺少参数');
    process.exit(1);
  }

  let signals;
  try {
    signals = JSON.parse(args[0]);
  } catch (e) {
    log('ERROR', 'JSON解析失败', { raw: args[0].slice(0, 100) });
    process.exit(1);
  }

  if (!Array.isArray(signals) || signals.length === 0) {
    log('INFO', '无信号，跳过');
    process.exit(0);
  }

  // 使用 capture-me 的 better-sqlite3
  let Database;
  try {
    Database = require(path.join(CAPTURE_ME_DIR, 'node_modules', 'better-sqlite3'));
  } catch (e) {
    log('ERROR', '无法加载 better-sqlite3', { error: e.message });
    // 暂存队列
    const queueFile = path.join(QUEUE_DIR, `failed-${Date.now()}.json`);
    fs.writeFileSync(queueFile, JSON.stringify({ signals, error: 'no better-sqlite3', at: new Date().toISOString() }));
    process.exit(1);
  }

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

    log('INFO', `写入成功: ${inserted.length} 条信号`, { count: inserted.length });
    process.exit(0);
  } catch (err) {
    log('ERROR', '数据库写入失败', { error: err.message });
    
    // 暂存队列
    const queueFile = path.join(QUEUE_DIR, `failed-${Date.now()}.json`);
    fs.writeFileSync(queueFile, JSON.stringify({ signals, error: err.message, at: new Date().toISOString() }));
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
