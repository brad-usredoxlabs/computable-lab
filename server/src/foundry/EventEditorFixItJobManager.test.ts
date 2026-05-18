import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { EventEditorFixItJobManager } from './EventEditorFixItJobManager.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd });
}

async function createGitRepo(): Promise<string> {
  const repoRoot = await mkdtemp(join(tmpdir(), 'fixit-job-repo-'));
  await git(repoRoot, ['init']);
  await git(repoRoot, ['config', 'user.email', 'fixit@example.test']);
  await git(repoRoot, ['config', 'user.name', 'Fix It Test']);
  await writeFile(join(repoRoot, 'README.md'), 'base\n', 'utf-8');
  await git(repoRoot, ['add', 'README.md']);
  await git(repoRoot, ['commit', '-m', 'initial']);
  return repoRoot;
}

describe('EventEditorFixItJobManager', () => {
  it('persists queued jobs, specs, fixtures, and event logs', async () => {
    const repoRoot = await createGitRepo();
    const artifactRoot = await mkdtemp(join(tmpdir(), 'fixit-job-artifacts-'));
    const manager = new EventEditorFixItJobManager({
      repoRoot,
      artifactRoot,
      idFactory: () => 'job-001',
    });

    const job = await manager.enqueue({
      specId: 'spec-fix-demo',
      title: 'Fix demo placement',
      prompt: 'Put a 96-well plate on B2',
      fixItSessionId: 'session-1',
      specYaml: 'id: spec-fix-demo\n',
      fixtureYaml: 'name: spec-fix-demo\n',
      sessionSnapshot: {
        seed: { prompt: 'Put a 96-well plate on B2', fixItSessionId: 'session-1' },
        chat: [{ role: 'assistant', content: 'diagnosis' }],
        stage: 'spec-ready',
      },
    });

    expect(job.id).toBe('job-001');
    expect(job.status).toBe('queued');
    expect(job.specPath).toBeDefined();
    expect(job.fixturePath).toBeDefined();
    await expect(readFile(job.specPath!, 'utf-8')).resolves.toContain('spec-fix-demo');
    await expect(readFile(job.fixturePath!, 'utf-8')).resolves.toContain('spec-fix-demo');
    await expect(readFile(job.eventsPath, 'utf-8')).resolves.toContain('"phase":"queued"');

    const listed = await manager.listJobs();
    expect(listed.map((item) => item.id)).toEqual(['job-001']);
    expect((await manager.getJob('job-001'))?.prompt).toBe('Put a 96-well plate on B2');
    await expect(manager.readSessionSnapshot('job-001')).resolves.toMatchObject({
      seed: { fixItSessionId: 'session-1' },
      chat: [{ content: 'diagnosis' }],
    });
  });

  it('claims queued jobs into isolated git worktrees up to the concurrency limit', async () => {
    const repoRoot = await createGitRepo();
    const artifactRoot = await mkdtemp(join(tmpdir(), 'fixit-job-artifacts-'));
    let nextId = 0;
    const manager = new EventEditorFixItJobManager({
      repoRoot,
      artifactRoot,
      worktreeRoot: join(artifactRoot, 'worktrees'),
      maxConcurrentJobs: 1,
      idFactory: () => `job-${++nextId}`,
    });

    await manager.enqueue({ specId: 'spec-a', prompt: 'first' });
    await manager.enqueue({ specId: 'spec-b', prompt: 'second' });

    const first = await manager.claimNextQueuedJob();
    expect(first?.id).toBe('job-1');
    expect(first?.status).toBe('running');
    expect(first?.worktreePath).toBeDefined();
    expect(existsSync(join(first!.worktreePath!, 'README.md'))).toBe(true);

    await expect(manager.claimNextQueuedJob()).resolves.toBeUndefined();

    const completed = await manager.completeJob('job-1', {
      status: 'accepted',
      message: 'accepted',
      result: { commit: 'abc123' },
    });
    expect(completed.status).toBe('complete');
    expect(completed.worktreePath).toBeUndefined();
    expect(existsSync(first!.worktreePath!)).toBe(false);

    const second = await manager.claimNextQueuedJob();
    expect(second?.id).toBe('job-2');
    expect(second?.status).toBe('running');
  });

  it('records critic and needs-feedback states without releasing the worktree', async () => {
    const repoRoot = await createGitRepo();
    const artifactRoot = await mkdtemp(join(tmpdir(), 'fixit-job-artifacts-'));
    const manager = new EventEditorFixItJobManager({
      repoRoot,
      artifactRoot,
      worktreeRoot: join(artifactRoot, 'worktrees'),
      idFactory: () => 'job-review',
    });

    await manager.enqueue({ specId: 'spec-review' });
    const running = await manager.claimNextQueuedJob();
    const critic = await manager.markCriticRunning('job-review');
    expect(critic.status).toBe('critic');

    const needsFeedback = await manager.completeJob('job-review', {
      status: 'needs-feedback',
      message: 'critic requested revision',
      releaseWorktree: false,
    });
    expect(needsFeedback.status).toBe('needs-feedback');
    expect(needsFeedback.worktreePath).toBe(running?.worktreePath);
    expect(existsSync(needsFeedback.worktreePath!)).toBe(true);

    await manager.releaseWorktree('job-review', { status: 'complete' });
    expect(existsSync(needsFeedback.worktreePath!)).toBe(false);
  });

  it('sweepInterrupted transitions zombie running/critic jobs to interrupted', async () => {
    const repoRoot = await createGitRepo();
    const artifactRoot = await mkdtemp(join(tmpdir(), 'fixit-job-artifacts-'));
    let nextId = 0;
    const manager = new EventEditorFixItJobManager({
      repoRoot,
      artifactRoot,
      worktreeRoot: join(artifactRoot, 'worktrees'),
      idFactory: () => `job-zombie-${++nextId}`,
    });

    // Simulate two jobs in active states from a previous process: one
    // running, one in critic. Plus one non-active for control.
    await manager.enqueue({ specId: 'spec-a' });
    await manager.claimNextQueuedJob(); // job-zombie-1 → running
    await manager.enqueue({ specId: 'spec-b' });
    await manager.claimNextQueuedJob(); // job-zombie-2 → running
    await manager.markCriticRunning('job-zombie-2'); // → critic
    await manager.enqueue({ specId: 'spec-c' });     // job-zombie-3 → queued (NOT active)

    const interrupted = await manager.sweepInterrupted();
    expect(interrupted.map((job) => job.id).sort()).toEqual([
      'job-zombie-1',
      'job-zombie-2',
    ]);
    expect(interrupted.every((job) => job.status === 'interrupted')).toBe(true);

    // Worktrees are released so the next run starts clean.
    for (const job of interrupted) {
      expect(job.worktreePath).toBeUndefined();
    }

    // Queued job is untouched.
    const queued = await manager.getJob('job-zombie-3');
    expect(queued?.status).toBe('queued');

    // Events log records the interruption reason.
    const events = await manager.readEvents('job-zombie-1');
    const phases = events.map((event) => event.phase);
    expect(phases).toContain('interrupted');
  });

  it('reads events and lets completed jobs release retained worktrees', async () => {
    const repoRoot = await createGitRepo();
    const artifactRoot = await mkdtemp(join(tmpdir(), 'fixit-job-artifacts-'));
    const manager = new EventEditorFixItJobManager({
      repoRoot,
      artifactRoot,
      worktreeRoot: join(artifactRoot, 'worktrees'),
      idFactory: () => 'job-complete',
    });

    await manager.enqueue({ specId: 'spec-complete' });
    const running = await manager.claimNextQueuedJob();
    const retained = await manager.completeJob('job-complete', {
      status: 'needs-feedback',
      message: 'needs another pass',
      releaseWorktree: false,
    });
    expect(retained.status).toBe('needs-feedback');
    expect(existsSync(running!.worktreePath!)).toBe(true);

    const events = await manager.readEvents('job-complete');
    expect(events.map((event) => event.phase)).toContain('queued');
    expect(events.map((event) => event.phase)).toContain('completed');

    const complete = await manager.markComplete('job-complete');
    expect(complete.status).toBe('complete');
    expect(complete.worktreePath).toBeUndefined();
    expect(existsSync(running!.worktreePath!)).toBe(false);
    expect((await manager.readEvents('job-complete')).map((event) => event.phase)).toContain('marked_complete');
  });
});
