import {
  assertInsideGitRepo,
  getRepoRoot,
  getDefaultBranch,
  getCurrentBranch,
  getMainWorktree,
  mergeBranch,
  removeWorktree,
  deleteBranch,
} from '../core/git.js';
import { WtError, MergeConflictError } from '../core/errors.js';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../plugins/loader.js';
import { createHookRunner } from '../plugins/runner.js';

export interface MergeOptions {
  keep?: boolean;
}

export async function mergeCommand(options: MergeOptions): Promise<void> {
  const { keep = false } = options;

  assertInsideGitRepo();

  const originalCwd = process.cwd();
  const repoRoot = getRepoRoot();
  const currentBranch = getCurrentBranch();
  const defaultBranch = getDefaultBranch();

  // Can't merge if already on default branch
  if (currentBranch === defaultBranch) {
    throw new WtError(`Already on ${defaultBranch}, nothing to merge`);
  }

  // Find main worktree
  const mainWorktree = getMainWorktree();

  // Load config
  const config = await loadConfig(originalCwd);
  const runHook = createHookRunner(config);

  const hookContext = {
    repoRoot,
    defaultBranch,
    branchName: currentBranch,
    worktreePath: originalCwd,
    targetWorktree: mainWorktree.path,
  };

  // Run beforeMerge hooks
  await runHook('beforeMerge', hookContext);

  // Attempt merge
  logger.info(`Merging "${currentBranch}" into "${defaultBranch}"...`);

  const mergeResult = mergeBranch(currentBranch, mainWorktree.path);

  if (mergeResult.exitCode !== 0) {
    // Merge failed - output error and path to stay in current worktree
    logger.error(`Merge failed!`);
    if (mergeResult.stderr) {
      logger.error(mergeResult.stderr);
    }
    if (mergeResult.stdout) {
      console.error(mergeResult.stdout);
    }
    logger.error(`Resolve conflicts in ${mainWorktree.path} then commit manually.`);
    logger.info(`You are still in: ${originalCwd}`);

    // Output current directory to stay in place
    console.log(originalCwd);
    throw new MergeConflictError(defaultBranch, mainWorktree.path);
  }

  logger.success(`Merged "${currentBranch}" into "${defaultBranch}"`);

  // If keeping worktree, we're done
  if (keep) {
    logger.info(`Kept worktree and branch (--keep flag)`);
    await runHook('afterMerge', hookContext);
    console.log(mainWorktree.path);
    return;
  }

  // Run beforeRemove hooks
  await runHook('beforeRemove', hookContext);

  // Remove worktree
  logger.info(`Removing worktree at ${originalCwd}...`);
  const removeResult = removeWorktree(originalCwd);
  if (removeResult.exitCode !== 0) {
    logger.warn(`Failed to remove worktree: ${removeResult.stderr}`);
    // Continue anyway - worktree might have uncommitted changes
  }

  // Delete branch
  const deleteResult = deleteBranch(currentBranch);
  if (deleteResult.exitCode !== 0) {
    logger.warn(`Failed to delete branch "${currentBranch}": ${deleteResult.stderr}`);
  } else {
    logger.info(`Deleted branch "${currentBranch}"`);
  }

  // Run afterRemove hooks
  await runHook('afterRemove', hookContext);

  // Run afterMerge hooks
  await runHook('afterMerge', hookContext);

  logger.success(`Merged and cleaned up "${currentBranch}"`);

  // Output main worktree path for shell integration
  console.log(mainWorktree.path);
}
