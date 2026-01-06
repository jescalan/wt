import * as path from 'node:path';
import {
  assertInsideGitRepo,
  getRepoRoot,
  getRepoName,
  getDefaultBranch,
  branchExists,
  createWorktree,
} from '../core/git.js';
import { copyGitIgnoredFiles } from '../core/files.js';
import { WorktreeExistsError, WtError } from '../core/errors.js';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../plugins/loader.js';
import { createHookRunner } from '../plugins/runner.js';
import * as fs from 'node:fs';

export interface CreateOptions {
  name: string;
}

/**
 * Resolve worktree path from pattern
 * Supports variables: {repo}, {branch}, {parent}
 */
function resolveWorktreePath(
  pattern: string,
  vars: { repo: string; branch: string; parent: string }
): string {
  return pattern
    .replace(/{repo}/g, vars.repo)
    .replace(/{branch}/g, vars.branch)
    .replace(/{parent}/g, vars.parent);
}

export async function createCommand(options: CreateOptions): Promise<void> {
  const { name } = options;

  assertInsideGitRepo();

  const cwd = process.cwd();
  const repoRoot = getRepoRoot();
  const repoName = getRepoName();
  const defaultBranch = getDefaultBranch();
  const parentDir = path.dirname(repoRoot);

  // Load config first to get worktreePath pattern
  const config = await loadConfig(cwd);

  // Resolve worktree path from pattern
  const pathPattern = config.settings.worktreePath;
  const resolvedPath = resolveWorktreePath(pathPattern, {
    repo: repoName,
    branch: name,
    parent: parentDir,
  });
  const worktreePath = path.resolve(cwd, resolvedPath);

  // Check if path already exists
  if (fs.existsSync(worktreePath)) {
    throw new WorktreeExistsError(worktreePath);
  }

  const runHook = createHookRunner(config);

  const hookContext = {
    repoRoot,
    defaultBranch,
    branchName: name,
    worktreePath,
    sourceWorktree: cwd,
  };

  // Run beforeCreate hooks
  await runHook('beforeCreate', hookContext);

  // Create worktree
  const needsNewBranch = !branchExists(name);
  logger.info(`Creating worktree for branch "${name}"...`);

  const result = createWorktree(worktreePath, name, needsNewBranch);
  if (result.exitCode !== 0) {
    throw new WtError(`Failed to create worktree: ${result.stderr}`);
  }

  // Copy gitignored files if enabled (from worktree root, not cwd)
  if (config.settings.copyGitIgnoredFiles) {
    const copied = copyGitIgnoredFiles(repoRoot, worktreePath, {
      includeNodeModules: config.settings.copyNodeModules,
    });
    if (copied > 0) {
      logger.info(`Copied ${copied} gitignored file(s)`);
    }
  }

  // Run afterCreate hooks
  await runHook('afterCreate', hookContext);

  logger.success(`Created worktree at ${worktreePath}`);

  // Output path for shell integration (to stdout, not stderr)
  console.log(worktreePath);
}
