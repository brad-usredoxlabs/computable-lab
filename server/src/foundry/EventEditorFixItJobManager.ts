import { appendFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { nowIso, readYamlFile, writeYamlFile } from './FoundryArtifacts.js';

const execFileAsync = promisify(execFile);

export type EventEditorFixItJobStatus =
  | 'queued'
  | 'running'
  | 'critic'
  | 'needs-feedback'
  | 'accepted'
  | 'failed'
  | 'complete'
  | 'canceled'
  | 'interrupted';

export interface EventEditorFixItJobRecord {
  kind: 'event-editor-fixit-job';
  id: string;
  status: EventEditorFixItJobStatus;
  createdAt: string;
  updatedAt: string;
  repoRoot: string;
  artifactRoot: string;
  jobRoot: string;
  worktreeRoot: string;
  baseRef: string;
  worktreePath?: string;
  specId?: string;
  title?: string;
  prompt?: string;
  fixItSessionId?: string;
  specPath?: string;
  fixturePath?: string;
  eventsPath: string;
  result?: Record<string, unknown>;
  message?: string;
}

export interface EventEditorFixItJobEvent {
  ts?: string;
  source: 'server' | 'coder' | 'critic' | 'user';
  phase: string;
  message: string;
  details?: Record<string, unknown>;
}

export type EventEditorFixItSessionSnapshot = Record<string, unknown>;

export interface EnqueueEventEditorFixItJobInput {
  specId?: string;
  title?: string;
  prompt?: string;
  fixItSessionId?: string;
  specYaml?: string;
  fixtureYaml?: string;
  sessionSnapshot?: EventEditorFixItSessionSnapshot;
  baseRef?: string;
}

export interface CompleteEventEditorFixItJobInput {
  status: Extract<EventEditorFixItJobStatus, 'accepted' | 'failed' | 'needs-feedback' | 'canceled' | 'interrupted'>;
  message?: string;
  result?: Record<string, unknown>;
  releaseWorktree?: boolean;
}

export interface EventEditorFixItJobManagerOptions {
  repoRoot: string;
  artifactRoot: string;
  worktreeRoot?: string;
  maxConcurrentJobs?: number;
  idFactory?: () => string;
}

const ACTIVE_STATUSES = new Set<EventEditorFixItJobStatus>(['running', 'critic']);
type EventEditorFixItJobPatch = {
  [K in keyof Omit<EventEditorFixItJobRecord, 'kind' | 'id' | 'createdAt'>]?:
    Omit<EventEditorFixItJobRecord, 'kind' | 'id' | 'createdAt'>[K] | undefined;
};

function sanitizeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `fixit-${Date.now()}`;
}

function compactRecord<T extends Record<string, unknown>>(record: T): T {
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) delete record[key];
  }
  return record;
}

async function runGit(repoRoot: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync('git', args, { cwd: repoRoot, maxBuffer: 1024 * 1024 * 12 });
  return { stdout: result.stdout, stderr: result.stderr };
}

export class EventEditorFixItJobManager {
  readonly repoRoot: string;
  readonly artifactRoot: string;
  readonly jobsRoot: string;
  readonly worktreeRoot: string;
  readonly maxConcurrentJobs: number;
  private readonly idFactory: () => string;

  constructor(options: EventEditorFixItJobManagerOptions) {
    this.repoRoot = resolve(options.repoRoot);
    this.artifactRoot = resolve(options.artifactRoot);
    this.jobsRoot = join(this.artifactRoot, 'event-editor-fixit', 'jobs');
    this.worktreeRoot = resolve(options.worktreeRoot ?? join(this.repoRoot, '.fixit-worktrees'));
    this.maxConcurrentJobs = options.maxConcurrentJobs ?? 4;
    this.idFactory = options.idFactory ?? (() => `fixit-${randomUUID()}`);
  }

