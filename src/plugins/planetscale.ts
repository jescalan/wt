import type { WtPlugin, HookContext } from './types.js';
import { commandExists } from '../core/git.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface PlanetScalePluginOptions {
  /** Environment variable name for the PlanetScale database name (default: 'PLANETSCALE_DATABASE') */
  databaseEnvVar?: string;
  /** Environment variable name for the PlanetScale org (default: 'PLANETSCALE_ORG') */
  orgEnvVar?: string;
  /** Path to .env file relative to worktree (default: '.env') */
  envFile?: string;
  /**
   * Which branch to use as the parent when creating a new PlanetScale branch.
   * - 'main': Branch from the primary/default branch (default)
   * - 'current': Branch from the current worktree's branch
   * - string: Branch from a specific named branch
   */
  parentBranch?: 'main' | 'current' | string;
}

interface PasswordCreateResponse {
  id: string;
  plain_text: string;
  connection_strings: {
    general: string;
  };
}

export function planetscalePlugin(options: PlanetScalePluginOptions = {}): WtPlugin {
  const {
    databaseEnvVar = 'PLANETSCALE_DATABASE',
    orgEnvVar = 'PLANETSCALE_ORG',
    envFile = '.env',
    parentBranch = 'main',
  } = options;

  function getEnvValue(envPath: string, varName: string): string | null {
    // Check environment variable first
    const fromEnv = process.env[varName];
    if (fromEnv) {
      return fromEnv;
    }

    // Check .env file
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const match = content.match(new RegExp(`^${varName}=["']?([^"'\\n]+)["']?`, 'm'));
      if (match?.[1]) {
        return match[1];
      }
    }

    return null;
  }

  return {
    name: 'planetscale',

    hooks: {
      async afterCreate(ctx: HookContext) {
        const sourceEnvPath = path.join(ctx.sourceWorktree ?? ctx.repoRoot, envFile);
        const targetEnvPath = path.join(ctx.worktreePath, envFile);

        const database = getEnvValue(sourceEnvPath, databaseEnvVar);
        if (!database) {
          ctx.logger.debug('PlanetScale: No database name found, skipping branch creation');
          return;
        }

        if (!commandExists('pscale')) {
          ctx.logger.debug('PlanetScale: CLI not installed, skipping branch creation');
          return;
        }

        const org = getEnvValue(sourceEnvPath, orgEnvVar);
        const orgFlag = org ? ` --org "${org}"` : '';

        // Determine parent branch
        let fromFlag = '';
        if (parentBranch === 'current') {
          const branchResult = await ctx.exec(
            'git symbolic-ref --quiet --short HEAD',
            { cwd: ctx.sourceWorktree ?? ctx.repoRoot }
          );
          if (branchResult.exitCode === 0 && branchResult.stdout) {
            const currentBranch = branchResult.stdout.trim();
            if (currentBranch !== ctx.defaultBranch) {
              fromFlag = ` --from "${currentBranch}"`;
              ctx.logger.info(`PlanetScale: Creating branch "${ctx.branchName}" from "${currentBranch}"...`);
            } else {
              ctx.logger.info(`PlanetScale: Creating branch "${ctx.branchName}"...`);
            }
          } else {
            ctx.logger.info(`PlanetScale: Creating branch "${ctx.branchName}"...`);
          }
        } else if (parentBranch !== 'main') {
          fromFlag = ` --from "${parentBranch}"`;
          ctx.logger.info(`PlanetScale: Creating branch "${ctx.branchName}" from "${parentBranch}"...`);
        } else {
          ctx.logger.info(`PlanetScale: Creating branch "${ctx.branchName}"...`);
        }

        // Create the branch and wait for it to be ready
        const createResult = await ctx.exec(
          `pscale branch create "${database}" "${ctx.branchName}"${fromFlag}${orgFlag} --wait`
        );

        if (createResult.exitCode !== 0) {
          ctx.logger.warn(`PlanetScale: Failed to create branch: ${createResult.stderr}`);
          return;
        }

        // Create a password to get connection string
        const passwordName = `wt-${ctx.branchName}-${Date.now()}`;
        const passwordResult = await ctx.exec(
          `pscale password create "${database}" "${ctx.branchName}" "${passwordName}"${orgFlag} --format json`
        );

        if (passwordResult.exitCode !== 0 || !passwordResult.stdout) {
          ctx.logger.warn('PlanetScale: Failed to create password for connection string');
          return;
        }

        let connectionString: string;
        try {
          const passwordData: PasswordCreateResponse = JSON.parse(passwordResult.stdout);
          connectionString = passwordData.connection_strings.general;
        } catch {
          ctx.logger.warn('PlanetScale: Failed to parse password response');
          return;
        }

        // Patch .env file with new DATABASE_URL
        if (fs.existsSync(targetEnvPath)) {
          let content = fs.readFileSync(targetEnvPath, 'utf-8');

          if (content.includes('DATABASE_URL=')) {
            content = content.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL="${connectionString}"`);
          } else {
            content += `\nDATABASE_URL="${connectionString}"\n`;
          }

          fs.writeFileSync(targetEnvPath, content);
          ctx.logger.success(`PlanetScale: Patched DATABASE_URL for branch "${ctx.branchName}"`);
        } else {
          ctx.logger.warn(`PlanetScale: ${envFile} not found at ${targetEnvPath}, skipping DATABASE_URL patch`);
        }
      },

      async beforeRemove(ctx: HookContext) {
        const envPath = path.join(ctx.targetWorktree ?? ctx.repoRoot, envFile);

        const database = getEnvValue(envPath, databaseEnvVar);
        if (!database) {
          return;
        }

        if (!commandExists('pscale')) {
          return;
        }

        const org = getEnvValue(envPath, orgEnvVar);
        const orgFlag = org ? ` --org "${org}"` : '';

        ctx.logger.info(`PlanetScale: Deleting branch "${ctx.branchName}"...`);

        const result = await ctx.exec(
          `pscale branch delete "${database}" "${ctx.branchName}"${orgFlag} --force`
        );

        if (result.exitCode !== 0) {
          ctx.logger.warn(`PlanetScale: Failed to delete branch: ${result.stderr}`);
        } else {
          ctx.logger.success(`PlanetScale: Deleted branch "${ctx.branchName}"`);
        }
      },
    },
  };
}
