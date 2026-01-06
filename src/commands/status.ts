import {
  assertInsideGitRepo,
  getRepoName,
  getDefaultBranch,
  listWorktrees,
  getAheadBehind,
  getUncommittedCount,
  getCurrentWorktreePath,
} from '../core/git.js';

interface WorktreeStatus {
  branch: string;
  path: string;
  status: string;
  isCurrent: boolean;
}

export function statusCommand(): void {
  assertInsideGitRepo();

  const repoName = getRepoName();
  const defaultBranch = getDefaultBranch();
  const worktrees = listWorktrees();
  const currentPath = getCurrentWorktreePath();

  console.log(`Repository: ${repoName}`);
  console.log(`Default branch: ${defaultBranch} (${worktrees.length} worktree${worktrees.length === 1 ? '' : 's'})`);
  console.log();

  if (worktrees.length === 0) {
    console.log('No worktrees found');
    return;
  }

  // Build status info for each worktree
  const statuses: WorktreeStatus[] = worktrees.map((wt) => {
    const branch = wt.branch ?? '(detached)';
    const isCurrent = wt.path === currentPath;
    const isDefault = wt.branch === defaultBranch;

    const statusParts: string[] = [];

    // Uncommitted changes
    const uncommitted = getUncommittedCount(wt.path);
    if (uncommitted > 0) {
      statusParts.push(`${uncommitted} modified`);
    }

    // Ahead/behind (only for non-default branches)
    if (wt.branch && !isDefault) {
      const { ahead, behind } = getAheadBehind(wt.branch, defaultBranch, wt.path);
      if (ahead > 0) statusParts.push(`${ahead} ahead`);
      if (behind > 0) statusParts.push(`${behind} behind`);
    }

    const status = statusParts.length > 0 ? statusParts.join(', ') : 'clean';

    return { branch, path: wt.path, status, isCurrent };
  });

  // Calculate column widths
  const branchCol = Math.max(6, ...statuses.map((s) => s.branch.length));
  const pathCol = Math.max(4, ...statuses.map((s) => s.path.length));
  const statusCol = Math.max(6, ...statuses.map((s) => s.status.length));

  // Table drawing
  const hr = (left: string, mid: string, right: string) =>
    `${left}${'─'.repeat(branchCol + 2)}${mid}${'─'.repeat(pathCol + 2)}${mid}${'─'.repeat(statusCol + 2)}${right}`;

  // Header
  console.log(hr('┌', '┬', '┐'));
  console.log(
    `│ ${'Branch'.padEnd(branchCol)} │ ${'Path'.padEnd(pathCol)} │ ${'Status'.padEnd(statusCol)} │`
  );
  console.log(hr('├', '┼', '┤'));

  // Rows
  for (const s of statuses) {
    const marker = s.isCurrent ? '*' : ' ';
    const branch = `${marker}${s.branch}`.padEnd(branchCol);
    const path = s.path.padEnd(pathCol);
    const status = s.status.padEnd(statusCol);
    console.log(`│ ${branch} │ ${path} │ ${status} │`);
  }

  // Footer
  console.log(hr('└', '┴', '┘'));
}
