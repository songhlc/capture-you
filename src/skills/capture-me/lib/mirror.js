#!/usr/bin/env node
/**
 * mirror.js — 认知镜子核心模块
 * Phase 1: 承诺追踪 + 言行矛盾检测 + /mirror 命令入口
 */

const path = require('path');
const SKILL_DIR = path.join(__dirname, '..');
const { extractCommitment, insertCommitment, getUnresolvedCommitments, incrementCommitmentTrigger, resolveCommitment, insertMirrorAlert, getRecentAlerts, dismissAlert } = require('./db');

// ─── 承诺检测与矛盾触发 ────────────────────────────────────

const CONTRADICTION_THRESHOLD = 3; // 连续3次矛盾触发提醒

/**
 * 检查单条记录是否包含承诺语句，如果是则入库
 */
function checkAndExtractCommitments(note) {
  const commitment = extractCommitment(note.raw_text);
  if (!commitment) return null;

  const id = insertCommitment({
    commitment_text: commitment.original,
    created_at: `${note.date}T${note.time}:00`,
    source_note_id: note.id,
    target_behavior: commitment.behavior,
    triggered_count: 0,
    resolved: 0,
  });

  return id;
}

/**
 * 检测矛盾：承诺 vs 后续实际行为
 * 简单逻辑：如果承诺了X行为，但后续记录中出现了"没做到"类描述
 */
const CONTRADICTION_PATTERNS = [
  /没跑成|没做到|没去|没完成|又没|忘记|耽误了|太忙|来不及/,
  /还是没|仍然没|依然没/,
];

const FULFILLMENT_PATTERNS = [
  /做到了?|完成了|去跑了|去健身了|达标了/,
];

function detectContradiction(commitment, recentNotes) {
  const behavior = commitment.target_behavior || '';
  let contradictionCount = 0;
  let fulfilled = false;

  for (const note of recentNotes) {
    // 跳过承诺本身
    if (note.id === commitment.source_note_id) continue;

    const text = note.raw_text;

    // 检查是否有"没做到"类描述
    for (const pattern of CONTRADICTION_PATTERNS) {
      if (pattern.test(text) && (behavior.length < 3 || text.includes(behavior))) {
        contradictionCount++;
      }
    }

    // 检查是否已兑现
    for (const pattern of FULFILLMENT_PATTERNS) {
      if (pattern.test(text) && (behavior.length < 3 || text.includes(behavior))) {
        fulfilled = true;
      }
    }
  }

  return { contradictionCount, fulfilled };
}

/**
 * 扫描所有未解决承诺，检测矛盾并触发通知
 */
function scanCommitmentsForContradictions() {
  const commitments = getUnresolvedCommitments();
  const triggered = [];

  for (const commitment of commitments) {
    const { contradictionCount, fulfilled } = detectContradiction(commitment, getRecentNotes(10));

    if (fulfilled) {
      // 承诺已兑现，标记为解决
      resolveCommitment(commitment.id);
      triggered.push({ type: 'resolved', commitment });
      continue;
    }

    if (contradictionCount > commitment.triggered_count) {
      // 更新触发计数
      incrementCommitmentTrigger(commitment.id);

      // 检查是否达到阈值
      const newCount = contradictionCount;
      if (newCount >= CONTRADICTION_THRESHOLD) {
        const alert = {
          alert_type: 'contradiction',
          title: `承诺连续${newCount}次未兑现`,
          body: buildContradictionAlert(commitment, newCount),
        };
        insertMirrorAlert(alert);
        triggered.push({ type: 'alert', commitment, alert });
      }
    }
  }

  return triggered;
}

function buildContradictionAlert(commitment, count) {
  const shortText = commitment.commitment_text.length > 50
    ? commitment.commitment_text.slice(0, 47) + '...'
    : commitment.commitment_text;

  return `你已经连续第${count}次说"${shortText}"但没做到。`;
}

// ─── 辅助函数 ────────────────────────────────────────────

function getRecentNotes(limit = 10) {
  const { getNotesByDateRange } = require('./db');
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return getNotesByDateRange(start.toISOString().split('T')[0], end.toISOString().split('T')[0])
    .slice(-limit);
}

// ─── /mirror 命令 ────────────────────────────────────────

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  red: '\x1b[31m',
};

function log(color, ...args) {
  console.log(`${color}${args.join(' ')}${colors.reset}`);
}

function printBanner() {
  log(colors.blue, '╔══════════════════════════════════════════════════════╗');
  log(colors.blue, '║  🪞 认知镜子 — Mirror v0.1                         ║');
  log(colors.blue, '╚══════════════════════════════════════════════════════╝');
}

