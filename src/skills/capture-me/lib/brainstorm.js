#!/usr/bin/env node
/**
 * brainstorm.js — 头脑风暴引擎
 * 
 * 问题解构 + 5 Why 追问 + 视角转换 + 假设检验
 */

const readline = require('readline');

// ─── 问题解构 ─────────────────────────────────────────────

/**
 * 把模糊的困扰解构成具体维度
 */
function deconstructProblem(text) {
  const dimensions = [
    { key: '情绪', patterns: ['焦虑', '担心', '害怕', '烦躁', '沮丧', '失落', '压力大', '压力', '累', '疲惫', '郁闷'] },
    { key: '工作', patterns: ['工作', '开会', '项目', '客户', '老板', '同事', '加班', '辞职', '上班', '下班', '职场', 'KPI', '汇报'] },
    { key: '人际关系', patterns: ['老婆', '老公', '孩子', '父母', '朋友', '同事', '领导', '家人', '亲子', '婚姻'] },
    { key: '健康', patterns: ['睡眠', '运动', '饮食', '疲惫', '头疼', '生病', '身体', '健康', '锻炼'] },
    { key: '财务', patterns: ['钱', '投资', '收入', '支出', '债务', '消费', '赚钱', '花钱', '财务'] },
    { key: '时间管理', patterns: ['没时间', '来不及', '拖延', '效率', '太忙', '忙碌', '时间不够'] },
    { key: '未来规划', patterns: ['目标', '迷茫', '方向', '选择', '担心未来', '未来', '规划', '人生'] },
  ];

  const found = [];
  for (const dim of dimensions) {
    for (const kw of dim.patterns) {
      if (text.includes(kw)) {
        found.push(dim.key);
        break;
      }
    }
  }

  return {
    original: text,
    dimensions: found.length > 0 ? found : ['其他'],
    isVague: found.length === 0,
  };
}

// ─── 5 Why 追问 ───────────────────────────────────────────

const WHY_PROMPTS = {
  '情绪': [
    '这种情绪从什么时候开始的？',
    '最近有什么事让你感到压力？',
    '这种情况下，你通常怎么应对？',
    '有没有什么事情可以改善这个情绪？',
    '如果改善了，你的生活会有什么不同？',
  ],
  '工作': [
    '这个工作问题具体是什么？',
    '是工作量太大，还是方向不清晰，还是同事配合问题？',
    '这个问题持续多久了？',
    '你尝试过什么方法解决吗？',
    '如果解决了，对你的职业发展有什么影响？',
  ],
  '人际关系': [
    '这段关系中，你最在意什么？',
    '最近有没有发生什么具体的事情？',
    '你对对方的期待是什么？',
    '对方可能面临什么困难或压力？',
    '你愿意为改善这段关系做什么调整？',
  ],
  '健康': [
    '身体的具体感受是什么？',
    '这种情况持续多久了？',
    '和最近的生活习惯有关吗（饮食/睡眠/运动）？',
    '有做什么检查或治疗吗？',
    '如果改善了，你最想做什么？',
  ],
  '财务': [
    '具体的财务担忧是什么？',
    '是收入不足，还是支出过高，还是投资亏损？',
    '这种情况持续多久了？',
    '你现在的收支状况大概是怎样的？',
    '如果财务改善了，你最想实现什么目标？',
  ],
  '时间管理': [
    '你觉得时间不够用的具体表现是什么？',
    '哪个事情占用时间最多？',
    '有没有可以委托或放弃的事情？',
    '你理想的一天是怎么安排的？',
    '最大的阻碍是什么？',
  ],
  '未来规划': [
    '你对现在的哪些方面感到迷茫？',
    '你理想的生活是什么样的？',
    '是什么让你感到不确定？',
    '你目前对未来的信心程度是多少（1-10）？',
    '第一步可以做什么？',
  ],
  '其他': [
    '这个问题具体是什么？',
    '什么时候开始的？',
    '你已经尝试过什么方法？',
    '最困扰你的是什么？',
    '如果解决了，会带来什么改变？',
  ],
};

/**
 * 获取下一步 5 Why 追问
 */
function getNextWhyPrompt(dimension, whyCount) {
  const prompts = WHY_PROMPTS[dimension] || WHY_PROMPTS['其他'];
  const index = Math.min(whyCount, prompts.length - 1);
  return prompts[index];
}

