import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { statusCommand } from './status.js';

describe('statusCommand', () => {
  let testDir: string;
  let repoDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-status-test-'));
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

  test('outputs status table', () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      statusCommand();

      const output = logs.join('\n');
      expect(output).toContain('Repository:');
      expect(output).toContain('Default branch:');
      expect(output).toContain('Branch');
      expect(output).toContain('Path');
      expect(output).toContain('Status');
      expect(output).toContain('main');
    } finally {
      console.log = originalLog;
    }
  });

  test('shows multiple worktrees', () => {
    const worktreePath = path.join(testDir, 'repo-feature');
    execSync(`git worktree add -b feature "${worktreePath}"`);

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      statusCommand();

      const output = logs.join('\n');
      expect(output).toContain('main');
      expect(output).toContain('feature');
      expect(output).toContain('2 worktrees');
    } finally {
      console.log = originalLog;
    }
  });

  test('shows modified status for uncommitted changes', () => {
    // Create uncommitted change
    fs.writeFileSync(path.join(repoDir, 'uncommitted.txt'), 'uncommitted');

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      statusCommand();

      const output = logs.join('\n');
      expect(output).toContain('modified');
    } finally {
      console.log = originalLog;
    }
  });
});