  async enqueue(input: EnqueueEventEditorFixItJobInput): Promise<EventEditorFixItJobRecord> {
    const id = sanitizeId(this.idFactory());
    const jobRoot = join(this.jobsRoot, id);
    const createdAt = nowIso();
    await mkdir(jobRoot, { recursive: true });
    await mkdir(this.worktreeRoot, { recursive: true });

    const specPath = input.specYaml ? join(jobRoot, 'spec.yaml') : undefined;
    const fixturePath = input.fixtureYaml ? join(jobRoot, 'fixture.yaml') : undefined;
    if (specPath) await writeYamlText(specPath, input.specYaml!);
    if (fixturePath) await writeYamlText(fixturePath, input.fixtureYaml!);
    if (input.sessionSnapshot) {
      await this.writeSessionSnapshot(id, input.sessionSnapshot);
    }

    const record: EventEditorFixItJobRecord = compactRecord({
      kind: 'event-editor-fixit-job' as const,
      id,
      status: 'queued' as const,
      createdAt,
      updatedAt: createdAt,
      repoRoot: this.repoRoot,
      artifactRoot: this.artifactRoot,
      jobRoot,
      worktreeRoot: this.worktreeRoot,
      baseRef: input.baseRef ?? 'HEAD',
      eventsPath: join(jobRoot, 'events.jsonl'),
      ...(input.specId ? { specId: input.specId } : {}),
      ...(input.title ? { title: input.title } : {}),
      ...(input.prompt ? { prompt: input.prompt } : {}),
      ...(input.fixItSessionId ? { fixItSessionId: input.fixItSessionId } : {}),
      ...(specPath ? { specPath } : {}),
      ...(fixturePath ? { fixturePath } : {}),
    });
    await this.writeJob(record);
    await this.appendEvent(id, {
      source: 'server',
      phase: 'queued',
      message: `Queued Fix-it job ${id}`,
      details: { specId: input.specId, baseRef: record.baseRef },
    });
    return record;
  }

  async getJob(id: string): Promise<EventEditorFixItJobRecord | undefined> {
    return readYamlFile<EventEditorFixItJobRecord>(this.jobPath(id));
  }

  async listJobs(): Promise<EventEditorFixItJobRecord[]> {
    if (!existsSync(this.jobsRoot)) return [];
    const entries = await readdir(this.jobsRoot, { withFileTypes: true });
    const jobs: EventEditorFixItJobRecord[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const job = await this.getJob(entry.name);
      if (job?.kind === 'event-editor-fixit-job') jobs.push(job);
    }
    return jobs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async activeJobs(): Promise<EventEditorFixItJobRecord[]> {
    return (await this.listJobs()).filter((job) => ACTIVE_STATUSES.has(job.status));
  }

  async claimNextQueuedJob(): Promise<EventEditorFixItJobRecord | undefined> {
    const activeCount = (await this.activeJobs()).length;
    if (activeCount >= this.maxConcurrentJobs) return undefined;
    const queued = (await this.listJobs()).find((job) => job.status === 'queued');
    return queued ? this.startJob(queued.id) : undefined;
  }

  async startJob(id: string): Promise<EventEditorFixItJobRecord> {
    const job = await this.requireJob(id);
    if (job.status !== 'queued') {
      throw new Error(`Fix-it job ${id} is ${job.status}; only queued jobs can be started.`);
    }

    const worktreePath = join(this.worktreeRoot, id);
    await mkdir(dirname(worktreePath), { recursive: true });
    if (!existsSync(worktreePath)) {
      await runGit(this.repoRoot, ['worktree', 'add', '--detach', worktreePath, job.baseRef]);
    }

    const updated = await this.updateJob(id, {
      status: 'running',
      worktreePath,
      message: 'Worktree ready',
    });
    await this.appendEvent(id, {
      source: 'server',
      phase: 'worktree_ready',
      message: `Created worktree for Fix-it job ${id}`,
      details: { worktreePath, baseRef: job.baseRef },
    });
    return updated;
  }

  async markCriticRunning(id: string): Promise<EventEditorFixItJobRecord> {
    return this.updateJob(id, { status: 'critic', message: 'Critic running' });
  }

  async completeJob(id: string, input: CompleteEventEditorFixItJobInput): Promise<EventEditorFixItJobRecord> {
    const status = input.releaseWorktree === false ? input.status : 'complete';
    let updated = await this.updateJob(id, {
      status,
      ...(input.message ? { message: input.message } : {}),
      ...(input.result ? { result: input.result } : {}),
    });
    await this.appendEvent(id, {
      source: 'server',
      phase: 'completed',
      message: input.message ?? `Fix-it job ${id} completed with ${input.status}`,
      details: { status: input.status, released: input.releaseWorktree !== false },
    });
    if (input.releaseWorktree !== false) {
      updated = await this.releaseWorktree(id, {
        status: 'complete',
        ...(input.message ? { message: input.message } : {}),
      });
    }
    return updated;
  }

  /**
   * Transition a job that was active when the server died into the
   * `interrupted` terminal state. Releases the worktree (which calls
   * `git checkout` to revert any uncommitted edits) and records an event
   * explaining what happened.
   *
   * Safe to call on any job; non-active jobs are returned unchanged.
   */
  async markInterrupted(
    id: string,
    message = 'Server restarted while this Fix-it job was active. Use Resume to retry.',
  ): Promise<EventEditorFixItJobRecord> {
    const job = await this.requireJob(id);
    if (!ACTIVE_STATUSES.has(job.status)) return job;
    await this.appendEvent(id, {
      source: 'server',
      phase: 'interrupted',
      message,
      details: { priorStatus: job.status },
    });
    return this.releaseWorktree(id, { status: 'interrupted', message });
  }

  /**
   * Sweep all active jobs (running/critic) and mark them interrupted.
   * Intended for server startup: any job left in an active state is a
   * zombie from the previous process and has nobody driving it.
   */
  async sweepInterrupted(): Promise<EventEditorFixItJobRecord[]> {
    const active = await this.activeJobs();
    const interrupted: EventEditorFixItJobRecord[] = [];
    for (const job of active) {
      try {
        interrupted.push(await this.markInterrupted(job.id));
      } catch {
        // Best-effort — skip and continue with the rest.
      }
    }
    return interrupted;
  }

  async markComplete(id: string, message = 'Fix-it job marked complete by user'): Promise<EventEditorFixItJobRecord> {
    const job = await this.requireJob(id);
    if (ACTIVE_STATUSES.has(job.status)) {
      throw new Error(`Fix-it job ${id} is ${job.status}; running jobs cannot be marked complete.`);
    }
    await this.appendEvent(id, {
      source: 'user',
      phase: 'marked_complete',
      message,
    });
    return this.releaseWorktree(id, { status: 'complete', message });
  }

  async releaseWorktree(
    id: string,
    opts: { status?: EventEditorFixItJobStatus; message?: string } = {},
  ): Promise<EventEditorFixItJobRecord> {
    const job = await this.requireJob(id);
    if (job.worktreePath && existsSync(job.worktreePath)) {
      await runGit(this.repoRoot, ['worktree', 'remove', '--force', job.worktreePath])
        .catch(async () => {
          await rm(job.worktreePath!, { recursive: true, force: true });
          await runGit(this.repoRoot, ['worktree', 'prune']).catch(() => undefined);
        });
    }
    const updated = await this.updateJob(id, {
      status: opts.status ?? job.status,
      worktreePath: undefined,
      ...(opts.message ? { message: opts.message } : {}),
    });
    await this.appendEvent(id, {
      source: 'server',
      phase: 'worktree_released',
      message: `Released worktree for Fix-it job ${id}`,
    });
    return updated;
  }

  async appendEvent(id: string, event: EventEditorFixItJobEvent): Promise<void> {
    const job = await this.getJob(id);
    const eventsPath = job?.eventsPath ?? join(this.jobsRoot, id, 'events.jsonl');
    await mkdir(dirname(eventsPath), { recursive: true });
    await appendFile(eventsPath, `${JSON.stringify({ ...event, ts: event.ts ?? nowIso() })}\n`, 'utf-8');
  }

  async readEvents(id: string): Promise<EventEditorFixItJobEvent[]> {
    const job = await this.requireJob(id);
    if (!existsSync(job.eventsPath)) return [];
    const text = await readFile(job.eventsPath, 'utf-8');
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as EventEditorFixItJobEvent);
  }

