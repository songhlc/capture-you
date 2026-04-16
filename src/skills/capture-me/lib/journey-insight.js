#!/usr/bin/env node
/**
 * journey-insight.js — 旅程记录
 *
 * "知己，记住我去过的地方，点亮全世界"
 *
 * 功能：
 * - 记录去过的地方
 * - 查看旅程地图式报告
 * - 统计去过多少城市/国家
 */

const { insertJourney, getJourneys, getJourneyStats } = require('./db');

// ─── 旅程记录 ─────────────────────────────────────────────

/**
 * 添加一个地点
 */
function addPlace(placeName, options = {}) {
  const id = insertJourney({
    place_name: placeName,
    place_type: options.type || guessPlaceType(placeName),
    location: options.location || null,
    visited_at: options.visited_at || new Date().toISOString().split('T')[0],
    notes: options.notes || null,
    mood: options.mood || null,
  });
  return id;
}

/**
 * 根据名称猜测地点类型
 */
function guessPlaceType(name) {
  const t = name || '';
  if (/省|市|县|镇|村/.test(t)) return '国内城市';
  if (/日本|韩国|泰国|新加坡|美国|英国|法国|德国|意大利|澳洲|新西兰|加拿大|马来|印尼|越南|菲律宾/.test(t)) return '国家';
  if (/北京|上海|深圳|广州|杭州|成都|重庆|武汉|西安|南京|苏州|厦门|福州|宁波|青岛|天津|大连|沈阳|长沙|济南|郑州|昆明|哈尔滨|长春|石家庄|太原|南昌|合肥|贵阳|南宁|海口|拉萨|兰州|银川|西宁|乌鲁木齐|呼市/.test(t)) return '国内城市';
  return '其他';
}

/**
 * 获取旅程地图报告
 */
function getJourneyReport() {
  const journeys = getJourneys(200);
  const stats = getJourneyStats();

  if (!journeys || journeys.length === 0) {
    return {
      total: 0,
      map: '🌍',
      message: '还没有记录任何地方。说一声"知己，我去了xxx"，帮你记下来。',
      places: [],
      byType: [],
    };
  }

  // 按城市和国家分组
  const domestic = journeys.filter(j => j.place_type === '国内城市');
  const international = journeys.filter(j => j.place_type === '国家');

  // 去重统计（同一个地点可能多次去）
  const uniquePlaces = {};
  journeys.forEach(j => {
    if (!uniquePlaces[j.place_name]) {
      uniquePlaces[j.place_name] = { ...j, count: 0 };
    }
    uniquePlaces[j.place_name].count++;
  });
  const uniqueList = Object.values(uniquePlaces);

  // 最多去过的地方
  const mostVisited = [...uniqueList].sort((a, b) => b.count - a.count).slice(0, 5);

  // 最近去过
  const recent = journeys.slice(0, 5);

  // 构建地图可视化（用文字符号）
  const mapSymbols = {
    '国内城市': '📍',
    '国家': '🌏',
    '其他': '📌',
  };

  const message = journeys.length === 0
    ? '还没有记录任何地方。说一声"知己，我去了xxx"，帮你记下来。'
    : `共记录 ${journeys.length} 次足迹，${uniqueList.length} 个不同地方`;

  return {
    total: journeys.length,
    uniqueTotal: uniqueList.length,
    message,
    domestic: domestic.length,
    international: international.length,
    mostVisited,
    recent,
    places: journeys.slice(0, 20),
    byType: stats.byType,
  };
}

/**
 * 格式化旅程报告（文字版）
 */
function formatJourneyReport() {
  const report = getJourneyReport();
  const lines = [];

  lines.push('🌍 知己·旅程记录');
  lines.push('═'.repeat(40));
  lines.push('');
  lines.push(report.message);
  lines.push('');

  if (report.total === 0) {
    lines.push('📌 示例用法：');
    lines.push('   知己，我去了日本东京');
    lines.push('   知己，记一下我去了云南大理');
    lines.push('   知己，记录一下这周出差去了深圳');
    lines.push('');
    lines.push('说出来就行，地点、时间、心情都可以顺便记。');
    return lines.join('\n');
  }

  lines.push(`📊 统计：`);

  // 分类计数
  const typeCount = {};
  report.places.forEach(p => {
    typeCount[p.place_type] = (typeCount[p.place_type] || 0) + 1;
  });
  Object.entries(typeCount).forEach(([type, count]) => {
    lines.push(`   ${count} 次 ${type}`);
  });
  lines.push('');

  if (report.recent && report.recent.length > 0) {
    lines.push('📅 最近去过：');
    report.recent.forEach(j => {
      const emoji = j.place_type === '国内城市' ? '📍' : j.place_type === '国家' ? '🌏' : '📌';
      const times = j.count > 1 ? ` (${j.count}次)` : '';
      lines.push(`   ${emoji} ${j.place_name}${times} - ${j.visited_at}`);
    });
    lines.push('');
  }

  if (report.mostVisited && report.mostVisited.length > 0 && report.mostVisited[0].count > 1) {
    lines.push('⭐ 常去的地方：');
    report.mostVisited.filter(p => p.count > 1).forEach(j => {
      lines.push(`   🔄 ${j.place_name} (${j.count}次)`);
    });
    lines.push('');
  }

  // 点亮地图
  lines.push('🗺️  点亮记录：');
  const uniqueNames = [...new Set(report.places.map(p => p.place_name))];
  lines.push(`   ${uniqueNames.join(' · ')}`);
  lines.push('');
  lines.push('─────────────────────────────────');
  lines.push('「知己，更懂你的 AI 助手」');

  return lines.join('\n');
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(formatJourneyReport());
  } else if (args[0] === 'add' && args[1]) {
    const placeName = args.slice(2).join(' ') || args[1];
    addPlace(args[1]);
    console.log(`✅ 已记录：${args[1]}`);
  } else {
    console.log(formatJourneyReport());
  }
}

module.exports = {
  addPlace,
  getJourneyReport,
  formatJourneyReport,
};
