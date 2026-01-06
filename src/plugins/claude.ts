import type { WtPlugin, HookContext } from './types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface ClaudePluginOptions {
  /** Path to Claude home directory (default: ~/.claude) */
  claudeHome?: string;
}

export function claudePlugin(options: ClaudePluginOptions = {}): WtPlugin {
  const claudeHome = options.claudeHome ?? path.join(os.homedir(), '.claude');

  function getProjectsDir(): string {
    return path.join(claudeHome, 'projects');
  }

  function pathToProjectDir(worktreePath: string): string {
    // Claude Code encodes paths by replacing / with -
    // e.g., /Users/jeff/Sites/wt -> -Users-jeff-Sites-wt
    return worktreePath.replace(/\//g, '-');
  }

  function getProjectPath(worktreePath: string): string {
    return path.join(getProjectsDir(), pathToProjectDir(worktreePath));
  }

  return {
    name: 'claude',

    hooks: {
      async beforeRemove(ctx: HookContext) {
        const projectsDir = getProjectsDir();
        if (!fs.existsSync(projectsDir)) {
          ctx.logger.debug('Claude: No projects directory found');
          return;
        }

        const targetWorktree = ctx.targetWorktree;
        if (!targetWorktree) {
          ctx.logger.debug('Claude: No target worktree, skipping session migration');
          return;
        }

        const oldProjectDir = getProjectPath(ctx.worktreePath);
        const newProjectDir = getProjectPath(targetWorktree);

        if (!fs.existsSync(oldProjectDir)) {
          ctx.logger.debug(`Claude: No sessions found for ${ctx.worktreePath}`);
          return;
        }

        // Ensure target project directory exists
        if (!fs.existsSync(newProjectDir)) {
          fs.mkdirSync(newProjectDir, { recursive: true });
        }

        // Move all session files from old to new project directory
        const files = fs.readdirSync(oldProjectDir);
        let movedCount = 0;

        for (const file of files) {
          const oldPath = path.join(oldProjectDir, file);
          const newPath = path.join(newProjectDir, file);

          try {
            // If file already exists in target, append worktree suffix to avoid collision
            let finalNewPath = newPath;
            if (fs.existsSync(newPath)) {
              const ext = path.extname(file);
              const base = path.basename(file, ext);
              const branchSuffix = `-${ctx.branchName}`;
              finalNewPath = path.join(newProjectDir, `${base}${branchSuffix}${ext}`);
            }

            fs.renameSync(oldPath, finalNewPath);
            movedCount++;
          } catch (error) {
            ctx.logger.debug(`Claude: Failed to move ${file}`);
          }
        }

        // Remove the now-empty old project directory
        try {
          fs.rmdirSync(oldProjectDir);
        } catch {
          // Directory might not be empty if some files failed to move
        }

        if (movedCount > 0) {
          ctx.logger.success(`Claude: Migrated ${movedCount} session(s) to ${targetWorktree}`);
        }
      },
    },
  };
}
