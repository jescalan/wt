# wt

A CLI tool for managing git worktrees with a plugin system for extensibility.

## Installation

```bash
# Install globally
npm install -g wt

# Or run directly with npx
npx wt <command>
```

## Commands

All commands have short aliases for faster typing:

| Command | Alias | Description |
|---------|-------|-------------|
| `create` | `c` | Create a new worktree |
| `merge` | `m` | Merge and clean up |
| `search` | `s` | Interactive worktree selector |
| `list` | `l` | List all worktrees |
| `remove` | `rm` | Remove a worktree |
| `status` | `st` | Show worktree overview |

### `wt create <name>` (alias: `c`)

Create a new worktree with a branch.

```bash
wt create feature-auth
wt c feature-auth  # Short form
```

This will:
1. Create a new worktree at the configured path (default: `../{repo}-{branch}`)
2. Create a new branch (or use existing if it exists)
3. Copy gitignored files from the current worktree (configurable)
4. Run any configured `beforeCreate`/`afterCreate` hooks

### `wt merge` (alias: `m`)

Merge the current worktree's branch into the default branch and clean up.

```bash
wt merge        # Merge, remove worktree, delete branch
wt merge -k     # Merge but keep worktree and branch
wt m            # Short form
```

This will:
1. Switch to the main worktree
2. Merge the current branch
3. Remove the worktree and delete the branch (unless `--keep`)
4. Run any configured hooks

On merge failure (conflicts, uncommitted changes), you'll be returned to your original worktree with a clear error message.

### `wt search` (alias: `s`)

Interactively select and switch between worktrees.

```bash
wt search
wt s  # Short form
```

Use arrow keys to navigate, Enter to select, q/Escape to cancel.

### `wt list` (alias: `l`)

List all worktrees with status information.

```bash
wt list
wt l  # Short form
```

Output example:
```
* main          /path/to/repo          (default)
  feature-auth  /path/to/repo-feature  2 ahead, 1 behind
  bugfix-xyz    /path/to/repo-bugfix   3 uncommitted
```

Shows:
- Current worktree marked with `*`
- Default branch marked with `(default)`
- Ahead/behind count compared to default branch
- Count of uncommitted changes

### `wt remove [name]` (alias: `rm`)

Remove a worktree with confirmation.

```bash
wt remove feature-auth  # Remove specific worktree
wt remove               # Interactive selection
wt rm -f feature-auth   # Skip confirmation prompt
```

Options:
- `-f, --force`: Skip the confirmation prompt

The default branch worktree cannot be removed.

### `wt status` (alias: `st`)

Show a detailed overview of all worktrees.

```bash
wt status
wt st  # Short form
```

Output example:
```
Repository: my-project
Default branch: main (3 worktrees)

┌─────────────────┬──────────────────────────────┬─────────────┐
│ Branch          │ Path                         │ Status      │
├─────────────────┼──────────────────────────────┼─────────────┤
│ main            │ ~/code/my-project            │ clean       │
│ feature-auth    │ ~/code/my-project-feature    │ 2 modified  │
│ bugfix-xyz      │ ~/code/my-project-bugfix     │ 1 ahead     │
└─────────────────┴──────────────────────────────┴─────────────┘
```

## Shell Integration

Add one line to your shell config to enable automatic directory changing:

**Zsh** (`~/.zshrc`):
```bash
eval "$(wt init zsh)"
```

**Bash** (`~/.bashrc`):
```bash
eval "$(wt init bash)"
```

**Fish** (`~/.config/fish/config.fish`):
```fish
wt init fish | source
```

## Configuration

Create a `wt.config.ts` file in your project root (or any parent directory):

```typescript
import type { WtConfig } from 'wt-cli/types';

export default {
  // Copy gitignored files when creating worktrees (default: true)
  copyGitIgnoredFiles: true,

  // Worktree path pattern (default: "../{repo}-{branch}")
  // Variables: {repo}, {branch}, {parent}
  worktreePath: '../{repo}-{branch}',

  // Plugins to load
  plugins: [],

  // Hooks - can be commands, functions, or arrays of both
  hooks: {
    // Run npm install after creating a worktree
    afterCreate: 'npm install',

    // Run tests before merging
    beforeMerge: 'npm test',
  },
} satisfies WtConfig;
```

### Worktree Path Pattern

Customize where worktrees are created using these variables:

- `{repo}` - Repository name
- `{branch}` - Branch name
- `{parent}` - Parent directory of the repository root

Examples:
```typescript
// Default: ../my-project-feature-auth
worktreePath: '../{repo}-{branch}',

// All worktrees in a dedicated folder: ../worktrees/feature-auth
worktreePath: '../worktrees/{branch}',

// In parent's parent directory: ../../my-project-feature-auth
worktreePath: '../../{repo}-{branch}',
```

