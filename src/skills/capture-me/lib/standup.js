#!/usr/bin/env node
/**
 * standup.js — 站会助手 v1.0
 *
 * 录音/文本 → 标准站会报告
 *
 * 用法:
 *   node standup.js "原始站会记录文本"
 *   node standup.js --demo
 *   node standup.js --format "简短描述"
 *   node standup.js --file ./meeting.txt
 */

const path = require('path');
const fs = require('fs');

// ─── 路径配置 ─────────────────────────────────────────────

const SKILL_DIR = path.join(__dirname, '..');
const LOG_DIR = path.join(SKILL_DIR, 'logs');
const TEMPLATES_DIR = path.join(SKILL_DIR, 'templates');

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// ─── 日志 ─────────────────────────────────────────────────

const LOG_FILE = path.join(LOG_DIR, `standup-${new Date().toISOString().split('T')[0]}.log`);

function log(msg, data) {
  const entry = { time: new Date().toISOString(), msg, ...(data && { data }) };
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
}

// ─── 站会报告模板 ─────────────────────────────────────────

const STANDUP_TEMPLATE = `
## 📋 {date} 站会报告

### 昨日进展
{completed}

### 今日计划
{planned}

### 风险/阻塞
{blockers}

### 备注
{notes}
`;

// ─── 关键信息提取 ─────────────────────────────────────────

const PATTERNS = {
  // 项目/任务提及
  project: [/(?:项目|专项|任务|需求|功能|模块)[:：]?\s*["""]?([^""",，,。\n]+)/g, /["""]?([^""",，,。\n]+)\s*(?:进行中|已完成|待启动|开发|测试|上线)/g],
  // 人员提及（中文姓名/昵称）
  person: [/(?:@|负责人|主办|主导)[:：]?\s*([^\s，,。\n：:]{2,4})/g, /([^\s，,。\n：:]{2,4})\s*(?:负责|主办|主导|跟进)/g],
  // 百分比进度
  progress: [/(\d+)%/, /完成\s*(\d+)/, /进度\s*[是为]?\s*(\d+)/, /(\d+)\/(\d+)/],
  // 风险/阻塞
  blocker: [/(?:阻塞|卡点|风险|问题|困难|阻碍|blocker|block|issue)[:：]?\s*([^。，,\n]+)/gi, /需要|等|等.*确认|等.*支持|等.*资源/g],
  // 完成的工作
  completed: [/已完成|搞定了|完成了|做好了|交付了|上线了|解决了|搞定了|结束了/g],
  // 今日计划
  today_plan: [/(?:今天|今日|今天计划|计划)[:：]?\s*([^。，,\n]+)/gi],
};

// ─── 提取函数 ─────────────────────────────────────────────

function extractProjects(text) {
  const projects = [];
  const seen = new Set();

  // 迭代专项匹配
  const iterPattern = /(?:\d{4}|\d{2}\d{2})迭代\s*[\u4e00-\u9fa5a-zA-Z0-9]+/g;
  let match;
  while ((match = iterPattern.exec(text)) !== null) {
    const name = match[0].trim().slice(0, 50);
    if (name && !seen.has(name) && name.length > 4) {
      seen.add(name);
      projects.push({ name, raw: match[0], type: 'iteration' });
    }
  }

  // 项目/任务/需求关键词后跟的内容
  const taskKeywords = /(?:项目|专项|任务|需求|功能|模块)[:：\s]*([\u4e00-\u9fa5a-zA-Z0-9\-]{3,30})/g;
  while ((match = taskKeywords.exec(text)) !== null) {
    const name = match[1].trim().slice(0, 50);
    if (name && !seen.has(name) && name.length > 2 && !/\d+%/.test(name)) {
      seen.add(name);
      projects.push({ name, raw: match[0], type: 'task' });
    }
  }

  // 如果没匹配到，尝试从"完成了XXX"、"开发XXX"等推断
  if (projects.length === 0) {
    const completedPattern = /(?:完成了|开发了|做好了)\s*([\u4e00-\u9fa5a-zA-Z0-9]{4,20})(?:模块|功能|项目|系统)/g;
    while ((match = completedPattern.exec(text)) !== null) {
      const name = match[0].trim().slice(0, 50);
      if (name && !seen.has(name)) {
        seen.add(name);
        projects.push({ name, raw: match[0], type: 'inferred' });
      }
    }
  }

  return projects;
}

