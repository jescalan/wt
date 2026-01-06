import * as readline from 'node:readline';
import { assertInsideGitRepo, listWorktrees } from '../core/git.js';

export async function searchCommand(): Promise<void> {
  assertInsideGitRepo();

  const worktrees = listWorktrees();
  if (worktrees.length === 0) {
    console.error('No worktrees found');
    return;
  }

  // Format worktrees for display
  const choices = worktrees.map((wt, index) => {
    const branch = wt.isDetached ? '(detached)' : wt.branch ?? '(unknown)';
    return {
      index,
      path: wt.path,
      branch,
      display: `${wt.path}  ${branch}`,
    };
  });

  // If only one worktree, just return it
  if (choices.length === 1) {
    console.log(choices[0]!.path);
    return;
  }

  const selected = await interactiveSelect(choices);
  if (selected) {
    console.log(selected.path);
  }
}

interface Choice {
  index: number;
  path: string;
  branch: string;
  display: string;
}

async function interactiveSelect(choices: Choice[]): Promise<Choice | null> {
  // Check if we're in a TTY
  if (!process.stdin.isTTY) {
    // Non-interactive: just list and exit
    for (const choice of choices) {
      console.error(`${choice.index + 1}. ${choice.display}`);
    }
    console.error('\nNo TTY available for interactive selection');
    return null;
  }

  return new Promise((resolve) => {
    let selectedIndex = 0;

    const render = () => {
      // Move cursor to top and clear
      console.error('\x1b[2J\x1b[H');
      console.error('Select a worktree (↑/↓ to move, Enter to select, q to quit):\n');

      for (let i = 0; i < choices.length; i++) {
        const choice = choices[i]!;
        const prefix = i === selectedIndex ? '\x1b[36m❯\x1b[0m ' : '  ';
        const highlight = i === selectedIndex ? '\x1b[36m' : '\x1b[90m';
        console.error(`${prefix}${highlight}${choice.display}\x1b[0m`);
      }
    };

    // Enable raw mode for keypress detection
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }

    const cleanup = () => {
      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(false);
      }
      process.stdin.removeListener('keypress', onKeypress);
      // Clear the selection UI
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
        resolve(choices[selectedIndex]!);
      } else if (key.name === 'q' || key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        cleanup();
        resolve(null);
      }
    };

    process.stdin.on('keypress', onKeypress);
    render();
  });
}
