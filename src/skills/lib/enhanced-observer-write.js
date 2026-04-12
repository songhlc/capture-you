#!/usr/bin/env node
/**
 * enhanced-observer-write.js — 增强观察器异步写入
 */

const path = require('path');
const fs = require('fs');

const CAPTURE_ME_DIR = path.join(process.env.HOME, '.claude', 'skills', 'capture-me');
const DB_PATH = path.join(CAPTURE_ME_DIR, 'sqlite', 'capture.db');
const LOG_DIR = path.join(CAPTURE_ME_DIR, 'logs');
const QUEUE_DIR = path.join(CAPTURE_ME_DIR, 'queue');

[LOG_DIR, QUEUE_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

const LOG_FILE = path.join(LOG_DIR, `enhanced-write-${new Date().toISOString().split('T')[0]}.log`);

function log(level, msg, data) {
  fs.appendFileSync(LOG_FILE, JSON.stringify({ time: new Date().toISOString(), level, msg, ...data }) + '\n');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    log('ERROR', '缺少参数');
    process.exit(1);
  }

  let input;
  try {
    input = JSON.parse(args[0]);
  } catch (e) {
    log('ERROR', 'JSON解析失败', { raw: args[0].slice(0, 100) });
    process.exit(1);
  }

  const { signals, meta } = input;
  if (!signals || signals.length === 0) {
    process.exit(0);
  }

  let Database;
  try {
    Database = require(path.join(CAPTURE_ME_DIR, 'node_modules', 'better-sqlite3'));
  } catch (e) {
    log('ERROR', 'DB not available', { error: e.message });
    process.exit(1);
  }

  const db = new Database(DB_PATH);

  try {
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
    `);

    const stmt = db.prepare(`
      INSERT INTO profile_signals (id, dimension, signal, confidence, source, conversation_id, detail, meta, created_at, last_reinforced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

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
        meta ? JSON.stringify(meta) : null
      );
    }

    log('INFO', `写入成功: ${signals.length} 条`);
    process.exit(0);
  } catch (err) {
    log('ERROR', '写入失败', { error: err.message });
    const queueFile = path.join(QUEUE_DIR, `enhanced-failed-${Date.now()}.json`);
    fs.writeFileSync(queueFile, JSON.stringify({ signals, meta, error: err.message }));
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
