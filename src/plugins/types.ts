import type { Logger } from '../utils/logger.js';
import type { ExecResult } from '../core/git.js';

export type HookName =
  | 'beforeCreate'
  | 'afterCreate'
  | 'beforeMerge'
  | 'afterMerge'
  | 'beforeRemove'
  | 'afterRemove';

export interface HookContext {
  /** Root directory of the git repository */
  repoRoot: string;
  /** Default branch name (e.g., 'main' or 'master') */
  defaultBranch: string;
  /** Name of the branch being operated on */
  branchName: string;
  /** Path to the worktree being created/merged/removed */
  worktreePath: string;
  /** Path to the source worktree (for create operations) */
  sourceWorktree?: string;
  /** Path to the target worktree (for merge operations) */
  targetWorktree?: string;
  /** Logger instance for output */
  logger: Logger;
  /** Execute a shell command */
  exec: (cmd: string, options?: { cwd?: string }) => Promise<ExecResult>;
}

export type HookFunction = (ctx: HookContext) => Promise<void> | void;

/**
 * A hook value can be:
 * - A function that receives the hook context
 * - A shell command string to execute
 * - An array of commands and/or functions to run in sequence
 */
export type HookValue = HookFunction | string | (HookFunction | string)[];

export interface WtPlugin {
  /** Unique name for the plugin */
  name: string;
  /** Hook implementations */
  hooks?: Partial<Record<HookName, HookFunction>>;
}

export interface WtSettings {
  /** Copy gitignored files when creating a worktree (default: true) */
  copyGitIgnoredFiles?: boolean;
  /** Include node_modules when copying gitignored files (default: false) */
  copyNodeModules?: boolean;
  /**
   * Pattern for worktree path. Variables: {repo}, {branch}, {parent}
   * Default: "../{repo}-{branch}"
   */
  worktreePath?: string;
}

export interface WtConfig extends WtSettings {
  /** Plugins to load (executed in order) */
  plugins?: WtPlugin[];
  /** Inline hook definitions (can be functions, commands, or arrays of both) */
  hooks?: Partial<Record<HookName, HookValue>>;
}

export interface ResolvedConfig {
  settings: Required<WtSettings>;
  plugins: WtPlugin[];
  hooks: Partial<Record<HookName, HookValue>>;
}

export const defaultSettings: Required<WtSettings> = {
  copyGitIgnoredFiles: true,
  copyNodeModules: false,
  worktreePath: '../{repo}-{branch}',
};