function extractPersons(text) {
  const persons = [];
  const seen = new Set();

  for (const pattern of PATTERNS.person) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1].trim();
      // 过滤掉太短或太长的，非人名的
      if (name.length >= 2 && name.length <= 5 && !seen.has(name)) {
        const blacklist = ['项目', '任务', '需求', '功能', '模块', '今天', '今日', '昨天', '明天', '计划'];
        if (!blacklist.includes(name)) {
          seen.add(name);
          persons.push({ name, raw: match[0] });
        }
      }
    }
  }

  return persons;
}

function extractProgress(text) {
  const progresses = [];

  // 百分比
  let match = text.match(/(\d+)%/);
  if (match) {
    progresses.push({ value: parseInt(match[1]), type: 'percent', raw: match[0] });
  }

  // X/Y 格式
  const xyMatch = text.match(/(\d+)\/(\d+)/);
  if (xyMatch) {
    progresses.push({
      value: Math.round(parseInt(xyMatch[1]) / parseInt(xyMatch[2]) * 100),
      current: parseInt(xyMatch[1]),
      total: parseInt(xyMatch[2]),
      type: 'fraction',
      raw: xyMatch[0],
    });
  }

  return progresses;
}

function extractBlockers(text) {
  const blockers = [];
  const seen = new Set();

  for (const pattern of PATTERNS.blocker) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(text)) !== null) {
      const content = match[1] || match[0];
      const cleaned = content.trim().slice(0, 100);
      if (cleaned && !seen.has(cleaned) && cleaned.length > 3) {
        seen.add(cleaned);
        blockers.push({ content: cleaned, raw: match[0], type: pattern.source.includes('blocker') ? 'explicit' : 'implicit' });
      }
    }
  }

  // 检测"等"字句（隐式阻塞）
  const waitPatterns = [
    /等\s*([^\s，,。\n]{2,10})\s*(确认|通过|审批|资源|支持|反馈|回复)/g,
    /在\s*等\s*([^\s，,。\n]{2,10})/g,
  ];

  for (const p of waitPatterns) {
    let match;
    while ((match = p.exec(text)) !== null) {
      const content = `等待${match[1]}${match[2] || ''}`;
      if (!seen.has(content)) {
        seen.add(content);
        blockers.push({ content, raw: match[0], type: 'wait' });
      }
    }
  }

  return blockers;
}

function extractCompleted(text) {
  const completed = [];

  const sentences = text.split(/[。！？\n]/);
  for (const s of sentences) {
    if (/已完成|搞定了|完成了|做好了|交付了|上线了|解决了|结束了/.test(s)) {
      const cleaned = s.trim().replace(/^[,，、\s]+/, '').slice(0, 100);
      if (cleaned.length > 3) {
        completed.push(cleaned);
      }
    }
  }

  return completed;
}

function extractTodayPlan(text) {
  const plans = [];

  // 找"今天/今日/今天计划"后面的内容
  const patterns = [
    /(?:今天|今日|今天计划)[:：]?\s*([^。！？\n]+)/gi,
    /计划\s*(?:做|完成|开发|开始|推进)\s*([^。！？\n]+)/gi,
  ];

  for (const p of patterns) {
    let match;
    while ((match = p.exec(text)) !== null) {
      const cleaned = match[1].trim().slice(0, 100);
      if (cleaned.length > 3) {
        plans.push(cleaned);
      }
    }
  }

  // 如果没找到，尝试从上下文推断
  if (plans.length === 0) {
    const sentences = text.split(/[。！？\n]/).filter(s => s.trim().length > 5 && /要|会|准备/.test(s));
    for (const s of sentences.slice(0, 3)) {
      plans.push(s.trim().slice(0, 100));
    }
  }

  return plans;
}

// ─── 分析主函数 ───────────────────────────────────────────

