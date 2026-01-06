import * as readline from 'node:readline';
import {
  assertInsideGitRepo,
  listWorktrees,
  getDefaultBranch,
  removeWorktree,
  deleteBranch,
  getRepoRoot,
  findWorktreeByBranch,
  Worktree,
} from '../core/git.js';
import { OnDefaultBranchError, WtError, WorktreeNotFoundError } from '../core/errors.js';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../plugins/loader.js';
import { createHookRunner } from '../plugins/runner.js';

export interface RemoveOptions {
  name?: string;
  force?: boolean;
}

export async function removeCommand(options: RemoveOptions): Promise<void> {
  assertInsideGitRepo();

  const cwd = process.cwd();
  const repoRoot = getRepoRoot();
  const defaultBranch = getDefaultBranch();

  // Resolve which worktree to remove
  let worktree: Worktree;

  if (options.name) {
    // Find by branch name
    const found = findWorktreeByBranch(options.name);
    if (!found) {
      throw new WorktreeNotFoundError(options.name);
    }
    worktree = found;
  } else {
    // Interactive selection
    const worktrees = listWorktrees();
    const nonDefaultWorktrees = worktrees.filter((wt) => wt.branch !== defaultBranch);

    if (nonDefaultWorktrees.length === 0) {
      logger.warn('No worktrees available to remove (only default branch exists)');
      return;
    }

    const selected = await interactiveSelect(nonDefaultWorktrees);
    if (!selected) {
      return; // User cancelled
    }
    worktree = selected;
  }

  // Check if trying to remove default branch
  if (worktree.branch === defaultBranch) {
    throw new OnDefaultBranchError('remove');
  }

  // Confirm removal unless --force
  if (!options.force) {
    const confirmed = await confirmRemoval(worktree);
    if (!confirmed) {
      logger.info('Cancelled');
      return;
    }
  }

  // Load config and create hook runner
  const config = await loadConfig(cwd);
  const runHook = createHookRunner(config);

  const hookContext = {
    repoRoot,
    defaultBranch,
    branchName: worktree.branch ?? '',
    worktreePath: worktree.path,
  };

  // Run beforeRemove hooks
  await runHook('beforeRemove', hookContext);

  // Remove worktree
  logger.info(`Removing worktree at ${worktree.path}...`);
  const removeResult = removeWorktree(worktree.path);
  if (removeResult.exitCode !== 0) {
    throw new WtError(`Failed to remove worktree: ${removeResult.stderr}`);
  }

  // Delete branch if it exists
  if (worktree.branch) {
    logger.info(`Deleting branch ${worktree.branch}...`);
    const deleteResult = deleteBranch(worktree.branch);
    if (deleteResult.exitCode !== 0) {
      logger.warn(`Could not delete branch: ${deleteResult.stderr}`);
    }
  }

  // Run afterRemove hooks
  await runHook('afterRemove', hookContext);

  logger.success(`Removed worktree '${worktree.branch}' at ${worktree.path}`);
}

async function confirmRemoval(worktree: Worktree): Promise<boolean> {
  if (!process.stdin.isTTY) {
    logger.error('Cannot confirm in non-interactive mode. Use --force to skip confirmation.');
    return false;
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
    });

    const branch = worktree.branch ?? '(detached)';
    rl.question(`Remove worktree '${branch}' at ${worktree.path}? (y/N) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

async function interactiveSelect(worktrees: Worktree[]): Promise<Worktree | null> {
  if (!process.stdin.isTTY) {
    logger.error('No TTY available for interactive selection');
    return null;
  }

  const choices = worktrees.map((wt, index) => {
    const branch = wt.isDetached ? '(detached)' : wt.branch ?? '(unknown)';
    return {
      index,
      worktree: wt,
      branch,
      display: `${wt.path}  ${branch}`,
    };
  });

  if (choices.length === 1) {
    return choices[0]!.worktree;
  }

  return new Promise((resolve) => {
    let selectedIndex = 0;

    const render = () => {
      console.error('\x1b[2J\x1b[H');
      console.error('Select a worktree to remove (↑/↓ to move, Enter to select, q to quit):\n');

      for (let i = 0; i < choices.length; i++) {
        const choice = choices[i]!;
        const prefix = i === selectedIndex ? '\x1b[31m❯\x1b[0m ' : '  ';
        const highlight = i === selectedIndex ? '\x1b[31m' : '\x1b[90m';
        console.error(`${prefix}${highlight}${choice.display}\x1b[0m`);
      }
    };

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }

    const cleanup = () => {
      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(false);
      }
      process.stdin.removeListener('keypress', onKeypress);
      console.error('\x1b[2J\x1b[H');
    };

    const onKeypress = (_str: string | undefined, key: readline.Key) => {
      if (!key) return;

      if (key.name === 'up' || (key.ctrl && key.name === 'p')) {
        selectedIndex = (selectedIndex - 1 + choices.length) % choices.length;
        render();
      } else if (key.name === 'down' || (key.ctrl && key.name === 'n')) {
        selectedIndex = (selectedIndex + 1) % choices.length;
        render();
      } else if (key.name === 'return') {
        cleanup();
        resolve(choices[selectedIndex]!.worktree);
      } else if (key.name === 'q' || key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        cleanup();
        resolve(null);
      }
    };

    process.stdin.on('keypress', onKeypress);
    render();
  });
}
