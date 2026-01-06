import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { getWorktreeList } from './list.js';

describe('listCommand', () => {
  let testDir: string;
  let repoDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-list-test-'));
    repoDir = path.join(testDir, 'repo');
    fs.mkdirSync(repoDir);

    // Initialize git repo with main as default branch
    execSync('git init -b main', { cwd: repoDir });
    execSync('git config user.email "test@test.com"', { cwd: repoDir });
    execSync('git config user.name "Test User"', { cwd: repoDir });
    fs.writeFileSync(path.join(repoDir, 'README.md'), '# Test');
    execSync('git add .', { cwd: repoDir });
    execSync('git commit -m "Initial commit"', { cwd: repoDir });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('returns worktree info with default branch', () => {
    const originalCwd = process.cwd();
    process.chdir(repoDir);

    try {
      const list = getWorktreeList();
      expect(list.length).toBe(1);
      expect(list[0]!.isCurrent).toBe(true);
      expect(list[0]!.isDefault).toBe(true);
      expect(list[0]!.branch).toBe('main');
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('includes ahead/behind info for feature branches', () => {
    const worktreePath = path.join(testDir, 'repo-feature');

    const originalCwd = process.cwd();
    process.chdir(repoDir);

    try {
      // Create a worktree with a new branch
      execSync(`git worktree add -b feature "${worktreePath}"`, { cwd: repoDir });

      // Make a commit on the feature branch
      fs.writeFileSync(path.join(worktreePath, 'feature.txt'), 'feature content');
      execSync('git add .', { cwd: worktreePath });
      execSync('git commit -m "Feature commit"', { cwd: worktreePath });

      const list = getWorktreeList();
      const featureWt = list.find((wt) => wt.branch === 'feature');

      expect(featureWt).toBeDefined();
      expect(featureWt!.ahead).toBe(1);
      expect(featureWt!.behind).toBe(0);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('includes uncommitted changes count', () => {
    const originalCwd = process.cwd();
    process.chdir(repoDir);

    try {
      // Create uncommitted change
      fs.writeFileSync(path.join(repoDir, 'uncommitted.txt'), 'uncommitted');

      const list = getWorktreeList();
      expect(list[0]!.uncommitted).toBe(1);
    } finally {
      process.chdir(originalCwd);
    }
  });
});
