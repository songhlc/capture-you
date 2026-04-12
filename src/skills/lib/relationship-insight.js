#!/usr/bin/env node
/**
 * relationship-insight.js — 人际洞察
 *
 * 基于 relationship_tracking 表分析人际网络
 * - 谁是你最重要的关系
 * - 谁让你充电/消耗
 * - 哪些重要的人很久没提了
 * - 关系状态变化趋势
 */

const path = require('path');
const { getRelationships, syncRelationshipsFromNotes } = require('./db');

// ─── 人际洞察 ─────────────────────────────────────────────

/**
 * 获取完整的人际洞察报告
 */
function getRelationshipInsight() {
  // 先同步最近7天的笔记中的关系数据
  syncRelationshipsFromNotes(7);
  const relations = getRelationships();
  if (!relations || relations.length === 0) {
    return {
      summary: '暂无关系数据，继续记录时会自动积累。',
      topRelations: [],
      energyGivers: [],
      energyTakers: [],
      neglected: [],
    };
  }

  // 计算总分和情绪比
  const scored = relations.map(r => ({
    ...r,
    score: r.positive_count - r.negative_count,
    netEmotion: r.positive_count + r.negative_count > 0
      ? ((r.positive_count - r.negative_count) / (r.positive_count + r.negative_count)).toFixed(2)
      : '0',
  }));

  // 按提及次数排序，取前10
  const topRelations = scored
    .sort((a, b) => b.mention_count - a.mention_count)
    .slice(0, 10);

  // 让你充电的人：正面情绪多 且 互动足够多
  const energyGivers = scored
    .filter(r => r.positive_count > r.negative_count && r.positive_count >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // 让你消耗的人：负面情绪多 或 互动但负面比高
  const energyTakers = scored
    .filter(r => r.negative_count > 0)
    .sort((a, b) => b.negative_count - a.negative_count)
    .slice(0, 5);

  // 很久没提的人（30天以上）
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const neglected = scored
    .filter(r => r.last_mentioned && r.last_mentioned < thirtyDaysAgo)
    .sort((a, b) => new Date(a.last_mentioned) - new Date(b.last_mentioned))
    .slice(0, 5);

  // 总览
  const total = relations.length;
  const avgMentions = (relations.reduce((sum, r) => sum + r.mention_count, 0) / total).toFixed(1);
  const positiveRatio = total > 0
    ? ((relations.filter(r => r.positive_count > r.negative_count).length / total) * 100).toFixed(0)
    : 0;

  const summary = `目前共记录 ${total} 个重要关系，平均互动 ${avgMentions} 次，其中 ${positiveRatio}% 的关系为正面主导。`;

  return {
    summary,
    topRelations,
    energyGivers,
    energyTakers,
    neglected,
  };
}

/**
 * 格式化输出人际洞察报告
 */
function formatRelationshipReport() {
  const insight = getRelationshipInsight();
  const lines = [];

  lines.push('🔍 人际洞察报告');
  lines.push('─'.repeat(40));
  lines.push('');
  lines.push(insight.summary);
  lines.push('');

  if (insight.topRelations.length > 0) {
    lines.push('📊 互动最多的关系：');
    insight.topRelations.forEach((r, i) => {
      const emoji = r.score > 0 ? '🟢' : r.score < 0 ? '🔴' : '⚪';
      lines.push(`  ${emoji} ${r.person_name}（互动${r.mention_count}次，正${r.positive_count} / 负${r.negative_count}）`);
    });
    lines.push('');
  }

  if (insight.energyGivers.length > 0) {
    lines.push('⚡ 让你充电的人：');
    insight.energyGivers.forEach(r => {
      lines.push(`  ✅ ${r.person_name}（正${r.positive_count}次）`);
    });
    lines.push('');
  }

  if (insight.energyTakers.length > 0) {
    lines.push('🔋 让你消耗的人：');
    insight.energyTakers.forEach(r => {
      lines.push(`  ⚠️ ${r.person_name}（负${r.negative_count}次）`);
    });
    lines.push('');
  }

  if (insight.neglected.length > 0) {
    lines.push('🕐 很久没提的关系（可能需要关心一下）：');
    insight.neglected.forEach(r => {
      const days = Math.floor((Date.now() - new Date(r.last_mentioned).getTime()) / (24 * 60 * 60 * 1000));
      lines.push(`  💤 ${r.person_name}（${days}天前）`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

// CLI
if (require.main === module) {
  console.log(formatRelationshipReport());
}

module.exports = {
  getRelationshipInsight,
  formatRelationshipReport,
};
