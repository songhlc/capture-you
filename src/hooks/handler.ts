import { spawn } from 'child_process';
import * as path from 'path';
const { resolveCaptureMeDir } = require('./paths');

const CAPTURE_ME_DIR = resolveCaptureMeDir();
const OBSERVER_SCRIPT = path.join(CAPTURE_ME_DIR, 'lib', 'observe-async.js');

// Hook 主函数
const handler = async (event: any) => {
  if (event.type !== 'message' || event.action !== 'preprocessed') {
    return;
  }

  const { content, conversationId } = event.context || {};

  if (!content || typeof content !== 'string' || content.trim().length < 3) {
    return;
  }

  await writeSignalsAsync({
    text: content,
    source: 'openclaw',
    conversation_id: conversationId || null,
  });
};

// 异步写入信号（不阻塞 hook）
async function writeSignalsAsync(payload: Record<string, unknown>) {
  return new Promise((resolve) => {
    const child = spawn('node', [
      OBSERVER_SCRIPT,
      JSON.stringify(payload),
    ], {
      detached: true,
      stdio: 'ignore',
    });

    child.unref();
    resolve(undefined);
  });
}

export default handler;