  async writeSessionSnapshot(id: string, snapshot: EventEditorFixItSessionSnapshot): Promise<void> {
    const snapshotPath = this.sessionSnapshotPath(id);
    await mkdir(dirname(snapshotPath), { recursive: true });
    await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf-8');
  }

  async readSessionSnapshot(id: string): Promise<EventEditorFixItSessionSnapshot | undefined> {
    const snapshotPath = this.sessionSnapshotPath(id);
    if (!existsSync(snapshotPath)) return undefined;
    return JSON.parse(await readFile(snapshotPath, 'utf-8')) as EventEditorFixItSessionSnapshot;
  }

  private async updateJob(
    id: string,
    patch: EventEditorFixItJobPatch,
  ): Promise<EventEditorFixItJobRecord> {
    const existing = await this.requireJob(id);
    const updated = compactRecord({
      ...existing,
      ...patch,
      updatedAt: nowIso(),
    }) as EventEditorFixItJobRecord;
    await this.writeJob(updated);
    return updated;
  }

  private async requireJob(id: string): Promise<EventEditorFixItJobRecord> {
    const job = await this.getJob(id);
    if (!job) throw new Error(`Fix-it job not found: ${id}`);
    return job;
  }

  private async writeJob(record: EventEditorFixItJobRecord): Promise<void> {
    await writeYamlFile(this.jobPath(record.id), record);
  }

  private jobPath(id: string): string {
    return join(this.jobsRoot, sanitizeId(id), 'job.yaml');
  }

  private sessionSnapshotPath(id: string): string {
    return join(this.jobsRoot, sanitizeId(id), 'session.json');
  }
}

async function writeYamlText(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, 'utf-8');
}
