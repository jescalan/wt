// When using the published package, use these imports:
// import type { WtConfig } from 'wt-cli/types';
// import { neonPlugin } from 'wt-cli/plugins/neon';
// import { codexPlugin } from 'wt-cli/plugins/codex';

// For local development, use relative imports:
import type { WtConfig } from "./src/plugins/types";
import { neonPlugin } from "./src/plugins/neon";
import { codexPlugin } from "./src/plugins/codex";

/**
 * wt configuration file
 *
 * This file configures the wt CLI tool. Place it in your project root
 * or any parent directory as `wt.config.ts`.
 *
 * You can also use `wt.config.js` or `wt.config.mjs` if you prefer JavaScript.
 */
export default {
  // Settings
  copyGitIgnoredFiles: true,

  // Plugins (executed in order)
  plugins: [
    // Neon database branching - creates/deletes database branches with worktrees
    neonPlugin({
      projectIdEnvVar: "NEON_PROJECT_ID",
      envFile: ".env",
    }),

    // Codex session patching - updates session paths when worktrees are removed
    codexPlugin(),
  ],

  // Hooks can be functions, shell commands, or arrays of both
  hooks: {
    // Run npm install after creating a worktree
    afterCreate: "npm install",

    // Or run multiple commands in sequence
    // afterCreate: ['npm install', 'npm run db:migrate'],

    // Or mix commands with functions
    // afterCreate: [
    //   'npm install',
    //   async (ctx) => {
    //     ctx.logger.info(`Worktree ready: ${ctx.worktreePath}`);
    //   },
    // ],

    // Run tests before merging
    // beforeMerge: 'npm test',

    // Use a function for more control
    afterMerge: async (ctx) => {
      ctx.logger.success(`Branch "${ctx.branchName}" merged successfully`);
    },
  },
} satisfies WtConfig;
