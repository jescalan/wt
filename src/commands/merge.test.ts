import { describe, expect, test, beforeEach, afterEach, spyOn } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { exec } from '../core/git.js';

describe('merge operation integration', () => {
  let testDir: string;
  let featureWorktree: string;
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    // Create a fresh test repo
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-merge-test-'));

    // Initialize git repo
    exec('git init', { cwd: testDir });
    exec('git config user.email "test@test.com"', { cwd: testDir });
    exec('git config user.name "Test User"', { cwd: testDir });
    fs.writeFileSync(path.join(testDir, 'README.md'), '# Test');
    exec('git add .', { cwd: testDir });
    exec('git commit -m "Initial commit"', { cwd: testDir });

    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();

    // Clean up
    const parentDir = path.dirname(testDir);
    const baseName = path.basename(testDir);
    try {
      const entries = fs.readdirSync(parentDir);
      for (const entry of entries) {
        if (entry.startsWith(baseName)) {
          fs.rmSync(path.join(parentDir, entry), { recursive: true, force: true });
        }
      }
    } catch {
      // Ignore
    }
  });

  test('merge succeeds with no conflicts', () => {
    const featureBranch = 'feature-clean';
    featureWorktree = path.join(testDir, '..', `${path.basename(testDir)}-${featureBranch}`);

    // Create feature worktree
    exec(`git worktree add -b "${featureBranch}" "${featureWorktree}"`, { cwd: testDir });

    // Add a new file in feature branch
    fs.writeFileSync(path.join(featureWorktree, 'feature.txt'), 'new feature');
    exec('git add .', { cwd: featureWorktree });
    exec('git commit -m "Add feature"', { cwd: featureWorktree });

    // Merge feature into main
    const mergeResult = exec(`git merge "${featureBranch}"`, { cwd: testDir });
    expect(mergeResult.exitCode).toBe(0);

    // feature.txt should now be in main
    expect(fs.existsSync(path.join(testDir, 'feature.txt'))).toBe(true);
  });

  test('merge fails with conflicts', () => {
    const conflictBranch = 'feature-conflict';
    featureWorktree = path.join(testDir, '..', `${path.basename(testDir)}-${conflictBranch}`);

    // Create a file in main
    fs.writeFileSync(path.join(testDir, 'conflict.txt'), 'main content');
    exec('git add .', { cwd: testDir });
    exec('git commit -m "Add conflict file in main"', { cwd: testDir });

    // Create feature worktree from before that commit
    exec('git reset --hard HEAD~1', { cwd: testDir });
    exec(`git worktree add -b "${conflictBranch}" "${featureWorktree}"`, { cwd: testDir });

    // Restore main
    fs.writeFileSync(path.join(testDir, 'conflict.txt'), 'main content');
    exec('git add .', { cwd: testDir });
    exec('git commit -m "Add conflict in main"', { cwd: testDir });

    // Add conflicting content in feature
    fs.writeFileSync(path.join(featureWorktree, 'conflict.txt'), 'feature content');
    exec('git add .', { cwd: featureWorktree });
    exec('git commit -m "Add conflict in feature"', { cwd: featureWorktree });

    // Try to merge - should fail
    const mergeResult = exec(`git merge "${conflictBranch}"`, { cwd: testDir });
    expect(mergeResult.exitCode).not.toBe(0);

    // Abort the merge
    exec('git merge --abort', { cwd: testDir });
  });

  test('merge fails when main has uncommitted changes to a file being merged', () => {
    const featureBranch = 'feature-dirty';
    featureWorktree = path.join(testDir, '..', `${path.basename(testDir)}-${featureBranch}`);

    // Create a shared file in main and commit
    fs.writeFileSync(path.join(testDir, 'shared.txt'), 'original content');
    exec('git add .', { cwd: testDir });
    exec('git commit -m "Add shared file"', { cwd: testDir });

    // Create feature worktree and modify the shared file
    exec(`git worktree add -b "${featureBranch}" "${featureWorktree}"`, { cwd: testDir });
    fs.writeFileSync(path.join(featureWorktree, 'shared.txt'), 'feature changes to shared');
    exec('git add .', { cwd: featureWorktree });
    exec('git commit -m "Modify shared file"', { cwd: featureWorktree });

    // Create uncommitted changes to the same file in main (dirty working tree)
    fs.writeFileSync(path.join(testDir, 'shared.txt'), 'uncommitted main changes');

    // Try to merge - should fail due to uncommitted changes to file being merged
    const mergeResult = exec(`git merge "${featureBranch}"`, { cwd: testDir });
    expect(mergeResult.exitCode).not.toBe(0);
    // Git will complain about local changes being overwritten
    expect(
      mergeResult.stderr.includes('uncommitted') ||
      mergeResult.stderr.includes('overwritten') ||
      mergeResult.stderr.includes('local changes')
    ).toBe(true);
  });

  test('merge fails when main has staged changes to a file being merged', () => {
    const featureBranch = 'feature-staged';
    featureWorktree = path.join(testDir, '..', `${path.basename(testDir)}-${featureBranch}`);

    // Create a shared file in main and commit
    fs.writeFileSync(path.join(testDir, 'shared.txt'), 'original content');
    exec('git add .', { cwd: testDir });
    exec('git commit -m "Add shared file"', { cwd: testDir });

    // Create feature worktree and modify the shared file
    exec(`git worktree add -b "${featureBranch}" "${featureWorktree}"`, { cwd: testDir });
    fs.writeFileSync(path.join(featureWorktree, 'shared.txt'), 'feature changes');
    exec('git add .', { cwd: featureWorktree });
    exec('git commit -m "Modify shared file"', { cwd: featureWorktree });

    // Create staged changes to the same file in main
    fs.writeFileSync(path.join(testDir, 'shared.txt'), 'staged main changes');
    exec('git add .', { cwd: testDir });

    // Try to merge - should fail due to staged changes
    const mergeResult = exec(`git merge "${featureBranch}"`, { cwd: testDir });
    expect(mergeResult.exitCode).not.toBe(0);
  });

  test('merge succeeds when uncommitted changes are to unrelated files', () => {
    const featureBranch = 'feature-unrelated';
    featureWorktree = path.join(testDir, '..', `${path.basename(testDir)}-${featureBranch}`);

    // Create feature worktree with a new file
    exec(`git worktree add -b "${featureBranch}" "${featureWorktree}"`, { cwd: testDir });
    fs.writeFileSync(path.join(featureWorktree, 'feature-only.txt'), 'feature content');
    exec('git add .', { cwd: featureWorktree });
    exec('git commit -m "Add feature file"', { cwd: featureWorktree });

    // Create uncommitted changes to a different file in main
    fs.writeFileSync(path.join(testDir, 'main-only.txt'), 'uncommitted but unrelated');

    // Merge should succeed because the uncommitted file isn't affected
    const mergeResult = exec(`git merge "${featureBranch}"`, { cwd: testDir });
    expect(mergeResult.exitCode).toBe(0);

    // Both files should exist
    expect(fs.existsSync(path.join(testDir, 'feature-only.txt'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'main-only.txt'))).toBe(true);
  });

  test('worktree can be removed after merge', () => {
    const featureBranch = 'feature-remove';
    featureWorktree = path.join(testDir, '..', `${path.basename(testDir)}-${featureBranch}`);

    // Create and commit in feature worktree
    exec(`git worktree add -b "${featureBranch}" "${featureWorktree}"`, { cwd: testDir });
    fs.writeFileSync(path.join(featureWorktree, 'feature.txt'), 'content');
    exec('git add .', { cwd: featureWorktree });
    exec('git commit -m "Feature commit"', { cwd: featureWorktree });

    // Merge
    exec(`git merge "${featureBranch}"`, { cwd: testDir });

    // Remove worktree
    const removeResult = exec(`git worktree remove "${featureWorktree}"`, { cwd: testDir });
    expect(removeResult.exitCode).toBe(0);
    expect(fs.existsSync(featureWorktree)).toBe(false);

    // Delete branch
    const deleteBranchResult = exec(`git branch -d "${featureBranch}"`, { cwd: testDir });
    expect(deleteBranchResult.exitCode).toBe(0);
  });

  test('branch can be kept with worktree after merge', () => {
    const featureBranch = 'feature-keep';
    featureWorktree = path.join(testDir, '..', `${path.basename(testDir)}-${featureBranch}`);

    // Create feature
    exec(`git worktree add -b "${featureBranch}" "${featureWorktree}"`, { cwd: testDir });
    fs.writeFileSync(path.join(featureWorktree, 'feature.txt'), 'content');
    exec('git add .', { cwd: featureWorktree });
    exec('git commit -m "Feature"', { cwd: featureWorktree });

    // Merge
    exec(`git merge "${featureBranch}"`, { cwd: testDir });

    // Both worktree and branch should still exist
    expect(fs.existsSync(featureWorktree)).toBe(true);

    const branchCheck = exec(`git show-ref --verify --quiet refs/heads/${featureBranch}`, { cwd: testDir });
    expect(branchCheck.exitCode).toBe(0);
  });
});

describe('finding default branch', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-default-branch-'));
    exec('git init', { cwd: testDir });
    exec('git config user.email "test@test.com"', { cwd: testDir });
    exec('git config user.name "Test User"', { cwd: testDir });
    fs.writeFileSync(path.join(testDir, 'README.md'), '# Test');
    exec('git add .', { cwd: testDir });
    exec('git commit -m "Initial"', { cwd: testDir });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('identifies current branch', () => {
    const result = exec('git symbolic-ref --quiet --short HEAD', { cwd: testDir });
    expect(result.exitCode).toBe(0);
    expect(['main', 'master']).toContain(result.stdout);
  });

  test('show-ref verifies main or master exists', () => {
    const mainResult = exec('git show-ref --verify --quiet refs/heads/main', { cwd: testDir });
    const masterResult = exec('git show-ref --verify --quiet refs/heads/master', { cwd: testDir });

    // One of them should exist
    expect(mainResult.exitCode === 0 || masterResult.exitCode === 0).toBe(true);
  });
});