// ─── 视角转换 ─────────────────────────────────────────────

/**
 * 从不同视角审视问题
 */
function perspectiveShift(problem, perspective) {
  const perspectives = {
    '朋友': `如果你是你最好的朋友，你会怎么看这件事？\n你会对自己说什么？`,
    '家人': `如果是你最支持你的家人看这件事，他们会怎么想？\n他们会担心什么？`,
    '未来自己': `如果 5 年后的你回头看这件事，会觉得重要吗？\n那时的你会给自己什么建议？`,
    '对立面': `如果是你不喜欢的人看这件事，他们会怎么说？\n他们可能有什么不同的看法？`,
    '理性分析': `如果用一个理性的旁观者角度看：\n这件事的事实是什么？情绪是什么？行动项是什么？`,
  };

  return perspectives[perspective] || perspectives['理性分析'];
}

// ─── 假设检验 ─────────────────────────────────────────────

/**
 * 列出可能的假设，邀请验证
 */
function generateHypotheses(problem, deconstructed) {
  const hypotheses = [];

  // 基于维度生成假设
  if (deconstructed.dimensions.includes('情绪')) {
    hypotheses.push({
      hypothesis: '情绪可能是由长期累积的压力引起的',
      evidence: '你没有意识到压力在累积',
      verification: '未来2周记录每天的压力水平，看看是否有规律',
    });
    hypotheses.push({
      hypothesis: '情绪和特定触发事件有关',
      evidence: '情绪起伏较大',
      verification: '每次情绪波动时记录：触发事件是什么？',
    });
  }

  if (deconstructed.dimensions.includes('工作')) {
    hypotheses.push({
      hypothesis: '工作问题的根源是边界不清晰',
      evidence: '你说"太忙"或"开会太多"',
      verification: '记录一周内每件事花费的时间，找出占用最多的',
    });
  }

  if (deconstructed.dimensions.includes('人际关系')) {
    hypotheses.push({
      hypothesis: '关系问题来自于沟通不畅',
      evidence: '双方对彼此的期待不一致',
      verification: '主动和对方确认：对方真正想要的是什么？',
    });
  }

  return hypotheses;
}

// ─── 思维框架 ─────────────────────────────────────────────

const FRAMEWORKS = {
  '第一性原理': {
    description: '剥离一切假设，找到最本质的问题',
    steps: [
      '这个问题最基本的要素是什么？',
      '这些要素中，哪个是真正不可替代的？',
      '如果去掉所有假设，只保留核心，会是什么？',
      '这个核心问题的最优解是什么？',
      '如何验证这个解是否正确？',
    ],
  },
  '5 Why': {
    description: '连续追问 5 次为什么，找到根本原因',
    steps: null, // 动态生成
  },
  'Pre-mortem': {
    description: '假设项目已经失败，分析可能原因',
    steps: [
      '想象这个计划/决定失败了',
      '问：可能的原因是什么？',
      '哪些是最可能发生的？',
      '如何预防这些风险？',
    ],
  },
  'MECE': {
    description: '分类穷举，确保不重不漏',
    steps: [
      '这个问题可以分成哪几个维度？',
      '每个维度下有哪些子因素？',
      '这些分类是否有重叠？',
      '是否有遗漏的维度？',
    ],
  },
  '反转假设': {
    description: '反转问题，突破思维定式',
    steps: [
      '把问题的前提反转',
      '如果相反的情况是真的，会怎样？',
      '这个反转能揭示什么？',
      '原假设是否真的正确？',
    ],
  },
};

/**
 * 执行思维框架
 */
function applyFramework(problem, frameworkName) {
  const framework = FRAMEWORKS[frameworkName];
  if (!framework) {
    return { error: `未知框架: ${frameworkName}` };
  }

  if (frameworkName === '5 Why') {
    const deconstructed = deconstructProblem(problem);
    const dim = deconstructed.dimensions[0];
    const prompts = [];
    for (let i = 0; i < 5; i++) {
      prompts.push(getNextWhyPrompt(dim, i));
    }
    return {
      name: frameworkName,
      description: framework.description,
      steps: prompts,
    };
  }

  return {
    name: frameworkName,
    description: framework.description,
    steps: framework.steps,
  };
}

// ─── CLI 入口 ─────────────────────────────────────────────

const colors = {
  blue: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
};

