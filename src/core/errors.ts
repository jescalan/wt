export class WtError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number = 1
  ) {
    super(message);
    this.name = 'WtError';
  }
}

export class NotInRepoError extends WtError {
  constructor() {
    super('Not inside a git repository', 1);
    this.name = 'NotInRepoError';
  }
}

export class DetachedHeadError extends WtError {
  constructor() {
    super('Detached HEAD; cannot determine current branch', 1);
    this.name = 'DetachedHeadError';
  }
}

export class WorktreeExistsError extends WtError {
  constructor(path: string) {
    super(`Worktree already exists at: ${path}`, 1);
    this.name = 'WorktreeExistsError';
  }
}

export class MergeConflictError extends WtError {
  constructor(
    public readonly targetBranch: string,
    public readonly targetWorktree: string
  ) {
    super(
      `Merge failed due to conflicts. Resolve conflicts in ${targetWorktree} and commit manually.`,
      1
    );
    this.name = 'MergeConflictError';
  }
}

export class WorktreeNotFoundError extends WtError {
  constructor(branch: string) {
    super(`Cannot find worktree for branch: ${branch}`, 1);
    this.name = 'WorktreeNotFoundError';
  }
}

export class OnDefaultBranchError extends WtError {
  constructor(operation: string) {
    super(`Cannot ${operation} the default branch worktree`, 1);
    this.name = 'OnDefaultBranchError';
  }
}

