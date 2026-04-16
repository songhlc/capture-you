#!/bin/bash
# install.sh — 环境检查与依赖安装
# 用法: ./scripts/install.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"

echo "🔍 检查环境..."
echo ""

# 检查 Node.js
check_node() {
  if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装"
    echo "   请从 https://nodejs.org/ 安装 Node.js 18+"
    exit 1
  fi

  NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 版本过低: $(node -v)"
    echo "   需要 Node.js 18.0.0 或更高版本"
    exit 1
  fi

  echo "✅ Node.js: $(node -v)"
}

# 检查 npm
check_npm() {
  if ! command -v npm &> /dev/null; then
    echo "❌ npm 未安装"
    exit 1
  fi

  NPM_VERSION=$(npm -v)
  echo "✅ npm: $NPM_VERSION"
}

# 检查并创建目录
check_dirs() {
  echo ""
  echo "📁 检查目录..."

  # skill 目录
  mkdir -p "$SKILL_DIR/sqlite"
  echo "✅ $SKILL_DIR/sqlite"

  # 日志目录
  mkdir -p ~/.capture-me/logs
  echo "✅ ~/.capture-me/logs"
}

# 安装 npm 依赖
install_deps() {
  echo ""
  echo "📦 安装 npm 依赖..."

  cd "$SKILL_DIR"

  if [ ! -f "package.json" ]; then
    echo "❌ package.json 不存在"
    exit 1
  fi

  npm install

  echo "✅ npm 依赖安装完成"
}

# 初始化数据库
init_database() {
  echo ""
  echo "🗄️ 初始化数据库..."

  cd "$SKILL_DIR"

  if [ -f "db.js" ]; then
    node db.js init
    echo "✅ 数据库初始化完成"
  else
    echo "⚠️ db.js 不存在，跳过数据库初始化"
  fi
}

# 运行测试
run_tests() {
  echo ""
  echo "🧪 运行测试..."

  cd "$SKILL_DIR"

  if npm test 2>&1 | tee /tmp/capture-me-test-output.txt; then
    echo ""
    echo "✅ 所有测试通过!"
  else
    echo ""
    echo "⚠️ 部分测试失败，请检查输出"
  fi
}

# 注册认知镜子定时任务
register_mirror_cron() {
  echo ""
  echo "⏰ 注册认知镜子定时任务..."

  local CRON_JOBS="$HOME/.openclaw/cron/jobs.json"
  if [ ! -f "$CRON_JOBS" ]; then
    echo "⚠️ 未找到 OpenClaw cron jobs.json，跳过定时任务注册"
    echo "   （如需手动注册，参考 docs/capture-me-mirror-spec.md）"
    return
  fi

  # 检查是否已存在 mirror 定时任务
  if grep -q '"mirror-daily-check"' "$CRON_JOBS" 2>/dev/null; then
    echo "✅ 认知镜子定时任务已存在，跳过"
    return
  fi

  # 使用 Node.js 来修改 jobs.json（更安全的 JSON 操作）
  node -e "
const fs = require('fs');
const path = require('path');
const jobsFile = process.env.HOME + '/.openclaw/cron/jobs.json';
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf-8'));

const mirrorJobs = [
  {
    id: 'mirror-daily-check',
    agentId: 'main',
    name: 'mirror-daily-check',
    description: '每天 9:00 检查未解决承诺，有矛盾时推送提醒',
    enabled: true,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    schedule: { kind: 'cron', expr: '0 9 * * *', tz: 'Asia/Shanghai' },
    sessionTarget: 'isolated',
    wakeMode: 'now',
    payload: {
      kind: 'agentTurn',
      message: '请运行 mirror.js 检查承诺状态：\\n1. 执行: node ~/.claude/skills/capture-me/mirror.js status\\n2. 执行: node ~/.claude/skills/capture-me/mirror.js check\\n3. 如果有未解决的矛盾承诺（⚠️标记），生成一条飞书消息推送给用户\\n4. 格式要求：直接、简洁、指出具体的承诺和矛盾次数',
      timeoutSeconds: 60,
    },
    delivery: { mode: 'announce', channel: 'feishu' },
    state: {},
  },
  {
    id: 'mirror-weekly-report',
    agentId: 'main',
    name: 'mirror-weekly-report',
    description: '每周五 18:00 生成并推送本周认知报告',
    enabled: true,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    schedule: { kind: 'cron', expr: '0 18 * * 5', tz: 'Asia/Shanghai' },
    sessionTarget: 'isolated',
    wakeMode: 'now',
    payload: {
      kind: 'agentTurn',
      message: '请生成并推送本周认知报告：\\n1. 执行: node ~/.claude/skills/capture-me/mirror.js report\\n2. 将报告内容整理成飞书消息格式\\n3. 推送给用户\\n4. 报告应包含：本周承诺追踪、记录统计、值得关注的模式',
      timeoutSeconds: 60,
    },
    delivery: { mode: 'announce', channel: 'feishu' },
    state: {},
  },
];

// 添加不重复的 job
const existingIds = jobs.jobs.map(j => j.id);
for (const job of mirrorJobs) {
  if (!existingIds.includes(job.id)) {
    jobs.jobs.push(job);
    console.log('✅ 添加定时任务:', job.name);
  }
}

fs.writeFileSync(jobsFile, JSON.stringify(jobs, null, 2));
console.log('✅ 认知镜子定时任务注册完成');
"
}

# 主流程
main() {
  echo "═══════════════════════════════════════"
  echo "  Capture-You 环境安装"
  echo "═══════════════════════════════════════"
  echo ""

  check_node
  check_npm
  check_dirs
  install_deps
  init_database
  register_mirror_cron

  echo ""
  echo "═══════════════════════════════════════"
  echo "  安装完成!"
  echo "═══════════════════════════════════════"
  echo ""
  echo "下一步:"
  echo "  npm test          # 运行测试"
  echo "  node capture.js   # 记录内容"
  echo ""
}

main
