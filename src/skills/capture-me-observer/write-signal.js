#!/usr/bin/env node
/**
 * write-signal.js — 静默异步写入（由 observe.js spawn 调用）
 * 
 * 这个文件由 observe.js 的 writeAsync() spawn，不阻塞，不等待结果
 */

const path = require('path');
const fs = require('fs');

const CAPTURE_ME_DIR = path.join(process.env.HOME, '.claude', 'skills', 'capture-me');
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, `write-${new Date().toISOString().split('T')[0]}.log`);

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function log(level, msg, data) {
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

  let signal;
  let originalJson = '';

  try {
    signal = JSON.parse(args[0]);
    originalJson = args[1] || args[0];
  } catch (e) {
    log('ERROR', 'JSON解析失败', { raw: args[0].slice(0, 100) });
    process.exit(1);
  }

  if (!signal.dimension || !signal.signal) {
    log('ERROR', '缺少必填字段', { signal });
    process.exit(1);
  }

  // 异步写入
  const Database = require(path.join(CAPTURE_ME_DIR, 'node_modules', 'better-sqlite3'));
  const db = new Database(path.join(CAPTURE_ME_DIR, 'sqlite', 'capture.db'));

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
    `);

    const stmt = db.prepare(`
      INSERT INTO profile_signals (id, dimension, signal, confidence, source, conversation_id, created_at, last_reinforced)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    const id = signal.id || `sig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    stmt.run(
      id,
      signal.dimension,
      signal.signal,
      signal.confidence || 0.5,
      signal.source || 'observe',
      signal.conversation_id || null
    );

    log('INFO', '写入成功', { id: id.slice(0, 12), dimension: signal.dimension });
    process.exit(0);
  } catch (err) {
    // 写入失败，暂存队列
    const queueDir = path.join(__dirname, 'queue');
    if (!fs.existsSync(queueDir)) fs.mkdirSync(queueDir, { recursive: true });

    const queueItem = {
      signal,
      originalJson,
      error: err.message,
      failedAt: new Date().toISOString(),
      retryCount: 0,
    };

    const queueFile = path.join(queueDir, `failed-${Date.now()}-${Math.random().toString(36).substr(2, 6)}.json`);
    fs.writeFileSync(queueFile, JSON.stringify(queueItem, null, 2));

    log('ERROR', '写入失败，已暂存', { queueFile, error: err.message });
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
