import { execSync } from 'node:child_process';
import { NotInRepoError, DetachedHeadError, WorktreeNotFoundError } from './errors.js';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function exec(command: string, options?: { cwd?: string }): ExecResult {
  try {
    const stdout = execSync(command, {
      cwd: options?.cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large outputs
    });
    return { stdout: stdout.trim(), stderr: '', exitCode: 0 };
  } catch (error) {
    const e = error as { stdout?: Buffer | string; stderr?: Buffer | string; status?: number };
    return {
      stdout: String(e.stdout ?? '').trim(),
      stderr: String(e.stderr ?? '').trim(),
      exitCode: e.status ?? 1,
    };
  }
}

export async function execAsync(command: string, options?: { cwd?: string }): Promise<ExecResult> {
  return exec(command, options);
}

export function isInsideGitRepo(): boolean {
  const result = exec('git rev-parse --is-inside-work-tree');
  return result.exitCode === 0 && result.stdout === 'true';
}

export function assertInsideGitRepo(): void {
  if (!isInsideGitRepo()) {
    throw new NotInRepoError();
  }
}

export function getRepoRoot(): string {
  const result = exec('git rev-parse --show-toplevel');
  if (result.exitCode !== 0) {
    throw new NotInRepoError();
  }
  return result.stdout;
}

export function getCurrentBranch(): string {
  const result = exec('git symbolic-ref --quiet --short HEAD');
  if (result.exitCode !== 0) {
    throw new DetachedHeadError();
  }
  return result.stdout;
}

export function getDefaultBranch(): string {
  // Try to get from remote HEAD
  const refResult = exec('git symbolic-ref --quiet refs/remotes/origin/HEAD');
  if (refResult.exitCode === 0 && refResult.stdout) {
    return refResult.stdout.replace('refs/remotes/origin/', '');
  }

  // Check for common default branches
  const mainResult = exec('git show-ref --verify --quiet refs/heads/main');
  if (mainResult.exitCode === 0) {
    return 'main';
  }

  const masterResult = exec('git show-ref --verify --quiet refs/heads/master');
  if (masterResult.exitCode === 0) {
    return 'master';
  }

  return 'main';
}

export function branchExists(branchName: string): boolean {
  const result = exec(`git show-ref --verify --quiet refs/heads/${branchName}`);
  return result.exitCode === 0;
}

export interface Worktree {
  path: string;
  branch: string | null;
  isDetached: boolean;
}

export function listWorktrees(): Worktree[] {
  const result = exec('git worktree list --porcelain');
  if (result.exitCode !== 0) {
    return [];
  }

  const worktrees: Worktree[] = [];
  let current: Partial<Worktree> = {};

  for (const line of result.stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      current.path = line.slice(9);
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice(7).replace('refs/heads/', '');
      current.isDetached = false;
    } else if (line === 'detached') {
      current.isDetached = true;
      current.branch = null;
    } else if (line === '') {
      if (current.path) {
        worktrees.push({
          path: current.path,
          branch: current.branch ?? null,
          isDetached: current.isDetached ?? false,
        });
      }
      current = {};
    }
  }

  // Handle last entry if no trailing newline
  if (current.path) {
    worktrees.push({
      path: current.path,
      branch: current.branch ?? null,
      isDetached: current.isDetached ?? false,
    });
  }

  return worktrees;
}

export function findWorktreeByBranch(branchName: string): Worktree | null {
  const worktrees = listWorktrees();
  return worktrees.find((wt) => wt.branch === branchName) ?? null;
}

export function getMainWorktree(): Worktree {
  const defaultBranch = getDefaultBranch();
  const worktree = findWorktreeByBranch(defaultBranch);
  if (!worktree) {
    throw new WorktreeNotFoundError(defaultBranch);
  }
  return worktree;
}

export function createWorktree(path: string, branchName: string, createBranch: boolean): ExecResult {
  if (createBranch) {
    return exec(`git worktree add -b "${branchName}" "${path}"`);
  }
  return exec(`git worktree add "${path}" "${branchName}"`);
}

export function removeWorktree(path: string): ExecResult {
  return exec(`git worktree remove "${path}"`);
}

export function deleteBranch(branchName: string): ExecResult {
  return exec(`git branch -d "${branchName}"`);
}

export function mergeBranch(branchName: string, cwd: string): ExecResult {
  return exec(`git merge "${branchName}"`, { cwd });
}

export function getRepoName(): string {
  const root = getRepoRoot();
  return root.split('/').pop() ?? 'repo';
}

/**
 * Check if a command exists in PATH (cross-platform)
 */
export function commandExists(command: string): boolean {
  const isWindows = process.platform === 'win32';
  const checkCmd = isWindows ? `where ${command}` : `command -v ${command}`;
  const result = exec(checkCmd);
  return result.exitCode === 0;
}

export interface AheadBehind {
  ahead: number;
  behind: number;
}

/**
 * Get ahead/behind count for a branch compared to the default branch
 */
export function getAheadBehind(branch: string, baseBranch: string, cwd?: string): AheadBehind {
  const result = exec(`git rev-list --left-right --count ${baseBranch}...${branch}`, { cwd });
  if (result.exitCode !== 0 || !result.stdout) {
    return { ahead: 0, behind: 0 };
  }
  const [behind, ahead] = result.stdout.split('\t').map(Number);
  return { ahead: ahead || 0, behind: behind || 0 };
}

/**
 * Get count of uncommitted changes in a worktree
 */
export function getUncommittedCount(cwd: string): number {
  const result = exec('git status --porcelain', { cwd });
  if (result.exitCode !== 0 || !result.stdout) {
    return 0;
  }
  return result.stdout.split('\n').filter((line) => line.trim()).length;
}

/**
 * Get current worktree path
 */
export function getCurrentWorktreePath(): string {
  const result = exec('git rev-parse --show-toplevel');
  if (result.exitCode !== 0) {
    throw new NotInRepoError();
  }
  return result.stdout;
}