function printBanner() {
  console.log(`${colors.blue}╔══════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.blue}║  💡 头脑风暴引擎 — Brainstorm v1.0                 ║${colors.reset}`);
  console.log(`${colors.blue}╚══════════════════════════════════════════════════════╝${colors.reset}`);
}

function printHelp() {
  console.log(`
用法:
  /brainstorm why <问题>          # 5 Why 追问模式
  /brainstorm deconstruct <问题>   # 问题解构
  /brainstorm perspective <问题> <视角>
  /brainstorm framework <问题> <框架名称>

可用框架:
  第一性原理, 5 Why, Pre-mortem, MECE, 反转假设

可用视角:
  朋友, 家人, 未来自己, 对立面, 理性分析
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    printBanner();
    printHelp();
    return;
  }

  const cmd = args[0];

  if (cmd === 'why') {
    const problem = args.slice(1).join(' ');
    if (!problem) {
      console.log('请提供问题描述');
      return;
    }
    
    const deconstructed = deconstructProblem(problem);
    console.log(`\n${colors.yellow}📌 问题解构${colors.reset}`);
    console.log(`原始问题: ${problem}`);
    console.log(`识别维度: ${deconstructed.dimensions.join(', ')}`);
    console.log(`\n${colors.blue}🔍 5 Why 追问${colors.reset}`);
    
    const dim = deconstructed.dimensions[0];
    for (let i = 0; i < 5; i++) {
      console.log(`\n  第${i + 1}问: ${getNextWhyPrompt(dim, i)}`);
    }
    return;
  }

  if (cmd === 'deconstruct') {
    const problem = args.slice(1).join(' ');
    if (!problem) {
      console.log('请提供问题描述');
      return;
    }
    
    const result = deconstructProblem(problem);
    console.log(`\n${colors.yellow}📌 问题解构结果${colors.reset}`);
    console.log(`原始问题: ${result.original}`);
    console.log(`识别维度: ${result.dimensions.join(', ')}`);
    if (result.isVague) {
      console.log(`${colors.yellow}⚠️ 问题较模糊，建议补充更多细节${colors.reset}`);
    }
    return;
  }

  if (cmd === 'perspective') {
    const problem = args.slice(1, -1).join(' ');
    const perspective = args[args.length - 1];
    if (!problem || !perspective) {
      console.log('用法: /brainstorm perspective <问题> <视角>');
      return;
    }
    
    const result = perspectiveShift(problem, perspective);
    console.log(`\n${colors.yellow}🔄 视角转换 — ${perspective}${colors.reset}`);
    console.log(result);
    return;
  }

  if (cmd === 'framework') {
    const problem = args.slice(1, -1).join(' ');
    const frameworkName = args[args.length - 1];
    if (!frameworkName || !problem) {
      console.log('用法: /brainstorm framework <问题> <框架名称>');
      return;
    }
    
    const result = applyFramework(problem, frameworkName);
    if (result.error) {
      console.log(`${colors.red}⚠️ ${result.error}${colors.reset}`);
      return;
    }
    
    console.log(`\n${colors.green}🧠 ${result.name}${colors.reset}`);
    console.log(`说明: ${result.description}`);
    console.log(`\n步骤:`);
    for (let i = 0; i < result.steps.length; i++) {
      console.log(`  ${i + 1}. ${result.steps[i]}`);
    }
    return;
  }

  if (cmd === 'hypothesis') {
    const problem = args.slice(1).join(' ');
    if (!problem) {
      console.log('请提供问题描述');
      return;
    }
    
    const deconstructed = deconstructProblem(problem);
    const hypotheses = generateHypotheses(problem, deconstructed);
    console.log(`\n${colors.yellow}🔬 假设检验${colors.reset}`);
    console.log(`问题: ${problem}`);
    console.log(`\n可能的假设:`);
    for (let i = 0; i < hypotheses.length; i++) {
      const h = hypotheses[i];
      console.log(`\n  假设 ${i + 1}: ${h.hypothesis}`);
      console.log(`  依据: ${h.evidence}`);
      console.log(`  验证方法: ${h.verification}`);
    }
    return;
  }

  printHelp();
}

if (require.main === module) {
  main();
}

module.exports = {
  deconstructProblem,
  getNextWhyPrompt,
  perspectiveShift,
  generateHypotheses,
  applyFramework,
  FRAMEWORKS,
};
