import { describe, expect, test, mock } from 'bun:test';
import { runHooks, createHookRunner } from './runner.js';
import type { ResolvedConfig, WtPlugin, HookContext } from './types.js';
import { defaultSettings } from './types.js';

function createTestContext(): Omit<HookContext, 'logger' | 'exec'> {
  return {
    repoRoot: '/test/repo',
    defaultBranch: 'main',
    branchName: 'feature-x',
    worktreePath: '/test/repo-feature-x',
    sourceWorktree: '/test/repo',
  };
}

function createTestConfig(
  plugins: WtPlugin[] = [],
  hooks: ResolvedConfig['hooks'] = {}
): ResolvedConfig {
  return {
    settings: { ...defaultSettings },
    plugins,
    hooks,
  };
}

describe('runHooks', () => {
  test('runs plugin hooks in order', async () => {
    const order: string[] = [];

    const plugin1: WtPlugin = {
      name: 'plugin1',
      hooks: {
        afterCreate: async () => {
          order.push('plugin1');
        },
      },
    };

    const plugin2: WtPlugin = {
      name: 'plugin2',
      hooks: {
        afterCreate: async () => {
          order.push('plugin2');
        },
      },
    };

    const config = createTestConfig([plugin1, plugin2]);
    await runHooks({
      hookName: 'afterCreate',
      config,
      context: createTestContext(),
    });

    expect(order).toEqual(['plugin1', 'plugin2']);
  });

  test('runs inline hooks after plugin hooks', async () => {
    const order: string[] = [];

    const plugin: WtPlugin = {
      name: 'plugin',
      hooks: {
        afterCreate: async () => {
          order.push('plugin');
        },
      },
    };

    const config = createTestConfig([plugin], {
      afterCreate: async () => {
        order.push('inline');
      },
    });

    await runHooks({
      hookName: 'afterCreate',
      config,
      context: createTestContext(),
    });

    expect(order).toEqual(['plugin', 'inline']);
  });

  test('continues running hooks even if one fails', async () => {
    const order: string[] = [];

    const failingPlugin: WtPlugin = {
      name: 'failing',
      hooks: {
        afterCreate: async () => {
          order.push('failing');
          throw new Error('Plugin failed');
        },
      },
    };

    const successPlugin: WtPlugin = {
      name: 'success',
      hooks: {
        afterCreate: async () => {
          order.push('success');
        },
      },
    };

    const config = createTestConfig([failingPlugin, successPlugin]);

    // Should not throw
    await runHooks({
      hookName: 'afterCreate',
      config,
      context: createTestContext(),
    });

    // Both should have run
    expect(order).toEqual(['failing', 'success']);
  });

  test('provides context to hooks', async () => {
    let receivedContext: HookContext | null = null;

    const plugin: WtPlugin = {
      name: 'context-test',
      hooks: {
        beforeMerge: async (ctx) => {
          receivedContext = ctx;
        },
      },
    };

    const config = createTestConfig([plugin]);
    const context = createTestContext();

    await runHooks({
      hookName: 'beforeMerge',
      config,
      context,
    });

    expect(receivedContext).not.toBeNull();
    expect(receivedContext!.branchName).toBe('feature-x');
    expect(receivedContext!.repoRoot).toBe('/test/repo');
    expect(receivedContext!.logger).toBeDefined();
    expect(receivedContext!.exec).toBeDefined();
  });

  test('skips hooks that are not defined', async () => {
    const plugin: WtPlugin = {
      name: 'partial',
      hooks: {
        afterCreate: async () => {
          // Only afterCreate defined
        },
      },
    };

    const config = createTestConfig([plugin]);

    // Should not throw when running a hook that's not defined
    await runHooks({
      hookName: 'beforeMerge',
      config,
      context: createTestContext(),
    });
  });

  test('handles plugins without hooks', async () => {
    const plugin: WtPlugin = {
      name: 'no-hooks',
      // No hooks defined
    };

    const config = createTestConfig([plugin]);

    // Should not throw
    await runHooks({
      hookName: 'afterCreate',
      config,
      context: createTestContext(),
    });
  });
});

