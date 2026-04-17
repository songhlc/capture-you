const fs = require('fs');
const path = require('path');

function isDir(dir) {
  return Boolean(dir) && fs.existsSync(dir) && fs.statSync(dir).isDirectory();
}

function resolveCaptureMeDir() {
  const home = process.env.HOME || '';
  const candidates = [
    process.env.CAPTURE_ME_DIR,
    path.join(__dirname, '..', 'capture-me'),
    path.join(home, '.codex', 'skills', 'capture-me'),
    path.join(home, '.claude', 'skills', 'capture-me'),
    path.join(home, '.hermes', 'skills', 'capture-me'),
    path.join(home, '.openclaw', 'skills', 'capture-me'),
  ];

  const found = candidates.find(isDir);
  if (!found) {
    throw new Error('未找到 capture-me 主技能目录，请先安装 capture-me');
  }

  return found;
}

function resolveDbPath() {
  return path.join(resolveCaptureMeDir(), 'sqlite', 'capture.db');
}

module.exports = {
  resolveCaptureMeDir,
  resolveDbPath,
};