function analyzeStandup(rawText) {
  if (!rawText || typeof rawText !== 'string' || rawText.trim().length < 3) {
    return { error: '文本太短或无效', items: {} };
  }

  const text = rawText.trim().replace(/\r\n/g, '\n');
  const items = {
    projects: extractProjects(text),
    persons: extractPersons(text),
    progress: extractProgress(text),
    blockers: extractBlockers(text),
    completed: extractCompleted(text),
    todayPlan: extractTodayPlan(text),
  };

  return {
    raw: rawText.slice(0, 200),
    items,
    summary: {
      projectCount: items.projects.length,
      personCount: items.persons.length,
      blockerCount: items.blockers.length,
      hasProgress: items.progress.length > 0,
      completedCount: items.completed.length,
      planCount: items.todayPlan.length,
    },
  };
}

// ─── 格式化输出 ───────────────────────────────────────────

function formatStandupReport(analysis, options = {}) {
  const {
    date = new Date().toLocaleDateString('zh-CN'),
    format = 'markdown', // markdown | text | json
    template = null,
  } = options;

  if (analysis.error) {
    return `⚠️ ${analysis.error}`;
  }

  const { items, summary } = analysis;

  // 如果用自定义模板
  if (template) {
    return template
      .replace('{date}', date)
      .replace('{completed}', items.completed.join('\n') || '（无）')
      .replace('{planned}', items.todayPlan.join('\n') || '（无）')
      .replace('{blockers}', items.blockers.map(b => `· ${b.content}`).join('\n') || '（无）')
      .replace('{notes}', `涉及项目: ${items.projects.map(p => p.name).join(', ') || '（无）'}`);
  }

  // 标准 Markdown 格式
  if (format === 'json') {
    return JSON.stringify({ date, ...items, summary }, null, 2);
  }

  const lines = [
    `## 📋 ${date} 站会报告`,
    '',
  ];

  // 进度概览
  if (summary.hasProgress) {
    const p = items.progress[0];
    if (p.type === 'percent') {
      lines.push(`> 整体进度：**${p.value}%**`);
    } else if (p.type === 'fraction') {
      lines.push(`> 任务完成：**${p.current}/${p.total}**（${p.value}%）`);
    }
    lines.push('');
  }

  // 昨日进展
  lines.push('### 昨日进展');
  if (items.completed.length > 0) {
    items.completed.forEach((c, i) => {
      lines.push(`${i + 1}. ${c}`);
    });
  } else {
    lines.push('（无记录）');
  }
  lines.push('');

  // 今日计划
  lines.push('### 今日计划');
  if (items.todayPlan.length > 0) {
    items.todayPlan.forEach((p, i) => {
      lines.push(`${i + 1}. ${p}`);
    });
  } else if (items.projects.length > 0) {
    lines.push(`继续推进：${items.projects.map(p => p.name).join('、')}`);
  } else {
    lines.push('（无记录）');
  }
  lines.push('');

  // 风险/阻塞
  lines.push('### 风险/阻塞');
  if (items.blockers.length > 0) {
    items.blockers.forEach((b, i) => {
      const icon = b.type === 'explicit' ? '⚠️' : '🔄';
      lines.push(`${icon} ${i + 1}. ${b.content}`);
    });
  } else {
    lines.push('✅ 暂无阻塞');
  }
  lines.push('');

  // 涉及人员
  if (items.persons.length > 0) {
    lines.push('### 涉及人员');
    lines.push(`👤 ${items.persons.map(p => p.name).join('、')}`);
    lines.push('');
  }

  // 涉及项目
  if (items.projects.length > 0) {
    lines.push('### 涉及项目/任务');
    items.projects.forEach((p, i) => {
      lines.push(`📌 ${i + 1}. ${p.name}`);
    });
    lines.push('');
  }

  // 原始文本
  lines.push('---');
  lines.push(`*原始记录：${analysis.raw.slice(0, 50)}...*`);

  return lines.join('\n');
}

// ─── 快速格式化 ───────────────────────────────────────────