function printHelp() {
  printBanner();
  console.log('');
  log(colors.green, '  /mirror                   — 显示帮助');
  log(colors.green, '  /mirror status           — 查看承诺状态');
  log(colors.green, '  /mirror alerts            — 查看最近提醒');
  log(colors.green, '  /mirror check             — 手动扫描矛盾');
  log(colors.green, '  /mirror dismiss <id>      — 关闭某条提醒');
  log(colors.green, '  /mirror report            — 生成周报（文字版）');
  console.log('');
}

function printStatus() {
  const commitments = getUnresolvedCommitments();
  const alerts = getRecentAlerts(5);

  log(colors.blue, '【承诺状态】');
  if (commitments.length === 0) {
    log(colors.dim, '  暂无未解决承诺');
  } else {
    for (const c of commitments) {
      const icon = c.triggered_count >= CONTRADICTION_THRESHOLD ? `${colors.red}⚠️` : `${colors.dim}○`;
      const shortText = c.commitment_text.length > 40
        ? c.commitment_text.slice(0, 37) + '...'
        : c.commitment_text;
      log(icon, `${colors.reset} ${shortText} [触发${c.triggered_count}次]`);
    }
  }

  console.log('');

  log(colors.blue, '【最近提醒】');
  if (alerts.length === 0) {
    log(colors.dim, '  暂无活跃提醒');
  } else {
    for (const a of alerts) {
      const typeIcon = a.alert_type === 'contradiction' ? `${colors.red}⚠️` : `${colors.yellow}ℹ️`;
      log(typeIcon, `${colors.reset} ${a.title}`);
      log(colors.dim, `   ${a.body}`);
    }
  }
}

function printReport() {
  const { getNotesByDateRange } = require('./db');
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);

  const notes = getNotesByDateRange(start.toISOString().split('T')[0], end.toISOString().split('T')[0]);
  const commitments = getUnresolvedCommitments();

  log(colors.blue, '📅 本周认知报告');
  console.log('─'.repeat(48));

  // 承诺概览
  log(colors.yellow, '【承诺追踪】');
  if (commitments.length === 0) {
    log(colors.dim, '  本周无新增承诺');
  } else {
    for (const c of commitments) {
      const icon = c.triggered_count >= CONTRADICTION_THRESHOLD ? `${colors.red}⚠️` : `${colors.green}○`;
      log(icon, `${colors.reset} "${c.commitment_text.slice(0, 50)}"`);
    }
  }

  console.log('');

  // 记录概览
  log(colors.yellow, '【本周记录】');
  log(colors.dim, `  共 ${notes.length} 条记录`);

  // 按类别统计
  const categories = {};
  for (const n of notes) {
    const cat = n.category || 'uncategorized';
    categories[cat] = (categories[cat] || 0) + 1;
  }
  for (const [cat, count] of Object.entries(categories)) {
    log(colors.dim, `  ${cat}: ${count}条`);
  }

  console.log('');
  log(colors.blue, '─'.repeat(48));
  log(colors.dim, `  生成时间: ${new Date().toLocaleString('zh-CN')}`);
}

// ─── CLI 主入口 ──────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  switch (cmd) {
    case 'status':
      printStatus();
      break;

    case 'alerts':
      const alerts = getRecentAlerts(10);
      printBanner();
      console.log('');
      for (const a of alerts) {
        const typeIcon = a.alert_type === 'contradiction' ? `${colors.red}⚠️` : `${colors.yellow}ℹ️`;
        log(typeIcon, `${colors.reset} [${a.alert_type}] ${a.title}`);
        log(colors.dim, `   ${a.body}`);
        log(colors.dim, `   ID: ${a.id} | ${a.sent_at}`);
        console.log('');
      }
      break;

    case 'check':
      printBanner();
      console.log('');
      log(colors.yellow, '  扫描矛盾中...');
      const results = scanCommitmentsForContradictions();
      if (results.length === 0) {
        log(colors.green, '  ✓ 未检测到新的矛盾或兑现');
      } else {
        for (const r of results) {
          if (r.type === 'resolved') {
            log(colors.green, `  ✓ 承诺已兑现: "${r.commitment.commitment_text.slice(0, 40)}"`);
          } else {
            log(colors.red, `  ⚠️ ${r.alert.title}`);
            log(colors.dim, `     ${r.alert.body}`);
          }
        }
      }
      break;

    case 'dismiss':
      if (!args[1]) {
        log(colors.red, '  用法: /mirror dismiss <alert_id>');
      } else {
        dismissAlert(args[1]);
        log(colors.green, `  ✓ 提醒 ${args[1]} 已关闭`);
      }
      break;

    case 'report':
      printReport();
      break;

    default:
      printHelp();
  }
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}

module.exports = {
  checkAndExtractCommitments,
  scanCommitmentsForContradictions,
  extractCommitment,
};
