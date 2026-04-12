#!/usr/bin/env node
/**
 * observe-async.js — 静默异步写入（由 observe-core.js spawn 调用）
 */

const path = require('path');
const SKILL_DIR = path.join(__dirname, '..');
const fs = require('fs');

const CAPTURE_ME_DIR = SKILL_DIR;
const DB_PATH = path.join(CAPTURE_ME_DIR, 'sqlite', 'capture.db');
const LOG_DIR = path.join(CAPTURE_ME_DIR, 'logs');
const QUEUE_DIR = path.join(CAPTURE_ME_DIR, 'queue');

[LOG_DIR, QUEUE_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

const LOG_FILE = path.join(LOG_DIR, `observe-async-${new Date().toISOString().split('T')[0]}.log`);

function log(level, msg, data) {
  fs.appendFileSync(LOG_FILE, JSON.stringify({ time: new Date().toISOString(), level, msg, ...(data && { data }) }) + '\n');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) { log('ERROR', '缺少参数'); process.exit(1); }

  let input;
  try {
    input = JSON.parse(args[0]);
  } catch (e) {
    log('ERROR', 'JSON解析失败', { raw: args[0].slice(0, 100) });
    process.exit(1);
  }

  // 支持两种格式：
  // 1. { text, source, conversation_id } - 从文本提取
  // 2. [ { dimension, signal, ... }, ... ] - 直接信号数组
  let signals;
  let source = 'observe';

  if (input.text && typeof input.text === 'string') {
    // 格式1：从文本提取
    const { extractSignals } = require('./observe-core');
    signals = extractSignals(input.text, input.source || 'openclaw');
    source = input.source || 'openclaw';
  } else if (Array.isArray(input)) {
    // 格式2：直接信号数组
    signals = input;
  } else {
    log('ERROR', '未知输入格式');
    process.exit(1);
  }

  if (!signals || signals.length === 0) {
    process.exit(0);
  }

  const Database = require(path.join(CAPTURE_ME_DIR, 'node_modules', 'better-sqlite3'));
  const db = new Database(DB_PATH);

  try {
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

    for (const signal of signals) {
      if (!signal.dimension || !signal.signal) continue;
      const id = signal.id || `sig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      stmt.run(id, signal.dimension, signal.signal, signal.confidence || 0.5, signal.source || 'observe', signal.conversation_id || null);
    }

    log('INFO', `写入成功: ${signals.length} 条`, { source: signals[0]?.source });
    process.exit(0);
  } catch (err) {
    log('ERROR', '写入失败', { error: err.message });
    const queueFile = path.join(QUEUE_DIR, `failed-${Date.now()}.json`);
    fs.writeFileSync(queueFile, JSON.stringify({ signals, error: err.message, at: new Date().toISOString() }));
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