function formatBrief(projectName, progress, blocker) {
  const today = new Date().toLocaleDateString('zh-CN');
  const lines = [
    `## 📋 ${today} 站会`,
    '',
    `**${projectName}**`,
    '',
    `📈 进度：${progress}`,
    blocker ? `⚠️ 阻塞：${blocker}` : '✅ 无阻塞',
  ];
  return lines.join('\n');
}

// ─── CLI 入口 ─────────────────────────────────────────────

const colors = { green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[36m', reset: '\x1b[0m', dim: '\x1b[2m' };

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
\x1b[36m📋 capture-me 站会助手 v1.0\x1b[0m

用法:
  node standup.js "原始站会记录文本"           # 分析并生成报告
  node standup.js --demo                       # 演示模式
  node standup.js --format "简短描述"           # 快速格式化
  node standup.js --file ./meeting.txt        # 从文件读取
  node standup.js --json                       # JSON 格式输出

示例:
  node standup.js "昨天完成了登录模块，今天准备开始支付模块，目前卡在接口文档"
  node standup.js --demo
`);
    return;
  }

  // 演示模式
  if (args[0] === '--demo') {
    const demoTexts = [
      `张三：昨天的站会
李四：昨天完成了用户登录模块的开发，今天准备开始支付模块
王五：支付模块目前卡在接口文档，等后端确认，预计今天下午有反馈
赵六：我这边没问题，昨天的活动模块已经上线了

老板：好，那今天重点关注支付模块的进展`,
      `项目进展：
1. 0515迭代 客户中台项目 - 完成了需求评审，开发进度 40%
2. 1015迭代 数据分析平台 - 遇到阻塞，需要等基础架构组的支持
3. 昨天完成了首页改版上线

今天计划：
- 继续推进客户中台项目
- 跟架构组对齐数据平台的方案`,
    ];

    console.log('\n\x1b[36m🎯 站会助手 Demo\x1b[0m\n');
    console.log('='.repeat(50) + '\n');

    for (let i = 0; i < demoTexts.length; i++) {
      const analysis = analyzeStandup(demoTexts[i]);
      console.log(`\n\x1b[33m--- 样例 ${i + 1} ---\x1b[0m`);
      console.log('\x1b[2m原始文本：\x1b[0m', demoTexts[i].slice(0, 60) + '...\n');
      console.log(formatStandupReport(analysis));
      console.log('\n' + '-'.repeat(50));
    }
    return;
  }

  // 快速格式化
  if (args[0] === '--format') {
    const text = args.slice(1).join(' ');
    console.log(formatBrief(text, '进行中', null));
    return;
  }

  // JSON 格式
  if (args[0] === '--json') {
    const text = args.slice(1).join(' ');
    const analysis = analyzeStandup(text);
    console.log(JSON.stringify(analysis, null, 2));
    return;
  }

  // 从文件读取
  if (args[0] === '--file') {
    const filePath = args[1];
    if (!filePath) {
      console.log('\x1b[31m⚠️ 请指定文件路径\x1b[0m');
      return;
    }
    if (!fs.existsSync(filePath)) {
      console.log(`\x1b[31m⚠️ 文件不存在: ${filePath}\x1b[0m`);
      return;
    }
    const text = fs.readFileSync(filePath, 'utf-8');
    const analysis = analyzeStandup(text);
    console.log(formatStandupReport(analysis));
    return;
  }

  // 分析文本
  const text = args.join(' ');
  const analysis = analyzeStandup(text);

  if (analysis.error) {
    console.log(`\x1b[31m⚠️ ${analysis.error}\x1b[0m`);
    return;
  }

  console.log('\n\x1b[36m📊 分析结果\x1b[0m\n');
  console.log(formatStandupReport(analysis));

  log('Standup analysis', { summary: analysis.summary });
}

// ─── 运行 ─────────────────────────────────────────────────

if (require.main === module) {
  main();
}

module.exports = {
  analyzeStandup,
  formatStandupReport,
  formatBrief,
  extractProjects,
  extractPersons,
  extractProgress,
  extractBlockers,
  extractCompleted,
  extractTodayPlan,
};
