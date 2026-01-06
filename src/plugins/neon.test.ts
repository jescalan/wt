import { describe, expect, test, beforeAll, afterAll, spyOn } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { neonPlugin } from './neon.js';
import type { HookContext } from './types.js';
import { createLogger } from '../utils/logger.js';
import { execAsync } from '../core/git.js';

function createMockContext(overrides: Partial<HookContext> = {}): HookContext {
  return {
    repoRoot: '/test/repo',
    defaultBranch: 'main',
    branchName: 'feature-x',
    worktreePath: '/test/worktree',
    sourceWorktree: '/test/repo',
    logger: createLogger(),
    exec: execAsync,
    ...overrides,
  };
}

describe('neonPlugin', () => {
  test('creates plugin with correct name', () => {
    const plugin = neonPlugin();
    expect(plugin.name).toBe('neon');
  });

  test('has afterCreate and beforeRemove hooks', () => {
    const plugin = neonPlugin();
    expect(plugin.hooks?.afterCreate).toBeDefined();
    expect(plugin.hooks?.beforeRemove).toBeDefined();
  });

  test('accepts custom options', () => {
    const plugin = neonPlugin({
      projectIdEnvVar: 'CUSTOM_PROJECT_ID',
      envFile: '.env.local',
    });
    expect(plugin.name).toBe('neon');
  });

  test('accepts parentBranch option', () => {
    const plugin = neonPlugin({
      parentBranch: 'current',
    });
    expect(plugin.name).toBe('neon');

    const plugin2 = neonPlugin({
      parentBranch: 'staging',
    });
    expect(plugin2.name).toBe('neon');
  });

  describe('afterCreate hook', () => {
    let testDir: string;
    let originalEnv: string | undefined;

    beforeAll(() => {
      testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-neon-test-'));
      originalEnv = process.env.NEON_PROJECT_ID;
      delete process.env.NEON_PROJECT_ID;
    });

    afterAll(() => {
      fs.rmSync(testDir, { recursive: true, force: true });
      if (originalEnv !== undefined) {
        process.env.NEON_PROJECT_ID = originalEnv;
      }
    });

    test('skips when no project ID found', async () => {
      const plugin = neonPlugin();
      const debugSpy = spyOn(console, 'error').mockImplementation(() => {});

      const ctx = createMockContext({
        sourceWorktree: testDir,
        worktreePath: testDir,
        logger: createLogger(true), // Enable debug to see skip message
      });

      await plugin.hooks?.afterCreate?.(ctx);

      debugSpy.mockRestore();
      // Should not throw, just skip silently
    });

    test('reads project ID from .env file', async () => {
      const srcDir = path.join(testDir, 'src');
      const dstDir = path.join(testDir, 'dst');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.mkdirSync(dstDir, { recursive: true });

      fs.writeFileSync(path.join(srcDir, '.env'), 'NEON_PROJECT_ID=test-project-123');
      fs.writeFileSync(path.join(dstDir, '.env'), 'DATABASE_URL=old-url');

      const plugin = neonPlugin();

      // The hook will try to run neon CLI which won't exist in tests
      // So we just verify it doesn't crash and handles missing CLI gracefully
      const ctx = createMockContext({
        sourceWorktree: srcDir,
        worktreePath: dstDir,
      });

      await plugin.hooks?.afterCreate?.(ctx);
      // Should not throw
    });

    test('reads project ID from environment variable', async () => {
      process.env.NEON_PROJECT_ID = 'env-project-456';

      const plugin = neonPlugin();
      const ctx = createMockContext();

      // Should not throw even when neon CLI is not installed
      await plugin.hooks?.afterCreate?.(ctx);

      delete process.env.NEON_PROJECT_ID;
    });
  });

  describe('beforeRemove hook', () => {
    test('skips when no project ID found', async () => {
      const plugin = neonPlugin();
      const ctx = createMockContext({
        targetWorktree: '/nonexistent/path',
      });

      // Should not throw
      await plugin.hooks?.beforeRemove?.(ctx);
    });
  });
});
