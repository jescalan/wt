import { exec } from './git.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface CopyGitIgnoredOptions {
  /** Include node_modules directory (default: false) */
  includeNodeModules?: boolean;
}

export function copyGitIgnoredFiles(
  srcDir: string,
  dstDir: string,
  options: CopyGitIgnoredOptions = {}
): number {
  const { includeNodeModules = false } = options;

  const result = exec('git ls-files --others --ignored --exclude-standard', { cwd: srcDir });
  if (result.exitCode !== 0) {
    return 0;
  }

  let files = result.stdout.split('\n').filter(Boolean);

  // Filter out node_modules unless explicitly included
  if (!includeNodeModules) {
    files = files.filter((file) => !file.startsWith('node_modules/') && !file.includes('/node_modules/'));
  }

  if (files.length === 0) {
    return 0;
  }

  let copied = 0;

  for (const file of files) {
    const srcPath = path.join(srcDir, file);
    const dstPath = path.join(dstDir, file);

    if (!fs.existsSync(srcPath)) {
      continue;
    }

    if (!fs.statSync(srcPath).isFile()) {
      continue;
    }

    const dstDirPath = path.dirname(dstPath);
    if (!fs.existsSync(dstDirPath)) {
      fs.mkdirSync(dstDirPath, { recursive: true });
    }

    fs.copyFileSync(srcPath, dstPath);
    copied++;
  }

  return copied;
}

export function findConfigFile(startDir: string, filename: string): string | null {
  let currentDir = startDir;

  while (true) {
    const configPath = path.join(currentDir, filename);
    if (fs.existsSync(configPath)) {
      return configPath;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return null;
}
