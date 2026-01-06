import {
  assertInsideGitRepo,
  listWorktrees,
  getDefaultBranch,
  getAheadBehind,
  getUncommittedCount,
  getCurrentWorktreePath,
} from '../core/git.js';

export interface WorktreeInfo {
  branch: string | null;
  path: string;
  isCurrent: boolean;
  isDefault: boolean;
  ahead: number;
  behind: number;
  uncommitted: number;
}

export function getWorktreeList(): WorktreeInfo[] {
  assertInsideGitRepo();

  const worktrees = listWorktrees();
  const defaultBranch = getDefaultBranch();
  const currentPath = getCurrentWorktreePath();

  return worktrees.map((wt) => {
    const isCurrent = wt.path === currentPath;
    const isDefault = wt.branch === defaultBranch;

    let ahead = 0;
    let behind = 0;

    if (wt.branch && !isDefault) {
      const aheadBehind = getAheadBehind(wt.branch, defaultBranch, wt.path);
      ahead = aheadBehind.ahead;
      behind = aheadBehind.behind;
    }

    const uncommitted = getUncommittedCount(wt.path);

    return {
      branch: wt.branch,
      path: wt.path,
      isCurrent,
      isDefault,
      ahead,
      behind,
      uncommitted,
    };
  });
}

function formatStatus(info: WorktreeInfo): string {
  const parts: string[] = [];

  if (info.isDefault) {
    parts.push('(default)');
  }

  if (info.ahead > 0 || info.behind > 0) {
    const aheadBehind: string[] = [];
    if (info.ahead > 0) aheadBehind.push(`${info.ahead} ahead`);
    if (info.behind > 0) aheadBehind.push(`${info.behind} behind`);
    parts.push(aheadBehind.join(', '));
  }

  if (info.uncommitted > 0) {
    parts.push(`${info.uncommitted} uncommitted`);
  }

  return parts.join(' ');
}

export function listCommand(): void {
  const worktrees = getWorktreeList();

  if (worktrees.length === 0) {
    console.log('No worktrees found');
    return;
  }

  // Calculate column widths
  const branchWidth = Math.max(
    ...worktrees.map((wt) => (wt.branch ?? '(detached)').length)
  );
  const pathWidth = Math.max(...worktrees.map((wt) => wt.path.length));

  for (const wt of worktrees) {
    const marker = wt.isCurrent ? '*' : ' ';
    const branch = (wt.branch ?? '(detached)').padEnd(branchWidth);
    const path = wt.path.padEnd(pathWidth);
    const status = formatStatus(wt);

    console.log(`${marker} ${branch}  ${path}  ${status}`);
  }
}
