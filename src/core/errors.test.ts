import { describe, expect, test } from 'bun:test';
import {
  WtError,
  NotInRepoError,
  DetachedHeadError,
  WorktreeExistsError,
  MergeConflictError,
  WorktreeNotFoundError,
} from './errors.js';

describe('WtError', () => {
  test('creates error with message and default exit code', () => {
    const error = new WtError('test error');
    expect(error.message).toBe('test error');
    expect(error.exitCode).toBe(1);
    expect(error.name).toBe('WtError');
  });

  test('creates error with custom exit code', () => {
    const error = new WtError('test error', 2);
    expect(error.exitCode).toBe(2);
  });

  test('is instance of Error', () => {
    const error = new WtError('test');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('NotInRepoError', () => {
  test('has correct message', () => {
    const error = new NotInRepoError();
    expect(error.message).toBe('Not inside a git repository');
    expect(error.name).toBe('NotInRepoError');
  });
});

describe('DetachedHeadError', () => {
  test('has correct message', () => {
    const error = new DetachedHeadError();
    expect(error.message).toBe('Detached HEAD; cannot determine current branch');
    expect(error.name).toBe('DetachedHeadError');
  });
});

describe('WorktreeExistsError', () => {
  test('includes path in message', () => {
    const error = new WorktreeExistsError('/path/to/worktree');
    expect(error.message).toBe('Worktree already exists at: /path/to/worktree');
    expect(error.name).toBe('WorktreeExistsError');
  });
});

describe('MergeConflictError', () => {
  test('includes branch and worktree info', () => {
    const error = new MergeConflictError('main', '/path/to/main');
    expect(error.message).toContain('Merge failed');
    expect(error.message).toContain('/path/to/main');
    expect(error.targetBranch).toBe('main');
    expect(error.targetWorktree).toBe('/path/to/main');
    expect(error.name).toBe('MergeConflictError');
  });
});

describe('WorktreeNotFoundError', () => {
  test('includes branch name in message', () => {
    const error = new WorktreeNotFoundError('feature-x');
    expect(error.message).toBe('Cannot find worktree for branch: feature-x');
    expect(error.name).toBe('WorktreeNotFoundError');
  });
});
