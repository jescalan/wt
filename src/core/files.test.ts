import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { copyGitIgnoredFiles, findConfigFile } from './files.js';
import { exec } from './git.js';

describe('findConfigFile', () => {
  let testDir: string;

  beforeAll(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-test-config-'));
  });

  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('finds config file in current directory', () => {
    const configPath = path.join(testDir, 'wt.config.ts');
    fs.writeFileSync(configPath, 'export default {}');

    const found = findConfigFile(testDir, 'wt.config.ts');
    expect(found).toBe(configPath);
  });

  test('finds config file in parent directory', () => {
    const subDir = path.join(testDir, 'subdir');
    fs.mkdirSync(subDir);

    const configPath = path.join(testDir, 'wt.config.ts');
    fs.writeFileSync(configPath, 'export default {}');

    const found = findConfigFile(subDir, 'wt.config.ts');
    expect(found).toBe(configPath);
  });

  test('returns null when config file not found', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-test-empty-'));
    try {
      const found = findConfigFile(emptyDir, 'nonexistent.config.ts');
      expect(found).toBeNull();
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  test('finds deeply nested config file', () => {
    const deep = path.join(testDir, 'a', 'b', 'c', 'd');
    fs.mkdirSync(deep, { recursive: true });

    const configPath = path.join(testDir, 'wt.config.ts');
    // Already exists from previous test

    const found = findConfigFile(deep, 'wt.config.ts');
    expect(found).toBe(configPath);
  });
});

describe('copyGitIgnoredFiles', () => {
  let testDir: string;
  let srcDir: string;
  let dstDir: string;

  beforeAll(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-test-copy-'));
    srcDir = path.join(testDir, 'src');
    dstDir = path.join(testDir, 'dst');

    fs.mkdirSync(srcDir);
    fs.mkdirSync(dstDir);

    // Initialize git repo in src
    exec('git init', { cwd: srcDir });
    exec('git config user.email "test@test.com"', { cwd: srcDir });
    exec('git config user.name "Test User"', { cwd: srcDir });

    // Create .gitignore
    fs.writeFileSync(path.join(srcDir, '.gitignore'), '*.log\n.env\nnode_modules/\n');

    // Create tracked file
    fs.writeFileSync(path.join(srcDir, 'README.md'), '# Test');
    exec('git add .', { cwd: srcDir });
    exec('git commit -m "Initial"', { cwd: srcDir });

    // Create ignored files
    fs.writeFileSync(path.join(srcDir, 'debug.log'), 'log content');
    fs.writeFileSync(path.join(srcDir, '.env'), 'SECRET=123');

    // Create nested ignored directory (not node_modules)
    fs.mkdirSync(path.join(srcDir, 'logs', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'logs', 'nested', 'app.log'), 'nested log');

    // Update .gitignore to include logs/
    fs.writeFileSync(path.join(srcDir, '.gitignore'), '*.log\n.env\nnode_modules/\nlogs/\n');
  });

  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('copies gitignored files to destination', () => {
    const copied = copyGitIgnoredFiles(srcDir, dstDir);

    // Should copy debug.log, .env, and logs/nested/app.log
    expect(copied).toBeGreaterThanOrEqual(3);
    expect(fs.existsSync(path.join(dstDir, 'debug.log'))).toBe(true);
    expect(fs.existsSync(path.join(dstDir, '.env'))).toBe(true);
  });

  test('preserves file content', () => {
    const envContent = fs.readFileSync(path.join(dstDir, '.env'), 'utf-8');
    expect(envContent).toBe('SECRET=123');
  });

  test('creates nested directories', () => {
    expect(fs.existsSync(path.join(dstDir, 'logs', 'nested', 'app.log'))).toBe(true);
  });

  test('excludes node_modules by default', () => {
    // Create node_modules in src
    fs.mkdirSync(path.join(srcDir, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'node_modules', 'test.js'), 'module');

    const freshDst = path.join(testDir, 'no-node-modules-dst');
    fs.mkdirSync(freshDst);
    copyGitIgnoredFiles(srcDir, freshDst);

    expect(fs.existsSync(path.join(freshDst, 'node_modules'))).toBe(false);
  });

  test('includes node_modules when option is set', () => {
    const nmDst = path.join(testDir, 'with-node-modules-dst');
    fs.mkdirSync(nmDst);
    copyGitIgnoredFiles(srcDir, nmDst, { includeNodeModules: true });

    expect(fs.existsSync(path.join(nmDst, 'node_modules', 'test.js'))).toBe(true);
  });

  test('does not copy tracked files', () => {
    // README.md is tracked, should not be copied
    // (It might exist if we manually put it there, so this test checks
    // that copyGitIgnoredFiles doesn't copy it as part of its operation)
    const readmeSrc = fs.readFileSync(path.join(srcDir, 'README.md'), 'utf-8');

    // Clear dst and re-run
    const freshDst = path.join(testDir, 'fresh-dst');
    fs.mkdirSync(freshDst);
    copyGitIgnoredFiles(srcDir, freshDst);

    // README.md should NOT be in fresh-dst since it's tracked
    expect(fs.existsSync(path.join(freshDst, 'README.md'))).toBe(false);
  });

  test('returns 0 when no files to copy', () => {
    const emptyRepo = path.join(testDir, 'empty-repo');
    fs.mkdirSync(emptyRepo);
    exec('git init', { cwd: emptyRepo });
    exec('git config user.email "test@test.com"', { cwd: emptyRepo });
    exec('git config user.name "Test User"', { cwd: emptyRepo });
    fs.writeFileSync(path.join(emptyRepo, 'file.txt'), 'tracked');
    exec('git add .', { cwd: emptyRepo });
    exec('git commit -m "Initial"', { cwd: emptyRepo });

    const emptyDst = path.join(testDir, 'empty-dst');
    fs.mkdirSync(emptyDst);

    const copied = copyGitIgnoredFiles(emptyRepo, emptyDst);
    expect(copied).toBe(0);
  });
});
