import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { codexPlugin } from './codex.js';
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

describe('codexPlugin', () => {
  test('creates plugin with correct name', () => {
    const plugin = codexPlugin();
    expect(plugin.name).toBe('codex');
  });

  test('has beforeRemove hook', () => {
    const plugin = codexPlugin();
    expect(plugin.hooks?.beforeRemove).toBeDefined();
  });

  test('accepts custom codexHome option', () => {
    const plugin = codexPlugin({ codexHome: '/custom/codex' });
    expect(plugin.name).toBe('codex');
  });

  describe('beforeRemove hook', () => {
    let testDir: string;
    let sessionsDir: string;

    beforeAll(() => {
      testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-codex-test-'));
      sessionsDir = path.join(testDir, 'sessions');
      fs.mkdirSync(sessionsDir, { recursive: true });
    });

    afterAll(() => {
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    test('skips when sessions directory does not exist', async () => {
      const plugin = codexPlugin({ codexHome: '/nonexistent/path' });
      const ctx = createMockContext();

      // Should not throw
      await plugin.hooks?.beforeRemove?.(ctx);
    });

    test('skips when no target worktree provided', async () => {
      const plugin = codexPlugin({ codexHome: testDir });
      const ctx = createMockContext({ targetWorktree: undefined });

      // Should not throw
      await plugin.hooks?.beforeRemove?.(ctx);
    });

    test('patches session files with matching cwd', async () => {
      const oldCwd = '/old/worktree/path';
      const newCwd = '/new/worktree/path';

      // Create a session file with the old cwd
      const sessionFile = path.join(sessionsDir, 'test-session.jsonl');
      fs.writeFileSync(
        sessionFile,
        `{"id":"1","cwd":"${oldCwd}","message":"test"}\n{"id":"2","cwd":"${oldCwd}","other":"data"}\n`
      );

      const plugin = codexPlugin({ codexHome: testDir });
      const ctx = createMockContext({
        worktreePath: oldCwd,
        targetWorktree: newCwd,
      });

      await plugin.hooks?.beforeRemove?.(ctx);

      // Check file was patched
      const content = fs.readFileSync(sessionFile, 'utf-8');
      expect(content).not.toContain(`"cwd":"${oldCwd}"`);
      expect(content).toContain(`"cwd":"${newCwd}"`);
    });

    test('does not modify files without matching cwd', async () => {
      const sessionFile = path.join(sessionsDir, 'unrelated-session.jsonl');
      const originalContent = '{"id":"1","cwd":"/different/path","message":"test"}\n';
      fs.writeFileSync(sessionFile, originalContent);

      const plugin = codexPlugin({ codexHome: testDir });
      const ctx = createMockContext({
        worktreePath: '/some/other/path',
        targetWorktree: '/target/path',
      });

      await plugin.hooks?.beforeRemove?.(ctx);

      // File should be unchanged
      const content = fs.readFileSync(sessionFile, 'utf-8');
      expect(content).toBe(originalContent);
    });

    test('handles nested session directories', async () => {
      const nestedDir = path.join(sessionsDir, 'nested', 'deep');
      fs.mkdirSync(nestedDir, { recursive: true });

      const oldCwd = '/nested/worktree';
      const newCwd = '/nested/target';

      const nestedFile = path.join(nestedDir, 'nested-session.jsonl');
      fs.writeFileSync(nestedFile, `{"cwd":"${oldCwd}"}\n`);

      const plugin = codexPlugin({ codexHome: testDir });
      const ctx = createMockContext({
        worktreePath: oldCwd,
        targetWorktree: newCwd,
      });

      await plugin.hooks?.beforeRemove?.(ctx);

      const content = fs.readFileSync(nestedFile, 'utf-8');
      expect(content).toContain(`"cwd":"${newCwd}"`);
    });

    test('handles multiple session files', async () => {
      const oldCwd = '/multi/worktree';
      const newCwd = '/multi/target';

      // Create multiple session files
      for (let i = 0; i < 3; i++) {
        const file = path.join(sessionsDir, `multi-session-${i}.jsonl`);
        fs.writeFileSync(file, `{"cwd":"${oldCwd}","index":${i}}\n`);
      }

      const plugin = codexPlugin({ codexHome: testDir });
      const ctx = createMockContext({
        worktreePath: oldCwd,
        targetWorktree: newCwd,
      });

      await plugin.hooks?.beforeRemove?.(ctx);

      // Check all files were patched
      for (let i = 0; i < 3; i++) {
        const file = path.join(sessionsDir, `multi-session-${i}.jsonl`);
        const content = fs.readFileSync(file, 'utf-8');
        expect(content).toContain(`"cwd":"${newCwd}"`);
      }
    });
  });
});
