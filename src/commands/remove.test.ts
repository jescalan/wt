import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { removeCommand } from './remove.js';
import { OnDefaultBranchError, WorktreeNotFoundError } from '../core/errors.js';

describe('removeCommand', () => {
  let testDir: string;
  let repoDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-remove-test-'));
    repoDir = path.join(testDir, 'repo');
    fs.mkdirSync(repoDir);

    // Initialize git repo with main as default branch
    execSync('git init -b main', { cwd: repoDir });
    execSync('git config user.email "test@test.com"', { cwd: repoDir });
    execSync('git config user.name "Test User"', { cwd: repoDir });
    fs.writeFileSync(path.join(repoDir, 'README.md'), '# Test');
    execSync('git add .', { cwd: repoDir });
    execSync('git commit -m "Initial commit"', { cwd: repoDir });

    process.chdir(repoDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('removes worktree with --force flag', async () => {
    const worktreePath = path.join(testDir, 'repo-feature');

    // Create a worktree
    execSync(`git worktree add -b feature "${worktreePath}"`);
    expect(fs.existsSync(worktreePath)).toBe(true);

    // Remove it with force
    await removeCommand({ name: 'feature', force: true });

    expect(fs.existsSync(worktreePath)).toBe(false);
  });

  test('throws error when trying to remove default branch', async () => {
    await expect(removeCommand({ name: 'main', force: true })).rejects.toThrow(OnDefaultBranchError);
  });

  test('throws error for non-existent worktree', async () => {
    await expect(removeCommand({ name: 'nonexistent', force: true })).rejects.toThrow(
      WorktreeNotFoundError
    );
  });

  test('deletes branch after removing worktree', async () => {
    const worktreePath = path.join(testDir, 'repo-feature');

    // Create a worktree
    execSync(`git worktree add -b feature "${worktreePath}"`);

    // Verify branch exists
    const branchesBefore = execSync('git branch', { cwd: repoDir, encoding: 'utf-8' });
    expect(branchesBefore).toContain('feature');

    // Remove with force
    await removeCommand({ name: 'feature', force: true });

    // Verify branch is deleted
    const branchesAfter = execSync('git branch', { cwd: repoDir, encoding: 'utf-8' });
    expect(branchesAfter).not.toContain('feature');
  });
});
