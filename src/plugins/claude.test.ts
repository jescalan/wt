import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { claudePlugin } from './claude.js';
import type { HookContext } from './types.js';
import { createLogger } from '../utils/logger.js';
import { execAsync } from '../core/git.js';

function createMockContext(overrides: Partial<HookContext> = {}): HookContext {
  return {
    repoRoot: '/test/repo',
    defaultBranch: 'main',
    branchName: 'feature-x',
    worktreePath: '/test/worktree',
    targetWorktree: '/test/main-worktree',
    logger: createLogger(),
    exec: execAsync,
    ...overrides,
  };
}

describe('claudePlugin', () => {
  test('creates plugin with correct name', () => {
    const plugin = claudePlugin();
    expect(plugin.name).toBe('claude');
  });

  test('has beforeRemove hook', () => {
    const plugin = claudePlugin();
    expect(plugin.hooks?.beforeRemove).toBeDefined();
  });

  test('accepts custom claudeHome option', () => {
    const plugin = claudePlugin({ claudeHome: '/custom/claude' });
    expect(plugin.name).toBe('claude');
  });

  describe('beforeRemove hook', () => {
    let testDir: string;
    let projectsDir: string;

    beforeEach(() => {
      testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-claude-test-'));
      projectsDir = path.join(testDir, 'projects');
      fs.mkdirSync(projectsDir, { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    test('skips when projects directory does not exist', async () => {
      const plugin = claudePlugin({ claudeHome: '/nonexistent/path' });
      const ctx = createMockContext();

      // Should not throw
      await plugin.hooks?.beforeRemove?.(ctx);
    });

    test('skips when no target worktree provided', async () => {
      const plugin = claudePlugin({ claudeHome: testDir });
      const ctx = createMockContext({ targetWorktree: undefined });

      // Should not throw
      await plugin.hooks?.beforeRemove?.(ctx);
    });

    test('skips when no sessions exist for worktree', async () => {
      const plugin = claudePlugin({ claudeHome: testDir });
      const ctx = createMockContext({
        worktreePath: '/nonexistent/worktree',
        targetWorktree: '/target',
      });

      // Should not throw
      await plugin.hooks?.beforeRemove?.(ctx);
    });

    test('moves session files from worktree to target directory', async () => {
      const oldWorktree = '/Users/test/worktree';
      const newWorktree = '/Users/test/main';

      // Create old project directory with session files
      // Claude encodes paths: /Users/test/worktree -> -Users-test-worktree
      const oldProjectDir = path.join(projectsDir, '-Users-test-worktree');
      fs.mkdirSync(oldProjectDir, { recursive: true });

      const sessionFile = 'abc123.jsonl';
      fs.writeFileSync(
        path.join(oldProjectDir, sessionFile),
        '{"message":"test session"}\n'
      );

      const plugin = claudePlugin({ claudeHome: testDir });
      const ctx = createMockContext({
        worktreePath: oldWorktree,
        targetWorktree: newWorktree,
        branchName: 'feature',
      });

      await plugin.hooks?.beforeRemove?.(ctx);

      // Check file was moved to new location
      const newProjectDir = path.join(projectsDir, '-Users-test-main');
      expect(fs.existsSync(path.join(newProjectDir, sessionFile))).toBe(true);

      // Old directory should be removed
      expect(fs.existsSync(oldProjectDir)).toBe(false);
    });

    test('creates target directory if it does not exist', async () => {
      const oldWorktree = '/Users/test/feature-branch';
      const newWorktree = '/Users/test/main';

      const oldProjectDir = path.join(projectsDir, '-Users-test-feature-branch');
      fs.mkdirSync(oldProjectDir, { recursive: true });
      fs.writeFileSync(
        path.join(oldProjectDir, 'session.jsonl'),
        '{"test":true}\n'
      );

      const newProjectDir = path.join(projectsDir, '-Users-test-main');
      expect(fs.existsSync(newProjectDir)).toBe(false);

      const plugin = claudePlugin({ claudeHome: testDir });
      const ctx = createMockContext({
        worktreePath: oldWorktree,
        targetWorktree: newWorktree,
        branchName: 'feature-branch',
      });

      await plugin.hooks?.beforeRemove?.(ctx);

      // New directory should be created
      expect(fs.existsSync(newProjectDir)).toBe(true);
      expect(fs.existsSync(path.join(newProjectDir, 'session.jsonl'))).toBe(true);
    });

    test('handles file collision by adding branch suffix', async () => {
      const oldWorktree = '/Users/test/worktree';
      const newWorktree = '/Users/test/main';

      const oldProjectDir = path.join(projectsDir, '-Users-test-worktree');
      const newProjectDir = path.join(projectsDir, '-Users-test-main');

      fs.mkdirSync(oldProjectDir, { recursive: true });
      fs.mkdirSync(newProjectDir, { recursive: true });

      // Same filename in both directories
      const sessionFile = 'conflict.jsonl';
      fs.writeFileSync(
        path.join(oldProjectDir, sessionFile),
        '{"from":"worktree"}\n'
      );
      fs.writeFileSync(
        path.join(newProjectDir, sessionFile),
        '{"from":"main"}\n'
      );

      const plugin = claudePlugin({ claudeHome: testDir });
      const ctx = createMockContext({
        worktreePath: oldWorktree,
        targetWorktree: newWorktree,
        branchName: 'feature-x',
      });

      await plugin.hooks?.beforeRemove?.(ctx);

      // Original file in target should remain
      expect(fs.existsSync(path.join(newProjectDir, sessionFile))).toBe(true);
      const originalContent = fs.readFileSync(
        path.join(newProjectDir, sessionFile),
        'utf-8'
      );
      expect(originalContent).toContain('from":"main');

      // Moved file should have branch suffix
      const movedFile = path.join(newProjectDir, 'conflict-feature-x.jsonl');
      expect(fs.existsSync(movedFile)).toBe(true);
      const movedContent = fs.readFileSync(movedFile, 'utf-8');
      expect(movedContent).toContain('from":"worktree');
    });

    test('moves multiple session files', async () => {
      const oldWorktree = '/Users/test/worktree';
      const newWorktree = '/Users/test/main';

      const oldProjectDir = path.join(projectsDir, '-Users-test-worktree');
      fs.mkdirSync(oldProjectDir, { recursive: true });

      // Create multiple session files
      const files = ['session1.jsonl', 'session2.jsonl', 'agent-abc.jsonl'];
      for (const file of files) {
        fs.writeFileSync(path.join(oldProjectDir, file), `{"file":"${file}"}\n`);
      }

      const plugin = claudePlugin({ claudeHome: testDir });
      const ctx = createMockContext({
        worktreePath: oldWorktree,
        targetWorktree: newWorktree,
        branchName: 'feature',
      });

      await plugin.hooks?.beforeRemove?.(ctx);

      // All files should be moved
      const newProjectDir = path.join(projectsDir, '-Users-test-main');
      for (const file of files) {
        expect(fs.existsSync(path.join(newProjectDir, file))).toBe(true);
      }

      // Old directory should be removed
      expect(fs.existsSync(oldProjectDir)).toBe(false);
    });

    test('handles path encoding correctly', async () => {
      // Test that slashes are properly converted to dashes
      const oldWorktree = '/Users/jeff/Sites/project/feature-branch';
      const newWorktree = '/Users/jeff/Sites/project';

      const oldProjectDir = path.join(
        projectsDir,
        '-Users-jeff-Sites-project-feature-branch'
      );
      fs.mkdirSync(oldProjectDir, { recursive: true });
      fs.writeFileSync(
        path.join(oldProjectDir, 'test.jsonl'),
        '{"test":true}\n'
      );

      const plugin = claudePlugin({ claudeHome: testDir });
      const ctx = createMockContext({
        worktreePath: oldWorktree,
        targetWorktree: newWorktree,
        branchName: 'feature-branch',
      });

      await plugin.hooks?.beforeRemove?.(ctx);

      const newProjectDir = path.join(projectsDir, '-Users-jeff-Sites-project');
      expect(fs.existsSync(path.join(newProjectDir, 'test.jsonl'))).toBe(true);
    });
  });
});
