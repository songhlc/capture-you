/**
 * 路径配置测试 - 验证 capture 路径配置一致性
 */

const path = require('path');
const fs = require('fs');

const CAPTURE_PATH = path.join(__dirname, '../lib/capture.js');
const DB_PATH = path.join(__dirname, '../lib/db.js');
const SETUP_PATH = path.join(__dirname, '../lib/setup.js');
const REVIEW_PATH = path.join(__dirname, '../lib/review.js');
const QUERY_PATH = path.join(__dirname, '../lib/query.js');
const STAT_PATH = path.join(__dirname, '../lib/stat.js');

describe('路径配置 - review/query 的 MEMORY_DIR 必须与 capture.js 一致', () => {
  test('review/query 的 MEMORY_DIR 模式应与 capture.js 一致', () => {
    const captureContent = fs.readFileSync(CAPTURE_PATH, 'utf-8');
    const reviewContent = fs.readFileSync(REVIEW_PATH, 'utf-8');
    const queryContent = fs.readFileSync(QUERY_PATH, 'utf-8');

    // 提取 capture.js 的 MEMORY_DIR 定义
    const captureMatch = captureContent.match(/MEMORY_DIR\s*=\s*([^;]+);/);
    expect(captureMatch).toBeTruthy();

    const memoryDef = captureMatch[1];

    // 确保其他文件也有相同的 MEMORY_DIR 定义
    expect(reviewContent).toContain(memoryDef);
    expect(queryContent).toContain(memoryDef);
  });

  test('db.js 的 DB_PATH 是相对固定的', () => {
    const dbContent = fs.readFileSync(DB_PATH, 'utf-8');
    const dbMatch = dbContent.match(/DB_PATH\s*=\s*([^;]+);/);
    expect(dbMatch).toBeTruthy();
  });
});

describe('路径配置 - 验证实际路径解析', () => {
  test('capture.js 的 MEMORY_DIR 基于 SKILL_DIR（不是 ../..）', () => {
    const captureContent = fs.readFileSync(CAPTURE_PATH, 'utf-8');
    
    // 确认基于 SKILL_DIR，而非 ../../../memory 这样的回溯
    expect(captureContent).toContain("MEMORY_DIR = path.join(SKILL_DIR, 'memory')");
    expect(captureContent).not.toMatch(/\.\.\/\.\.\/\.\.\/memory/);
  });

  test('capture.js 没有硬编码绝对路径', () => {
    const captureContent = fs.readFileSync(CAPTURE_PATH, 'utf-8');
    // 不应该有 /Users 或 /home 或 C: 这样的绝对路径前缀
    expect(captureContent).not.toMatch(/['"]\/Users\//);
    expect(captureContent).not.toMatch(/['"]\/home\//);
    expect(captureContent).not.toMatch(/['"]C:\\/);
  });
});
