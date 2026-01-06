import { Command } from 'commander';
import { createCommand } from './commands/create.js';
import { mergeCommand } from './commands/merge.js';
import { searchCommand } from './commands/search.js';
import { initCommand } from './commands/init.js';
import { listCommand } from './commands/list.js';
import { removeCommand } from './commands/remove.js';
import { statusCommand } from './commands/status.js';
import { WtError } from './core/errors.js';
import { logger } from './utils/logger.js';

const program = new Command();

program
  .name('wt')
  .description('A CLI tool for managing git worktrees')
  .version('0.1.0');

program
  .command('create')
  .alias('c')
  .description('Create a new worktree with a branch')
  .argument('<name>', 'Branch name for the worktree')
  .action(async (name: string) => {
    try {
      await createCommand({ name });
    } catch (error) {
      handleError(error);
    }
  });

program
  .command('merge')
  .alias('m')
  .description('Merge current worktree branch into default branch')
  .option('-k, --keep', 'Keep the worktree and branch after merging')
  .action(async (options: { keep?: boolean }) => {
    try {
      await mergeCommand(options);
    } catch (error) {
      handleError(error);
    }
  });

program
  .command('search')
  .alias('s')
  .description('Interactively select and switch between worktrees')
  .action(async () => {
    try {
      await searchCommand();
    } catch (error) {
      handleError(error);
    }
  });

program
  .command('list')
  .alias('l')
  .description('List all worktrees with status')
  .action(() => {
    try {
      listCommand();
    } catch (error) {
      handleError(error);
    }
  });

program
  .command('remove')
  .alias('rm')
  .description('Remove a worktree')
  .argument('[name]', 'Branch name of the worktree to remove')
  .option('-f, --force', 'Skip confirmation prompt')
  .action(async (name: string | undefined, options: { force?: boolean }) => {
    try {
      await removeCommand({ name, force: options.force });
    } catch (error) {
      handleError(error);
    }
  });

program
  .command('status')
  .alias('st')
  .description('Show status of all worktrees')
  .action(() => {
    try {
      statusCommand();
    } catch (error) {
      handleError(error);
    }
  });

program
  .command('init')
  .description('Output shell integration script')
  .argument('<shell>', 'Shell type (zsh, bash, fish)')
  .action((shell: string) => {
    try {
      initCommand({ shell });
    } catch (error) {
      handleError(error);
    }
  });

function handleError(error: unknown): never {
  if (error instanceof WtError) {
    logger.error(error.message);
    process.exit(error.exitCode);
  }

  if (error instanceof Error) {
    logger.error(error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }

  logger.error(String(error));
  process.exit(1);
}

program.parse();
