import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  exec,
  execAsync,
  commandExists,
} from './git.js';

describe('exec', () => {
  test('returns stdout for successful command', () => {
    const result = exec('echo hello');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('hello');
    expect(result.stderr).toBe('');
  });

  test('returns exit code and stderr for failed command', () => {
    const result = exec('ls /nonexistent-path-12345');
    expect(result.exitCode).not.toBe(0);
  });

  test('respects cwd option', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-test-'));
    try {
      const result = exec('pwd', { cwd: tmpDir });
      expect(result.exitCode).toBe(0);
      // The paths should match (accounting for symlinks)
      expect(fs.realpathSync(result.stdout)).toBe(fs.realpathSync(tmpDir));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('execAsync', () => {
  test('returns same result as exec', async () => {
    const result = await execAsync('echo async');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('async');
  });
});

describe('commandExists', () => {
  test('returns true for existing command', () => {
    expect(commandExists('git')).toBe(true);
  });

  test('returns true for node', () => {
    expect(commandExists('node')).toBe(true);
  });

  test('returns false for non-existent command', () => {
    expect(commandExists('nonexistent-command-xyz-12345')).toBe(false);
  });
});

describe('git operations in isolated test repo', () => {
  let testDir: string;

  beforeAll(() => {
    // Create a temporary test git repo
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-git-test-'));

    // Initialize git repo
    exec('git init', { cwd: testDir });
    exec('git config user.email "test@test.com"', { cwd: testDir });
    exec('git config user.name "Test User"', { cwd: testDir });

    // Create initial commit
    fs.writeFileSync(path.join(testDir, 'README.md'), '# Test');
    exec('git add .', { cwd: testDir });
    exec('git commit -m "Initial commit"', { cwd: testDir });
  });

  afterAll(() => {
    // Clean up test directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('git rev-parse works in test repo', () => {
    const result = exec('git rev-parse --is-inside-work-tree', { cwd: testDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('true');
  });

  test('git rev-parse --show-toplevel returns correct path', () => {
    const result = exec('git rev-parse --show-toplevel', { cwd: testDir });
    expect(result.exitCode).toBe(0);
    expect(fs.realpathSync(result.stdout)).toBe(fs.realpathSync(testDir));
  });

  test('git symbolic-ref returns branch name', () => {
    const result = exec('git symbolic-ref --quiet --short HEAD', { cwd: testDir });
    expect(result.exitCode).toBe(0);
    expect(['main', 'master']).toContain(result.stdout);
  });

  test('git show-ref verifies branch exists', () => {
    const branch = exec('git symbolic-ref --quiet --short HEAD', { cwd: testDir }).stdout;
    const result = exec(`git show-ref --verify --quiet refs/heads/${branch}`, { cwd: testDir });
    expect(result.exitCode).toBe(0);
  });

  test('git worktree list returns at least one worktree', () => {
    const result = exec('git worktree list --porcelain', { cwd: testDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('worktree ');
  });

  test('creating and removing worktree', () => {
    const branchName = 'test-worktree-branch';
    const worktreePath = path.join(testDir, '..', `wt-git-test-${branchName}`);

    try {
      // Create worktree
      const createResult = exec(`git worktree add -b "${branchName}" "${worktreePath}"`, { cwd: testDir });
      expect(createResult.exitCode).toBe(0);
      expect(fs.existsSync(worktreePath)).toBe(true);

      // Verify branch exists
      const branchCheck = exec(`git show-ref --verify --quiet refs/heads/${branchName}`, { cwd: testDir });
      expect(branchCheck.exitCode).toBe(0);

      // Verify worktree is listed
      const listResult = exec('git worktree list --porcelain', { cwd: testDir });
      expect(listResult.stdout).toContain(branchName);

      // Remove worktree
      const removeResult = exec(`git worktree remove "${worktreePath}"`, { cwd: testDir });
      expect(removeResult.exitCode).toBe(0);
      expect(fs.existsSync(worktreePath)).toBe(false);
    } finally {
      // Cleanup in case test fails
      if (fs.existsSync(worktreePath)) {
        exec(`git worktree remove "${worktreePath}" --force`, { cwd: testDir });
      }
      exec(`git branch -D "${branchName}"`, { cwd: testDir });
    }
  });
});

describe('git operations outside repo', () => {
  let testDir: string;

  beforeAll(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-norepo-'));
  });

  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('git rev-parse fails outside repo', () => {
    const result = exec('git rev-parse --is-inside-work-tree', { cwd: testDir });
    expect(result.exitCode).not.toBe(0);
  });
});
