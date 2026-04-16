/**
 * capture-me-observer Hook Handler
 *
 * OpenClaw Hook：监听 message:preprocessed，调用 capture-me 增强版核心库静默收集信号
 */

const { spawn } = require('child_process');
const path = require('path');

// capture-me 增强版核心库路径
const CAPTURE_ME_DIR = path.join(process.env.HOME, '.claude', 'skills', 'capture-me');
const ENHANCED_OBSERVER = path.join(CAPTURE_ME_DIR, 'lib', 'enhanced-observer-write.js');

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

  // 调用 capture-me 增强版异步写入接口
  // detached: true 脱离父进程，静默执行，不阻塞 hook
  spawn('node', [
    ENHANCED_OBSERVER,
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
export default handler;
