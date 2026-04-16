/**
 * ideas + initDb 幂等性测试
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const TEST_DB_DIR = path.join(os.tmpdir(), 'capture-me-ideas-test');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test-ideas.db');

process.env.CAPTURE_YOU_TEST_DB_PATH = TEST_DB_PATH;

describe('ideas 表 + initDb 幂等性', () => {
  const db = require('../lib/db');

  beforeAll(() => {
    if (!fs.existsSync(TEST_DB_DIR)) {
      fs.mkdirSync(TEST_DB_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    if (fs.existsSync(TEST_DB_DIR)) {
      fs.rmdirSync(TEST_DB_DIR, { recursive: true });
    }
  });

  describe('initDb 幂等性', () => {
    test('initDb 可重复执行不报错', () => {
      expect(() => db.initDb()).not.toThrow();
      expect(() => db.initDb()).not.toThrow();
      expect(() => db.initDb()).not.toThrow();
    });

    test('initDb 重复执行不删除已有数据', () => {
      // 插入一条笔记
      const noteId = db.insertNote({
        id: `note-before-init-${Date.now()}`,
        date: '2026-04-12',
        time: '10:00',
        raw_text: 'initDb 幂等性测试',
        source: 'test',
      });
      const before = db.getNoteById(noteId);
      expect(before).toBeDefined();

      // 再次执行 initDb
      db.initDb();

      // 数据应该还在
      const after = db.getNoteById(noteId);
      expect(after).toBeDefined();
      expect(after.raw_text).toBe('initDb 幂等性测试');
    });

    test('profile_signals 表的 detail/meta 字段存在', () => {
      const signalId = db.insertProfileSignal({
        dimension: 'test',
        signal: '测试detail字段',
        confidence: 0.9,
        source: 'test',
        detail: '这是detail内容',
        meta: '{"key":"value"}',
      });
      const signals = db.getProfileSignals(null, 10);
      const found = signals.find(s => s.id === signalId);
      expect(found).toBeDefined();
      expect(found.detail).toBe('这是detail内容');
      expect(found.meta).toBe('{"key":"value"}');
    });
  });

  describe('ideas CRUD', () => {
    test('insertIdea 写入成功', () => {
      const id = db.insertIdea({
        raw_text: '这是一个灵感',
        ai_summary: 'AI摘要',
        dimension: 'tech',
        source: 'test',
      });
      expect(id).toBeDefined();
      expect(id.startsWith('idea_')).toBe(true);
    });

    test('getIdeas 能读取所有灵感', () => {
      db.insertIdea({ raw_text: '灵感1', dimension: 'work', source: 'test' });
      db.insertIdea({ raw_text: '灵感2', dimension: 'life', source: 'test' });
      const ideas = db.getIdeas();
      expect(ideas.length).toBeGreaterThanOrEqual(2);
    });

    test('getIdeas 按 status 过滤', () => {
      const id = db.insertIdea({ raw_text: '待头脑风暴', dimension: 'general', source: 'test' });
      const collected = db.getIdeas('collected');
      const found = collected.find(i => i.id === id);
      expect(found).toBeDefined();
      expect(found.status).toBe('collected');
    });

    test('updateIdeaStatus 更新状态', () => {
      const id = db.insertIdea({ raw_text: '待状态更新', dimension: 'general', source: 'test' });
      db.updateIdeaStatus(id, 'brainstorming', '头脑风暴笔记：需要调研竞品');
      const ideas = db.getIdeas();
      const updated = ideas.find(i => i.id === id);
      expect(updated.status).toBe('brainstorming');
      expect(updated.brainstorm_notes).toBe('头脑风暴笔记：需要调研竞品');
      expect(updated.brainstormed_at).toBeDefined();
    });

    test('promoteIdeaToTodo 转为待办', () => {
      const id = db.insertIdea({ raw_text: '要转待办', dimension: 'general', source: 'test' });
      db.promoteIdeaToTodo(id, 'todo-123');
      const ideas = db.getIdeas();
      const promoted = ideas.find(i => i.id === id);
      expect(promoted.status).toBe('promoted');
      expect(promoted.promoted_to_todo_id).toBe('todo-123');
      expect(promoted.promoted_at).toBeDefined();
    });
  });

  describe('profile_signals with detail/meta', () => {
    test('insertProfileSignal 支持 detail/meta', () => {
      const id = db.insertProfileSignal({
        dimension: 'habit',
        signal: '测试信号',
        confidence: 0.8,
        source: 'test',
        detail: '详细说明',
        meta: JSON.stringify({ tag: 'test' }),
      });
      const signals = db.getProfileSignals('habit', 10);
      const sig = signals.find(s => s.id === id);
      expect(sig.detail).toBe('详细说明');
      expect(sig.meta).toBe('{"tag":"test"}');
    });
  });
});
