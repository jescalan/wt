import { describe, expect, test, beforeAll, afterAll, spyOn } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { planetscalePlugin } from './planetscale.js';
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

describe('planetscalePlugin', () => {
  test('creates plugin with correct name', () => {
    const plugin = planetscalePlugin();
    expect(plugin.name).toBe('planetscale');
  });

  test('has afterCreate and beforeRemove hooks', () => {
    const plugin = planetscalePlugin();
    expect(plugin.hooks?.afterCreate).toBeDefined();
    expect(plugin.hooks?.beforeRemove).toBeDefined();
  });

  test('accepts custom options', () => {
    const plugin = planetscalePlugin({
      databaseEnvVar: 'CUSTOM_DATABASE',
      orgEnvVar: 'CUSTOM_ORG',
      envFile: '.env.local',
    });
    expect(plugin.name).toBe('planetscale');
  });

  test('accepts parentBranch option', () => {
    const plugin = planetscalePlugin({
      parentBranch: 'current',
    });
    expect(plugin.name).toBe('planetscale');

    const plugin2 = planetscalePlugin({
      parentBranch: 'staging',
    });
    expect(plugin2.name).toBe('planetscale');
  });

  describe('afterCreate hook', () => {
    let testDir: string;
    let originalDbEnv: string | undefined;
    let originalOrgEnv: string | undefined;

    beforeAll(() => {
      testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-planetscale-test-'));
      originalDbEnv = process.env.PLANETSCALE_DATABASE;
      originalOrgEnv = process.env.PLANETSCALE_ORG;
      delete process.env.PLANETSCALE_DATABASE;
      delete process.env.PLANETSCALE_ORG;
    });

    afterAll(() => {
      fs.rmSync(testDir, { recursive: true, force: true });
      if (originalDbEnv !== undefined) {
        process.env.PLANETSCALE_DATABASE = originalDbEnv;
      }
      if (originalOrgEnv !== undefined) {
        process.env.PLANETSCALE_ORG = originalOrgEnv;
      }
    });

    test('skips when no database name found', async () => {
      const plugin = planetscalePlugin();
      const debugSpy = spyOn(console, 'error').mockImplementation(() => {});

      const ctx = createMockContext({
        sourceWorktree: testDir,
        worktreePath: testDir,
        logger: createLogger(true),
      });

      await plugin.hooks?.afterCreate?.(ctx);

      debugSpy.mockRestore();
      // Should not throw, just skip silently
    });

    test('reads database name from .env file', async () => {
      const srcDir = path.join(testDir, 'src');
      const dstDir = path.join(testDir, 'dst');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.mkdirSync(dstDir, { recursive: true });

      fs.writeFileSync(path.join(srcDir, '.env'), 'PLANETSCALE_DATABASE=test-db\nPLANETSCALE_ORG=test-org');
      fs.writeFileSync(path.join(dstDir, '.env'), 'DATABASE_URL=old-url');

      const plugin = planetscalePlugin();

      // Mock exec to avoid actually calling pscale CLI
      const mockExec = async () => ({ stdout: '', stderr: 'mock error', exitCode: 1 });

      const ctx = createMockContext({
        sourceWorktree: srcDir,
        worktreePath: dstDir,
        exec: mockExec,
      });

      await plugin.hooks?.afterCreate?.(ctx);
      // Should not throw
    });

    test('reads database name from environment variable', async () => {
      process.env.PLANETSCALE_DATABASE = 'env-db-456';

      const plugin = planetscalePlugin();

      // Mock exec to avoid actually calling pscale CLI
      const mockExec = async () => ({ stdout: '', stderr: 'mock error', exitCode: 1 });

      const ctx = createMockContext({
        exec: mockExec,
      });

      await plugin.hooks?.afterCreate?.(ctx);

      delete process.env.PLANETSCALE_DATABASE;
    });

    test('reads org from environment variable', async () => {
      process.env.PLANETSCALE_DATABASE = 'test-db';
      process.env.PLANETSCALE_ORG = 'test-org';

      const plugin = planetscalePlugin();

      // Mock exec to avoid actually calling pscale CLI
      const mockExec = async () => ({ stdout: '', stderr: 'mock error', exitCode: 1 });

      const ctx = createMockContext({
        exec: mockExec,
      });

      await plugin.hooks?.afterCreate?.(ctx);

      delete process.env.PLANETSCALE_DATABASE;
      delete process.env.PLANETSCALE_ORG;
    });
  });

  describe('beforeRemove hook', () => {
    test('skips when no database name found', async () => {
      const plugin = planetscalePlugin();
      const ctx = createMockContext({
        targetWorktree: '/nonexistent/path',
      });

      // Should not throw
      await plugin.hooks?.beforeRemove?.(ctx);
    });
  });
});
