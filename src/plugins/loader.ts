import { pathToFileURL } from 'node:url';
import { findConfigFile } from '../core/files.js';
import type { WtConfig, ResolvedConfig } from './types.js';
import { defaultSettings } from './types.js';

const CONFIG_FILENAMES = ['wt.config.ts', 'wt.config.js', 'wt.config.mjs'];

export async function loadConfig(startDir: string): Promise<ResolvedConfig> {
  for (const filename of CONFIG_FILENAMES) {
    const configPath = findConfigFile(startDir, filename);
    if (configPath) {
      return loadConfigFromPath(configPath);
    }
  }

  // No config found, return defaults
  return {
    settings: { ...defaultSettings },
    plugins: [],
    hooks: {},
  };
}

async function loadConfigFromPath(configPath: string): Promise<ResolvedConfig> {
  try {
    // For TypeScript files, we need to use a loader
    // Bun handles .ts files natively, Node needs tsx or similar
    const fileUrl = pathToFileURL(configPath).href;
    const module = await import(fileUrl);
    const config: WtConfig = module.default ?? module;

    return resolveConfig(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load config from ${configPath}: ${message}`);
  }
}

function resolveConfig(config: WtConfig): ResolvedConfig {
  return {
    settings: {
      ...defaultSettings,
      copyGitIgnoredFiles: config.copyGitIgnoredFiles ?? defaultSettings.copyGitIgnoredFiles,
      copyNodeModules: config.copyNodeModules ?? defaultSettings.copyNodeModules,
      worktreePath: config.worktreePath ?? defaultSettings.worktreePath,
    },
    plugins: config.plugins ?? [],
    hooks: config.hooks ?? {},
  };
}
