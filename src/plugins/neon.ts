import type { WtPlugin, HookContext } from './types.js';
import { commandExists } from '../core/git.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface NeonPluginOptions {
  /** Environment variable name for the Neon project ID (default: 'NEON_PROJECT_ID') */
  projectIdEnvVar?: string;
  /** Path to .env file relative to worktree (default: '.env') */
  envFile?: string;
  /**
   * Which branch to use as the parent when creating a new Neon branch.
   * - 'main': Branch from the primary/default Neon branch (default)
   * - 'current': Branch from the current worktree's Neon branch (inherits data/migrations)
   * - string: Branch from a specific named branch
   */
  parentBranch?: 'main' | 'current' | string;
}

export function neonPlugin(options: NeonPluginOptions = {}): WtPlugin {
  const { projectIdEnvVar = 'NEON_PROJECT_ID', envFile = '.env', parentBranch = 'main' } = options;

  function getProjectId(envPath: string): string | null {
    // Check environment variable first
    const fromEnv = process.env[projectIdEnvVar];
    if (fromEnv) {
      return fromEnv;
    }

    // Check .env file
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const match = content.match(new RegExp(`^${projectIdEnvVar}=["']?([^"'\\n]+)["']?`, 'm'));
      if (match?.[1]) {
        return match[1];
      }
    }

    return null;
  }

  return {
    name: 'neon',

    hooks: {
      async afterCreate(ctx: HookContext) {
        const sourceEnvPath = path.join(ctx.sourceWorktree ?? ctx.repoRoot, envFile);
        const targetEnvPath = path.join(ctx.worktreePath, envFile);

        const projectId = getProjectId(sourceEnvPath);
        if (!projectId) {
          ctx.logger.debug('Neon: No project ID found, skipping branch creation');
          return;
        }

        if (!commandExists('neon')) {
          ctx.logger.debug('Neon: CLI not installed, skipping branch creation');
          return;
        }

        // Determine parent branch
        let parentFlag = '';
        if (parentBranch === 'current') {
          // Get the current git branch from the source worktree
          const branchResult = await ctx.exec(
            'git symbolic-ref --quiet --short HEAD',
            { cwd: ctx.sourceWorktree ?? ctx.repoRoot }
          );
          if (branchResult.exitCode === 0 && branchResult.stdout) {
            const currentBranch = branchResult.stdout.trim();
            // Only use parent flag if not on default branch
            if (currentBranch !== ctx.defaultBranch) {
              parentFlag = ` --parent "${currentBranch}"`;
              ctx.logger.info(`Neon: Creating branch "${ctx.branchName}" from "${currentBranch}"...`);
            } else {
              ctx.logger.info(`Neon: Creating branch "${ctx.branchName}"...`);
            }
          } else {
            ctx.logger.info(`Neon: Creating branch "${ctx.branchName}"...`);
          }
        } else if (parentBranch !== 'main') {
          // Specific branch name provided
          parentFlag = ` --parent "${parentBranch}"`;
          ctx.logger.info(`Neon: Creating branch "${ctx.branchName}" from "${parentBranch}"...`);
        } else {
          ctx.logger.info(`Neon: Creating branch "${ctx.branchName}"...`);
        }

        const createResult = await ctx.exec(
          `neon branches create --name "${ctx.branchName}" --project-id "${projectId}"${parentFlag}`
        );

        if (createResult.exitCode !== 0) {
          ctx.logger.warn(`Neon: Failed to create branch: ${createResult.stderr}`);
          return;
        }

        // Get connection string for new branch
        const connResult = await ctx.exec(
          `neon connection-string --branch "${ctx.branchName}" --project-id "${projectId}"`
        );

        if (connResult.exitCode !== 0 || !connResult.stdout) {
          ctx.logger.warn('Neon: Failed to get connection string');
          return;
        }

        // Patch .env file with new DATABASE_URL
        if (fs.existsSync(targetEnvPath)) {
          let content = fs.readFileSync(targetEnvPath, 'utf-8');
          const newUrl = connResult.stdout.trim();

          if (content.includes('DATABASE_URL=')) {
            content = content.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL="${newUrl}"`);
          } else {
            content += `\nDATABASE_URL="${newUrl}"\n`;
          }

          fs.writeFileSync(targetEnvPath, content);
          ctx.logger.success(`Neon: Patched DATABASE_URL for branch "${ctx.branchName}"`);
        } else {
          ctx.logger.warn(`Neon: ${envFile} not found at ${targetEnvPath}, skipping DATABASE_URL patch`);
        }
      },

      async beforeRemove(ctx: HookContext) {
        const envPath = path.join(ctx.targetWorktree ?? ctx.repoRoot, envFile);

        const projectId = getProjectId(envPath);
        if (!projectId) {
          return;
        }

        if (!commandExists('neon')) {
          return;
        }

        ctx.logger.info(`Neon: Deleting branch "${ctx.branchName}"...`);

        const result = await ctx.exec(
          `neon branches delete "${ctx.branchName}" --project-id "${projectId}" --force`
        );

        if (result.exitCode !== 0) {
          ctx.logger.warn(`Neon: Failed to delete branch: ${result.stderr}`);
        } else {
          ctx.logger.success(`Neon: Deleted branch "${ctx.branchName}"`);
        }
      },
    },
  };
}
