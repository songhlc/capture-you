#!/usr/bin/env node
/**
 * config.js — capture-me 配置管理
 * 
 * 管理各种阈值和配置
 */

const fs = require('fs');
const path = require('path');
const SKILL_DIR = path.join(__dirname, '..');

const CONFIG_DIR = path.join(SKILL_DIR, 'memory');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// ─── 默认配置 ─────────────────────────────────────

const DEFAULT_CONFIG = {
  // 承诺矛盾阈值（连续几次未兑现触发提醒）
  commitment: {
    contradictionThreshold: 3,
    reminderInterval: 24, // 小时
  },
  
  // 情绪异常阈值
  emotion: {
    negativeRatioThreshold: 0.3, // 负面情绪占比超过 30% 触发
    anomalyThreshold: 0.3,       // 变化超过 30% 触发
    minSamples: 3,               // 最少样本数
  },
  
  // 盲区检测
  blindspot: {
    frequencyAnomalyThreshold: 0.5, // 频率变化超过 50%
    minOccurrences: 2,
  },
  
  // 通知设置
  notifications: {
    enabled: true,
    macOSNotification: true,
    feishuNotification: false, // 飞书通知
    dailyReminder: false,
    dailyReminderTime: '21:00',
  },
  
  // 外部数据
  external: {
    calendarEnabled: false,
    healthEnabled: false,
    huaweiEnabled: false,
  },
  
  // 画像置信度
  profile: {
    minSignalsForAnalysis: 5,
    minNotesForAnalysis: 10,
    updateInterval: 86400, // 24小时
  },
};

// ─── 配置读写 ─────────────────────────────────────

function loadConfig() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  
  if (!fs.existsSync(CONFIG_FILE)) {
    saveConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }
  
  try {
    const data = fs.readFileSync(CONFIG_FILE, 'utf8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
  } catch (e) {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(config) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function getConfig(key) {
  const config = loadConfig();
  if (!key) return config;
  return key.split('.').reduce((obj, k) => obj?.[k], config);
}

function setConfig(key, value) {
  const config = loadConfig();
  const keys = key.split('.');
  let current = config;
  
  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in current)) {
      current[keys[i]] = {};
    }
    current = current[keys[i]];
  }
  
  current[keys[keys.length - 1]] = value;
  saveConfig(config);
  return config;
}

// ─── CLI 入口 ─────────────────────────────────────

const colors = {
  blue: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
};

function formatValue(value, indent = 0) {
  const prefix = ' '.repeat(indent);
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value)
      .map(([k, v]) => {
        if (typeof v === 'object' && v !== null) {
          return `${prefix}  ${k}:\n${formatValue(v, indent + 4)}`;
        }
        return `${prefix}  ${k}: ${JSON.stringify(v)}`;
      })
      .join('\n');
  }
  return `${prefix}  ${JSON.stringify(value)}`;
}

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === 'get') {
    const key = args[1];
    const value = getConfig(key);
    if (key) {
      console.log(`${colors.blue}${key}${colors.reset}: ${JSON.stringify(value)}`);
    } else {
      console.log(formatConfig(loadConfig()));
    }
    return;
  }

  if (cmd === 'set') {
    const key = args[1];
    const value = args.slice(2).join(' ');
    
    if (!key) {
      console.log(`${colors.red}用法: config set <key> <value>${colors.reset}`);
      return;
    }
    
    // 尝试解析 JSON
    let parsedValue;
    try {
      parsedValue = JSON.parse(value);
    } catch {
      parsedValue = value;
    }
    
    setConfig(key, parsedValue);
    console.log(`${colors.green}✓ ${key} = ${JSON.stringify(parsedValue)}${colors.reset}`);
    return;
  }

  if (cmd === 'reset') {
    saveConfig(DEFAULT_CONFIG);
    console.log(`${colors.green}✓ 已重置为默认配置${colors.reset}`);
    return;
  }

  if (cmd === 'list') {
    const config = loadConfig();
    console.log(`${colors.blue}📋 capture-me 配置${colors.reset}\n`);
    
    for (const [section, values] of Object.entries(config)) {
      console.log(`${colors.yellow}[${section}]${colors.reset}`);
      console.log(formatValue(values));
      console.log('');
    }
    return;
  }

  // 帮助
  console.log(`${colors.blue}⚙️ capture-me 配置管理${colors.reset}\n`);
  console.log('用法:');
  console.log('  node config.js list              # 列出所有配置');
  console.log('  node config.js get [key]          # 获取配置值');
  console.log('  node config.js set <key> <value>  # 设置配置值');
  console.log('  node config.js reset             # 重置为默认');
  console.log('');
  console.log('示例:');
  console.log('  node config.js get notifications.enabled');
  console.log('  node config.js set notifications.dailyReminder true');
  console.log('  node config.js set commitment.contradictionThreshold 5');
}

function formatConfig(config) {
  const lines = [];
  for (const [section, values] of Object.entries(config)) {
    lines.push(`${colors.yellow}[${section}]${colors.reset}`);
    lines.push(formatValue(values));
    lines.push('');
  }
  return lines.join('\n');
}

if (require.main === module) {
  main();
}

module.exports = {
  loadConfig,
  saveConfig,
  getConfig,
  setConfig,
  DEFAULT_CONFIG,
};
