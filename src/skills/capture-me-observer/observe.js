#!/usr/bin/env node
/**
 * observe.js — capture-me-observer
 *
 * 被动观察模式：静默异步写入 capture-me 数据库
 * - 异步写入，不阻塞对话
 * - 失败时暂存到队列文件，保留原始内容
 * - 定期检查并重试失败项
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// ─── 路径配置 ─────────────────────────────────────────────

const CAPTURE_ME_DIR = path.join(process.env.HOME, '.claude', 'skills', 'capture-me');
const OBSERVER_DIR = __dirname;
const db = require(path.join(CAPTURE_ME_DIR, 'lib', 'db.js'));
const QUEUE_DIR = path.join(OBSERVER_DIR, 'queue');     // 失败队列
const LOG_DIR = path.join(OBSERVER_DIR, 'logs');         // 日志目录

// 确保目录存在
[QUEUE_DIR, LOG_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ─── 日志 ─────────────────────────────────────────────────

const LOG_FILE = path.join(LOG_DIR, `observe-${new Date().toISOString().split('T')[0]}.log`);

function log(level, msg, data = null) {
  const entry = {
    time: new Date().toISOString(),
    level,
    msg,
    ...(data && { data: data.slice ? data.slice(0, 200) : data }),
  };
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  if (level === 'ERROR') {
    console.error(`[OBSERVER ERROR] ${msg}`, data ? `(${JSON.stringify(data).slice(0, 100)})` : '');
  }
}

// ─── 异步写入（静默）─────────────────────────────────────

/**
 * 静默异步写入信号
 * @param {Object} signal - { dimension, signal, confidence, source }
 * @param {string} originalJson - 原始传入JSON（失败时保留）
 */
function writeAsync(signal, originalJson = null) {
  spawn('node', [
    path.join(__dirname, 'write-signal.js'),
    JSON.stringify(signal),
    originalJson || '',
  ], {
    detached: true,
    stdio: 'ignore',
  }).unref();
}

/**
 * 同步写入（内部使用，或 CLI 调用）
 */
function writeSync(signal, originalJson = null) {
  try {
    if (signal.type === 'idea') {
      const id = db.insertIdea(signal);
      log('INFO', '灵感记录成功', { id: id.slice(0, 15), dimension: signal.dimension });
      return { success: true, id, type: 'idea' };
    } else {
      const id = db.insertProfileSignal(signal);
      log('INFO', '信号写入成功', { id: id.slice(0, 12), dimension: signal.dimension });
      return { success: true, id };
    }
  } catch (err) {
    const queueItem = { signal, originalJson, error: err.message, failedAt: new Date().toISOString(), retryCount: 0 };
    const queueFile = path.join(QUEUE_DIR, `failed-${Date.now()}-${Math.random().toString(36).substr(2, 6)}.json`);
    fs.writeFileSync(queueFile, JSON.stringify(queueItem, null, 2));
    log('ERROR', '写入失败，已暂存队列', { file: queueFile, error: err.message });
    return { success: false, queueFile };
  }
}

// ─── 队列重试 ─────────────────────────────────────────────

/**
 * 重试队列中的失败项
 * @param {number} maxRetries - 最大重试次数
 */
function retryFailed(maxRetries = 3) {
  const files = fs.readdirSync(QUEUE_DIR).filter(f => f.startsWith('failed-') && f.endsWith('.json'));
  if (files.length === 0) {
    console.log('✅ 队列为空，无待重试项');
    return;
  }

  console.log(`📋 发现 ${files.length} 条待重试记录`);
  let success = 0, failed = 0;

  for (const file of files) {
    const filePath = path.join(QUEUE_DIR, file);
    const item = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    if (item.retryCount >= maxRetries) {
      console.log(`⏭️  跳过（已达最大重试）: ${file}`);
      continue;
    }

    try {
      const result = writeSync(item.signal, item.originalJson);
      if (result.success) {
        fs.unlinkSync(filePath);
        success++;
        log('INFO', '重试成功', { file });
      } else {
        // 再次失败，更新重试计数
        item.retryCount++;
        item.lastRetry = new Date().toISOString();
        fs.writeFileSync(filePath, JSON.stringify(item, null, 2));
        failed++;
      }
    } catch (err) {
      item.retryCount++;
      item.lastRetry = new Date().toISOString();
      item.lastError = err.message;
      fs.writeFileSync(filePath, JSON.stringify(item, null, 2));
      failed++;
    }
  }

  console.log(`📊 重试完成: ${success} 成功, ${failed} 失败`);
  return { success, failed };
}

