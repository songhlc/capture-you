/**
 * capture.js 单元测试 - 基于实际实现重写
 */

const path = require('path');
const os = require('os');
const fs = require('fs');

// 创建临时测试环境
const TEST_DIR = path.join(os.tmpdir(), 'capture-me-test-' + Date.now());

// 测试前准备目录
beforeAll(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
});

// 测试后清理
afterAll(() => {
  const rimraf = (dir) => {
    if (fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (e) {
        // ignore cleanup errors in test
      }
    }
  };
  rimraf(TEST_DIR);
});

// Mock db.js 的 insertNote
jest.mock('../lib/db', () => ({
  insertNote: jest.fn(() => true),
  initDb: jest.fn(() => true),
  getNotes: jest.fn(() => []),
  searchNotes: jest.fn(() => []),
  updateNoteTags: jest.fn(() => true),
  markTodoDone: jest.fn(() => true),
}));

jest.mock('../lib/setup', () => ({
  isSetupComplete: jest.fn(() => true),
  getProfile: jest.fn(() => ({})),
  generateGreeting: jest.fn(() => '你好'),
  setup: jest.fn(),
}));

jest.mock('../lib/achievements', () => ({
  checkAndNotify: jest.fn(),
}));

jest.mock('../lib/mirror', () => ({
  checkAndExtractCommitments: jest.fn(),
  scanCommitmentsForContradictions: jest.fn(() => []),
}));

// 加载被测试模块
const capturePath = path.join(__dirname, '../lib/capture.js');
const { capture, outputParseInstructions } = require(capturePath);

describe('capture.js - 核心功能', () => {
  describe('capture(rawText)', () => {
    test('返回包含 id、raw_text、stored 的对象', () => {
      const result = capture('测试随手记');
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('raw_text', '测试随手记');
      expect(result).toHaveProperty('stored', true);
    });

    test('id 格式正确（以 capture- 开头）', () => {
      const result = capture('测试');
      expect(result.id).toMatch(/^capture-\d+$/);
    });

    test('raw_text 为原始输入内容', () => {
      const input = '今天要完成方案设计';
      const result = capture(input);
      expect(result.raw_text).toBe(input);
    });
  });

  describe('outputParseInstructions(rawText, noteId)', () => {
    test('返回包含 JSON 块的字符串', () => {
      const result = outputParseInstructions('给张总发邮件', 'capture-123');
      expect(typeof result).toBe('string');
      expect(result).toContain('```json');
      expect(result).toContain('note_id');
      expect(result).toContain('"summary"');
      expect(result).toContain('"tags"');
    });

    test('包含原始文本内容', () => {
      const text = '明天要给王总打电话';
      const result = outputParseInstructions(text, 'capture-456');
      expect(result).toContain(text);
    });

    test('包含 note_id 参数', () => {
      const noteId = 'capture-789';
      const result = outputParseInstructions('测试', noteId);
      expect(result).toContain(noteId);
    });
  });
});

describe('capture.js - 路径配置', () => {
  test('MEMORY_DIR 基于 SKILL_DIR 指向 memory', () => {
    const captureContent = fs.readFileSync(capturePath, 'utf-8');
    expect(captureContent).toMatch(/MEMORY_DIR\s*=\s*path\.join\(\s*SKILL_DIR\s*,\s*['"]memory['"]\s*\)/);
  });

  test('CAPTURE_LOG 指向 memory/capture-log.md', () => {
    const captureContent = fs.readFileSync(capturePath, 'utf-8');
    // CAPTURE_LOG = path.join(MEMORY_DIR, 'capture-log.md')，MEMORY_DIR 本身已含 'memory'
    expect(captureContent).toMatch(/CAPTURE_LOG\s*=\s*path\.join\s*\(\s*MEMORY_DIR\s*,\s*['"]capture-log\.md['"]\s*\)/);
  });
});
