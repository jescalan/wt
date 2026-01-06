import type { WtPlugin, HookContext } from './types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface CodexPluginOptions {
  /** Path to Codex home directory (default: $CODEX_HOME or ~/.codex) */
  codexHome?: string;
}

export function codexPlugin(options: CodexPluginOptions = {}): WtPlugin {
  const codexHome = options.codexHome ?? process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex');

  function getSessionsDir(): string {
    return path.join(codexHome, 'sessions');
  }

  function findJsonlFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) {
      return [];
    }

    const files: string[] = [];

    function walk(currentDir: string) {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          files.push(fullPath);
        }
      }
    }

    walk(dir);
    return files;
  }

  return {
    name: 'codex',

    hooks: {
      async beforeRemove(ctx: HookContext) {
        const sessionsDir = getSessionsDir();
        if (!fs.existsSync(sessionsDir)) {
          ctx.logger.debug('Codex: No sessions directory found');
          return;
        }

        const oldCwd = ctx.worktreePath;
        const newCwd = ctx.targetWorktree;

        if (!newCwd) {
          ctx.logger.debug('Codex: No target worktree, skipping session patching');
          return;
        }

        const jsonlFiles = findJsonlFiles(sessionsDir);
        let patchedCount = 0;

        for (const file of jsonlFiles) {
          try {
            let content = fs.readFileSync(file, 'utf-8');
            const oldPattern = `"cwd":"${oldCwd}"`;

            if (content.includes(oldPattern)) {
              content = content.replaceAll(oldPattern, `"cwd":"${newCwd}"`);
              fs.writeFileSync(file, content);
              patchedCount++;
            }
          } catch (error) {
            // Ignore errors reading/writing individual files
            ctx.logger.debug(`Codex: Failed to patch ${file}`);
          }
        }

        if (patchedCount > 0) {
          ctx.logger.success(`Codex: Patched ${patchedCount} session(s) to ${newCwd}`);
        }
      },
    },
  };
}