/**
 * 查看队列状态
 */
function queueStatus() {
  const files = fs.readdirSync(QUEUE_DIR).filter(f => f.startsWith('failed-') && f.endsWith('.json'));
  if (files.length === 0) {
    return { count: 0, items: [] };
  }

  const items = files.map(f => {
    const item = JSON.parse(fs.readFileSync(path.join(QUEUE_DIR, f), 'utf8'));
    return {
      file: f,
      dimension: item.signal?.dimension,
      signal: item.signal?.signal?.slice(0, 50),
      error: item.error,
      retryCount: item.retryCount,
      failedAt: item.failedAt,
    };
  });

  return { count: files.length, items };
}

// ─── 统计 ─────────────────────────────────────────────────

function getStats() {
  return db.getProfileSignalStats();
}

// ─── CLI 入口 ─────────────────────────────────────────────

const colors = { green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[36m', reset: '\x1b[0m', dim: '\x1b[2m' };
const log_cli = (c, p, ...a) => console.log(`${colors[c]}${p}${colors.reset}`, ...a);

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // 默认：显示状态
    const s = getStats();
    const q = queueStatus();

    log_cli('blue', '📊 capture-me Observer');
    console.log('─'.repeat(40));
    log_cli('green', `  总信号: ${s.total}  |  今日新增: ${s.today}`);
    for (const dim of s.byDimension) {
      log_cli('yellow', `  ${dim.dimension}: ${dim.c}`);
    }
    console.log('─'.repeat(40));
    log_cli('blue', '  监听状态: ON');
    console.log('');
    log_cli('blue', '  队列状态:');
    if (q.count === 0) {
      log_cli('green', '  ✅ 无待重试项');
    } else {
      log_cli('yellow', `  ⚠️  ${q.count} 条待重试`);
      q.items.forEach(item => {
        log_cli('dim', `    - [${item.dimension}] ${item.signal}... (错误: ${item.error})`);
      });
    }
    console.log('');
    log_cli('dim', '  数据库: ~/.claude/skills/capture-me/sqlite/capture.db');
    console.log('');
    log_cli('dim', '  用法:');
    log_cli('dim', '    node observe.js --stat             # 统计信息');
    log_cli('dim', '    node observe.js --retry            # 重试失败队列');
    log_cli('dim', '    node observe.js --queue           # 查看队列');
    log_cli('dim', '    node observe.js --write \'{"dimension":"preference","signal":"测试"}\'  # 写入信号');
    return;
  }

  const cmd = args[0];

  if (cmd === '--stat') {
    console.log(JSON.stringify(getStats(), null, 2));
    return;
  }

  if (cmd === '--queue') {
    console.log(JSON.stringify(queueStatus(), null, 2));
    return;
  }

  if (cmd === '--retry') {
    retryFailed();
    return;
  }

  // 写入信号
  let signal;
  try {
    signal = JSON.parse(args.join(' '));
  } catch (e) {
    log_cli('yellow', '⚠️ JSON 解析失败:', e.message);
    process.exit(1);
  }

  if (signal.type === 'idea') {
    if (!signal.raw_text) {
      log_cli('yellow', '⚠️ 缺少必填字段: raw_text');
      process.exit(1);
    }
  } else {
    if (!signal.dimension || !signal.signal) {
      log_cli('yellow', '⚠️ 缺少必填字段: dimension, signal');
      process.exit(1);
    }
  }

  const result = writeSync(signal, args.join(' '));
  if (result.success) {
    log_cli('green', `✓ 已记录 [${signal.dimension}] ${signal.signal}`);
  } else {
    log_cli('yellow', `⚠️ 写入失败，已暂存队列: ${result.queueFile}`);
  }
}

main();
