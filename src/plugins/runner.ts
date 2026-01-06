import type { HookName, HookContext, HookValue, ResolvedConfig } from './types.js';
import { execAsync } from '../core/git.js';
import { createLogger } from '../utils/logger.js';

export interface RunHooksOptions {
  hookName: HookName;
  config: ResolvedConfig;
  context: Omit<HookContext, 'logger' | 'exec'>;
}

/**
 * Execute a single hook item (function or command string)
 */
async function executeHookItem(
  item: string | ((ctx: HookContext) => Promise<void> | void),
  ctx: HookContext
): Promise<void> {
  if (typeof item === 'string') {
    // It's a command string - execute it
    ctx.logger.info(`Running: ${item}`);
    const result = await ctx.exec(item, { cwd: ctx.worktreePath });

    // Always show output (stdout first, then stderr)
    if (result.stdout) {
      for (const line of result.stdout.split('\n')) {
        console.error(line);
      }
    }
    if (result.stderr) {
      for (const line of result.stderr.split('\n')) {
        console.error(line);
      }
    }

    if (result.exitCode !== 0) {
      throw new Error(`Command "${item}" failed with exit code ${result.exitCode}`);
    }
  } else {
    // It's a function - call it
    await item(ctx);
  }
}

/**
 * Execute a hook value (function, string, or array of both)
 */
async function executeHookValue(
  value: HookValue,
  ctx: HookContext,
  label: string
): Promise<void> {
  try {
    if (Array.isArray(value)) {
      // Run each item in sequence
      for (const item of value) {
        await executeHookItem(item, ctx);
      }
    } else {
      await executeHookItem(value, ctx);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.logger.warn(`${label} failed: ${message}`);
  }
}

export async function runHooks(options: RunHooksOptions): Promise<void> {
  const { hookName, config, context } = options;
  const logger = createLogger();

  const fullContext: HookContext = {
    ...context,
    logger,
    exec: execAsync,
  };

  // Run plugin hooks first (in order)
  for (const plugin of config.plugins) {
    const hook = plugin.hooks?.[hookName];
    if (hook) {
      await executeHookValue(hook, fullContext, `Plugin "${plugin.name}" ${hookName} hook`);
    }
  }

  // Run inline hooks last
  const inlineHook = config.hooks[hookName];
  if (inlineHook) {
    await executeHookValue(inlineHook, fullContext, `Inline ${hookName} hook`);
  }
}

export function createHookRunner(config: ResolvedConfig) {
  return async (
    hookName: HookName,
    context: Omit<HookContext, 'logger' | 'exec'>
  ): Promise<void> => {
    await runHooks({ hookName, config, context });
  };
}