You can also use `wt.config.js` or `wt.config.mjs`.

### Hook Formats

Hooks support three formats:

```typescript
// 1. Shell command string
afterCreate: 'npm install',

// 2. Function
afterCreate: async (ctx) => {
  ctx.logger.info('Installing dependencies...');
  await ctx.exec('npm install');
},

// 3. Array of commands and/or functions (run in sequence)
afterCreate: [
  'npm install',
  'npm run db:migrate',
  async (ctx) => ctx.logger.success('Ready!'),
],
```

Commands run in the worktree directory and log their output. If a command fails, subsequent items in the array are skipped, but other hooks continue.

## Plugin System

Plugins can hook into the worktree lifecycle to perform custom actions.

### Available Hooks

| Hook | When it runs |
|------|--------------|
| `beforeCreate` | Before creating a new worktree |
| `afterCreate` | After worktree is created and files are copied |
| `beforeMerge` | Before merging into the default branch |
| `afterMerge` | After successful merge |
| `beforeRemove` | Before removing a worktree |
| `afterRemove` | After worktree and branch are removed |

### Hook Context

Every hook receives a context object:

```typescript
interface HookContext {
  repoRoot: string;        // Git repository root
  defaultBranch: string;   // e.g., 'main' or 'master'
  branchName: string;      // Branch being operated on
  worktreePath: string;    // Path to the worktree
  sourceWorktree?: string; // Source worktree (for create)
  targetWorktree?: string; // Target worktree (for merge)
  logger: Logger;          // Logging utilities
  exec: (cmd: string) => Promise<ExecResult>; // Run shell commands
}
```

### Writing a Plugin

```typescript
import type { WtPlugin } from 'wt-cli/types';

export function myPlugin(options = {}): WtPlugin {
  return {
    name: 'my-plugin',
    hooks: {
      afterCreate: async (ctx) => {
        ctx.logger.info('Worktree created!');

        // Run a command
        const result = await ctx.exec('npm install', { cwd: ctx.worktreePath });
        if (result.exitCode !== 0) {
          ctx.logger.warn('npm install failed');
        }
      },

      beforeRemove: async (ctx) => {
        ctx.logger.info(`Cleaning up ${ctx.branchName}`);
      },
    },
  };
}
```

### Using Plugins

```typescript
// wt.config.ts
import { myPlugin } from './plugins/my-plugin';

export default {
  plugins: [
    myPlugin({ /* options */ }),
  ],
};
```

## Example Plugins

### Neon Database Branching

Automatically create/delete Neon database branches with worktrees:

```typescript
// wt.config.ts
import { neonPlugin } from 'wt-cli/plugins/neon';

export default {
  plugins: [
    neonPlugin({
      projectIdEnvVar: 'NEON_PROJECT_ID', // env var or .env key
      envFile: '.env',                     // path to .env file
      parentBranch: 'current',             // 'main', 'current', or branch name
    }),
  ],
};
```

The plugin will:
- Create a Neon branch when you create a worktree
- Update `DATABASE_URL` in the new worktree's `.env`
- Delete the Neon branch when you merge/remove the worktree

**Parent branch options:**
- `'main'` (default): Branch from Neon's primary branch
- `'current'`: Branch from the current git branch's Neon branch (inherits migrations/data)
- `'branch-name'`: Branch from a specific named Neon branch

Requires the [Neon CLI](https://neon.tech/docs/reference/cli-install) to be installed.

### Codex Session Patching

Automatically update Codex session paths when worktrees are removed:

```typescript
// wt.config.ts
import { codexPlugin } from 'wt-cli/plugins/codex';

export default {
  plugins: [
    codexPlugin({
      codexHome: '~/.codex', // optional, defaults to $CODEX_HOME or ~/.codex
    }),
  ],
};
```

### Claude Code Session Migration

Automatically migrate Claude Code sessions when worktrees are removed:

```typescript
// wt.config.ts
import { claudePlugin } from 'wt-cli/plugins/claude';

export default {
  plugins: [
    claudePlugin({
      claudeHome: '~/.claude', // optional, defaults to ~/.claude
    }),
  ],
};
```

Claude Code stores conversation history in `~/.claude/projects/` using encoded paths as directory names (e.g., `/Users/jeff/Sites/wt` becomes `-Users-jeff-Sites-wt`). When you remove a worktree, those sessions would become orphaned.

This plugin moves session files from the worktree's project directory to the target worktree's directory, preserving your conversation history. If there are filename collisions, the migrated files are renamed with a branch suffix.

## Requirements

- Git 2.5+ (for worktree support)
- Node.js 18+

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Run tests
bun test

# Type check
bun run typecheck
```

## License

MIT
