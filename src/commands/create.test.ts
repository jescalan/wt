import { describe, expect, test, beforeEach, afterEach, spyOn } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { exec } from '../core/git.js';

// Since createCommand relies on process.cwd(), we test the underlying logic
// through integration tests that manage their own directory context

describe('createCommand integration', () => {
  let testDir: string;
  let consoleLogOutput: string[];
  let consoleErrorOutput: string[];
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    // Create a fresh test repo for each test
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-create-test-'));

    // Initialize git repo
    exec('git init', { cwd: testDir });
    exec('git config user.email "test@test.com"', { cwd: testDir });
    exec('git config user.name "Test User"', { cwd: testDir });
    fs.writeFileSync(path.join(testDir, 'README.md'), '# Test');
    exec('git add .', { cwd: testDir });
    exec('git commit -m "Initial commit"', { cwd: testDir });

    consoleLogOutput = [];
    consoleErrorOutput = [];
    consoleLogSpy = spyOn(console, 'log').mockImplementation((msg: string) => {
      consoleLogOutput.push(msg);
    });
    consoleErrorSpy = spyOn(console, 'error').mockImplementation((msg: string) => {
      consoleErrorOutput.push(msg);
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();

    // Clean up test directory and any worktrees
    const parentDir = path.dirname(testDir);
    const baseName = path.basename(testDir);
    try {
      const entries = fs.readdirSync(parentDir);
      for (const entry of entries) {
        if (entry.startsWith(baseName)) {
          fs.rmSync(path.join(parentDir, entry), { recursive: true, force: true });
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  test('git worktree add creates worktree with new branch', () => {
    const branchName = 'feature-test';
    const repoName = path.basename(testDir);
    const worktreePath = path.join(testDir, '..', `${repoName}-${branchName}`);

    const result = exec(`git worktree add -b "${branchName}" "${worktreePath}"`, { cwd: testDir });
    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(worktreePath)).toBe(true);

    // Verify branch exists
    const branchCheck = exec(`git show-ref --verify --quiet refs/heads/${branchName}`, { cwd: testDir });
    expect(branchCheck.exitCode).toBe(0);
  });

  test('git worktree add uses existing branch', () => {
    const branchName = 'existing-branch';
    const repoName = path.basename(testDir);
    const worktreePath = path.join(testDir, '..', `${repoName}-${branchName}`);

    // Create branch first
    exec(`git branch "${branchName}"`, { cwd: testDir });

    // Add worktree for existing branch (no -b flag)
    const result = exec(`git worktree add "${worktreePath}" "${branchName}"`, { cwd: testDir });
    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(worktreePath)).toBe(true);
  });

  test('fails when worktree path already exists with content', () => {
    const branchName = 'conflict-test';
    const repoName = path.basename(testDir);
    const worktreePath = path.join(testDir, '..', `${repoName}-${branchName}`);

    // Create the directory with a file (git won't overwrite non-empty dirs)
    fs.mkdirSync(worktreePath);
    fs.writeFileSync(path.join(worktreePath, 'existing-file.txt'), 'content');

    const result = exec(`git worktree add -b "${branchName}" "${worktreePath}"`, { cwd: testDir });
    expect(result.exitCode).not.toBe(0);
  });

  test('worktree includes files from source', () => {
    const branchName = 'files-test';
    const repoName = path.basename(testDir);
    const worktreePath = path.join(testDir, '..', `${repoName}-${branchName}`);

    exec(`git worktree add -b "${branchName}" "${worktreePath}"`, { cwd: testDir });

    // README.md should exist in new worktree (it's tracked)
    expect(fs.existsSync(path.join(worktreePath, 'README.md'))).toBe(true);
  });
});

describe('gitignored file copying', () => {
  let testDir: string;
  let worktreeDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-gitignore-test-'));
    worktreeDir = `${testDir}-worktree`;

    // Initialize git repo
    exec('git init', { cwd: testDir });
    exec('git config user.email "test@test.com"', { cwd: testDir });
    exec('git config user.name "Test User"', { cwd: testDir });

    // Create gitignore and ignored files
    fs.writeFileSync(path.join(testDir, '.gitignore'), '.env\n*.log\n');
    fs.writeFileSync(path.join(testDir, 'README.md'), '# Test');
    fs.writeFileSync(path.join(testDir, '.env'), 'SECRET=123');
    fs.writeFileSync(path.join(testDir, 'debug.log'), 'log content');

    exec('git add .', { cwd: testDir });
    exec('git commit -m "Initial"', { cwd: testDir });

    // Create worktree
    exec(`git worktree add -b test-branch "${worktreeDir}"`, { cwd: testDir });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    if (fs.existsSync(worktreeDir)) {
      fs.rmSync(worktreeDir, { recursive: true, force: true });
    }
  });

  test('gitignored files are not in new worktree by default', () => {
    // Git doesn't copy ignored files
    expect(fs.existsSync(path.join(worktreeDir, '.env'))).toBe(false);
    expect(fs.existsSync(path.join(worktreeDir, 'debug.log'))).toBe(false);
  });

  test('copyGitIgnoredFiles copies ignored files', async () => {
    const { copyGitIgnoredFiles } = await import('../core/files.js');

    const copied = copyGitIgnoredFiles(testDir, worktreeDir);
    expect(copied).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(worktreeDir, '.env'))).toBe(true);
    expect(fs.readFileSync(path.join(worktreeDir, '.env'), 'utf-8')).toBe('SECRET=123');
  });
});
