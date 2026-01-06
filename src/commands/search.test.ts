import { describe, expect, test, beforeEach, afterEach, spyOn } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { exec } from '../core/git.js';

describe('search/list worktrees integration', () => {
  let testDir: string;
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-search-test-'));

    // Initialize git repo
    exec('git init', { cwd: testDir });
    exec('git config user.email "test@test.com"', { cwd: testDir });
    exec('git config user.name "Test User"', { cwd: testDir });
    fs.writeFileSync(path.join(testDir, 'README.md'), '# Test');
    exec('git add .', { cwd: testDir });
    exec('git commit -m "Initial commit"', { cwd: testDir });

    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();

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
      // Ignore
    }
  });

  test('lists single worktree', () => {
    const result = exec('git worktree list --porcelain', { cwd: testDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('worktree ');
    expect(result.stdout).toContain('branch refs/heads/');
  });

  test('lists multiple worktrees', () => {
    const branch1 = 'feature-1';
    const branch2 = 'feature-2';
    const wt1 = path.join(testDir, '..', `${path.basename(testDir)}-${branch1}`);
    const wt2 = path.join(testDir, '..', `${path.basename(testDir)}-${branch2}`);

    exec(`git worktree add -b "${branch1}" "${wt1}"`, { cwd: testDir });
    exec(`git worktree add -b "${branch2}" "${wt2}"`, { cwd: testDir });

    const result = exec('git worktree list --porcelain', { cwd: testDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(branch1);
    expect(result.stdout).toContain(branch2);
  });

  test('parses worktree list correctly', () => {
    const branch = 'parse-test';
    const wt = path.join(testDir, '..', `${path.basename(testDir)}-${branch}`);
    exec(`git worktree add -b "${branch}" "${wt}"`, { cwd: testDir });

    const result = exec('git worktree list --porcelain', { cwd: testDir });

    // Parse the output
    const lines = result.stdout.split('\n');
    const worktrees: { path: string; branch: string }[] = [];
    let current: { path?: string; branch?: string } = {};

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        current.path = line.slice(9);
      } else if (line.startsWith('branch ')) {
        current.branch = line.slice(7).replace('refs/heads/', '');
      } else if (line === '') {
        if (current.path && current.branch) {
          worktrees.push({ path: current.path, branch: current.branch });
        }
        current = {};
      }
    }

    // Handle last entry
    if (current.path && current.branch) {
      worktrees.push({ path: current.path, branch: current.branch });
    }

    expect(worktrees.length).toBe(2);
    expect(worktrees.some((w) => w.branch === branch)).toBe(true);
  });
});

describe('interactive selection (unit tests)', () => {
  test('choices are formatted correctly', () => {
    const worktrees = [
      { path: '/path/to/main', branch: 'main' },
      { path: '/path/to/feature', branch: 'feature-x' },
    ];

    const choices = worktrees.map((wt, index) => ({
      index,
      path: wt.path,
      branch: wt.branch,
      display: `${wt.path}  ${wt.branch}`,
    }));

    expect(choices).toHaveLength(2);
    expect(choices[0]?.display).toBe('/path/to/main  main');
    expect(choices[1]?.display).toBe('/path/to/feature  feature-x');
  });

  test('detached worktrees are handled', () => {
    const worktree = {
      path: '/path/to/detached',
      branch: null,
      isDetached: true,
    };

    const branch = worktree.isDetached ? '(detached)' : worktree.branch ?? '(unknown)';
    expect(branch).toBe('(detached)');
  });
});
