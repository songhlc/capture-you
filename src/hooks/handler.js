/**
 * capture-me-observer Hook Handler
 *
 * OpenClaw Hook：监听 message:preprocessed，调用 capture-me 增强版核心库静默收集信号
 */

const { spawn } = require('child_process');
const path = require('path');
const { resolveCaptureMeDir } = require('./paths');

const CAPTURE_ME_DIR = resolveCaptureMeDir();
const OBSERVER_SCRIPT = path.join(CAPTURE_ME_DIR, 'lib', 'observe-async.js');

// Hook 主函数
async function handler(event) {
  // 只处理 message:preprocessed 事件（AI 处理消息之前）
  if (event.type !== 'message' || event.action !== 'preprocessed') {
    return;
  }

  const { content, conversationId } = event.context || {};

  // 空消息跳过
  if (!content || typeof content !== 'string' || content.trim().length < 3) {
    return;
  }

  // 调用 capture-me 异步观察接口
  spawn('node', [
    OBSERVER_SCRIPT,
    JSON.stringify({
      text: content,
      source: 'openclaw',
      conversation_id: conversationId || null,
    }),
  ], {
    detached: true,
    stdio: 'ignore',
  }).unref();
}

module.exports = handler;
module.exports.default = handler;