describe('createHookRunner', () => {
  test('creates a function that runs hooks', async () => {
    let hookRan = false;

    const plugin: WtPlugin = {
      name: 'test',
      hooks: {
        afterCreate: async () => {
          hookRan = true;
        },
      },
    };

    const config = createTestConfig([plugin]);
    const runHook = createHookRunner(config);

    await runHook('afterCreate', createTestContext());

    expect(hookRan).toBe(true);
  });

  test('runner reuses config', async () => {
    const calls: string[] = [];

    const plugin: WtPlugin = {
      name: 'multi',
      hooks: {
        beforeCreate: async () => { calls.push('beforeCreate'); },
        afterCreate: async () => { calls.push('afterCreate'); },
      },
    };

    const config = createTestConfig([plugin]);
    const runHook = createHookRunner(config);

    await runHook('beforeCreate', createTestContext());
    await runHook('afterCreate', createTestContext());

    expect(calls).toEqual(['beforeCreate', 'afterCreate']);
  });
});

describe('string command hooks', () => {
  // Use a real directory for tests that execute commands
  const realContext = (): Omit<HookContext, 'logger' | 'exec'> => ({
    repoRoot: process.cwd(),
    defaultBranch: 'main',
    branchName: 'feature-x',
    worktreePath: process.cwd(), // Use real cwd so commands work
    sourceWorktree: process.cwd(),
  });

  test('executes a string command', async () => {
    const config = createTestConfig([], {
      afterCreate: 'echo "hello from hook"',
    });

    // Should not throw
    await runHooks({
      hookName: 'afterCreate',
      config,
      context: realContext(),
    });
  });

  test('executes an array of functions in order', async () => {
    const commands: string[] = [];

    const config = createTestConfig([], {
      afterCreate: [
        async () => { commands.push('first'); },
        async () => { commands.push('second'); },
        async () => { commands.push('third'); },
      ],
    });

    await runHooks({
      hookName: 'afterCreate',
      config,
      context: realContext(),
    });

    expect(commands).toEqual(['first', 'second', 'third']);
  });

  test('executes mixed array of commands and functions', async () => {
    const order: string[] = [];

    const config = createTestConfig([], {
      afterCreate: [
        async () => { order.push('function1'); },
        'echo test',
        async () => { order.push('function2'); },
      ],
    });

    await runHooks({
      hookName: 'afterCreate',
      config,
      context: realContext(),
    });

    // Functions should have run in order (command runs between them)
    expect(order).toEqual(['function1', 'function2']);
  });

  test('stops array execution on command failure but continues to next hook', async () => {
    const order: string[] = [];

    const plugin = {
      name: 'test-plugin',
      hooks: {
        afterCreate: async () => { order.push('plugin'); },
      },
    };

    const config = createTestConfig([plugin], {
      afterCreate: [
        async () => { order.push('before'); },
        'exit 1',  // This will fail
        async () => { order.push('after'); },
      ],
    });

    await runHooks({
      hookName: 'afterCreate',
      config,
      context: realContext(),
    });

    // Plugin runs, then inline starts but stops at 'exit 1'
    expect(order).toEqual(['plugin', 'before']);
  });

  test('executes multiple string commands in sequence', async () => {
    const config = createTestConfig([], {
      afterCreate: [
        'echo first',
        'echo second',
        'echo third',
      ],
    });

    // Should not throw
    await runHooks({
      hookName: 'afterCreate',
      config,
      context: realContext(),
    });
  });

  test('single string command works', async () => {
    const config = createTestConfig([], {
      afterCreate: 'echo single',
    });

    await runHooks({
      hookName: 'afterCreate',
      config,
      context: realContext(),
    });
  });
});

describe('hook context utilities', () => {
  test('exec function is provided and works', async () => {
    let execResult: { exitCode: number; stdout: string } | null = null;

    const plugin: WtPlugin = {
      name: 'exec-test',
      hooks: {
        afterCreate: async (ctx) => {
          execResult = await ctx.exec('echo hello');
        },
      },
    };

    const config = createTestConfig([plugin]);

    await runHooks({
      hookName: 'afterCreate',
      config,
      context: createTestContext(),
    });

    expect(execResult).not.toBeNull();
    expect(execResult!.exitCode).toBe(0);
    expect(execResult!.stdout).toBe('hello');
  });

  test('logger is provided', async () => {
    let hasLogger = false;

    const plugin: WtPlugin = {
      name: 'logger-test',
      hooks: {
        afterCreate: async (ctx) => {
          hasLogger =
            typeof ctx.logger.info === 'function' &&
            typeof ctx.logger.error === 'function' &&
            typeof ctx.logger.warn === 'function' &&
            typeof ctx.logger.success === 'function';
        },
      },
    };

    const config = createTestConfig([plugin]);

    await runHooks({
      hookName: 'afterCreate',
      config,
      context: createTestContext(),
    });

    expect(hasLogger).toBe(true);
  });
});
