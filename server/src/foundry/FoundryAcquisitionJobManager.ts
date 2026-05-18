import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { nowIso, readYamlFile, writeYamlFile } from './FoundryArtifacts.js';
import type { FoundryAcquisitionJobKind } from './FoundryRegistryTools.js';
import type { FoundryAcquisitionStructuredResult } from './FoundryAcquisitionOutputs.js';

export type FoundryAcquisitionJobStatus =
  | 'queued'
  | 'running'
  | 'needs-review'
  | 'failed'
  | 'canceled'
  | 'complete';

export interface FoundryAcquisitionJobTurn {
  role: 'user' | 'assistant';
  content: string;
  ts: string;
}

export interface FoundryAcquisitionJobRecord {
  kind: 'foundry-acquisition-job';
  id: string;
  jobKind: FoundryAcquisitionJobKind;
  status: FoundryAcquisitionJobStatus;
  createdAt: string;
  updatedAt: string;
  artifactRoot: string;
  jobRoot: string;
  eventsPath: string;
  prompt: string;
  title?: string;
  message?: string;
  turns: FoundryAcquisitionJobTurn[];
  result?: Record<string, unknown>;
  outputSummary?: FoundryAcquisitionStructuredResult;
  resultPath?: string;
  tracePath?: string;
}

export interface FoundryAcquisitionJobEvent {
  ts?: string;
  source: 'server' | 'agent' | 'tool' | 'user';
  phase: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface EnqueueFoundryAcquisitionJobInput {
  jobKind: FoundryAcquisitionJobKind;
  prompt: string;
  title?: string;
}

export interface FoundryAcquisitionJobManagerOptions {
  artifactRoot: string;
  idFactory?: () => string;
}

type FoundryAcquisitionJobPatch = {
  [K in keyof Omit<FoundryAcquisitionJobRecord, 'kind' | 'id' | 'createdAt'>]?:
    Omit<FoundryAcquisitionJobRecord, 'kind' | 'id' | 'createdAt'>[K] | undefined;
};

function sanitizeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `foundry-${Date.now()}`;
}

function compactRecord<T extends Record<string, unknown>>(record: T): T {
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) delete record[key];
  }
  return record;
}

export class FoundryAcquisitionJobManager {
  readonly artifactRoot: string;
  readonly jobsRoot: string;
  private readonly idFactory: () => string;

  constructor(options: FoundryAcquisitionJobManagerOptions) {
    this.artifactRoot = resolve(options.artifactRoot);
    this.jobsRoot = join(this.artifactRoot, 'foundry', 'jobs');
    this.idFactory = options.idFactory ?? (() => `foundry-${randomUUID()}`);
  }

  async enqueue(input: EnqueueFoundryAcquisitionJobInput): Promise<FoundryAcquisitionJobRecord> {
    const id = sanitizeId(this.idFactory());
    const createdAt = nowIso();
    const jobRoot = join(this.jobsRoot, id);
    await mkdir(jobRoot, { recursive: true });
    const record: FoundryAcquisitionJobRecord = compactRecord({
      kind: 'foundry-acquisition-job' as const,
      id,
      jobKind: input.jobKind,
      status: 'queued' as const,
      createdAt,
      updatedAt: createdAt,
      artifactRoot: this.artifactRoot,
      jobRoot,
      eventsPath: join(jobRoot, 'events.jsonl'),
      prompt: input.prompt,
      ...(input.title ? { title: input.title } : {}),
      turns: [{ role: 'user' as const, content: input.prompt, ts: createdAt }],
    });
    await this.writeJob(record);
    await this.appendEvent(id, {
      source: 'server',
      phase: 'queued',
      message: `Queued ${input.jobKind} job ${id}`,
      details: { jobKind: input.jobKind },
    });
    return record;
  }

  async listJobs(): Promise<FoundryAcquisitionJobRecord[]> {
    if (!existsSync(this.jobsRoot)) return [];
    const entries = await readdir(this.jobsRoot, { withFileTypes: true });
    const jobs: FoundryAcquisitionJobRecord[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const job = await this.getJob(entry.name);
      if (job?.kind === 'foundry-acquisition-job') jobs.push(job);
    }
    return jobs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async getJob(id: string): Promise<FoundryAcquisitionJobRecord | undefined> {
    return readYamlFile<FoundryAcquisitionJobRecord>(this.jobPath(id));
  }

  async startJob(id: string, tracePath?: string): Promise<FoundryAcquisitionJobRecord> {
    await this.appendEvent(id, {
      source: 'server',
      phase: 'running',
      message: `Started Foundry acquisition job ${id}`,
      ...(tracePath ? { details: { tracePath } } : {}),
    });
    return this.updateJob(id, {
      status: 'running',
      message: 'Agent running',
      ...(tracePath ? { tracePath } : {}),
    });
  }

  async continueJob(id: string, message: string): Promise<FoundryAcquisitionJobRecord> {
    const job = await this.requireJob(id);
    if (job.status === 'running') {
      throw new Error(`Foundry job ${id} is already running.`);
    }
    const turn = { role: 'user' as const, content: message, ts: nowIso() };
    const updated = await this.updateJob(id, {
      status: 'queued',
      message: 'Queued with user feedback',
      turns: [...job.turns, turn],
    });
    await this.appendEvent(id, {
      source: 'user',
      phase: 'continued',
      message,
    });
    return updated;
  }

  async completeJob(
    id: string,
    result: Record<string, unknown>,
    assistantMessage: string,
    outputSummary?: FoundryAcquisitionStructuredResult,
  ): Promise<FoundryAcquisitionJobRecord> {
    const job = await this.requireJob(id);
    const resultPath = join(job.jobRoot, 'result.json');
    const updated = await this.updateJob(id, {
      status: 'needs-review',
      message: 'Draft ready for review',
      result,
      resultPath,
      ...(outputSummary ? { outputSummary } : {}),
      turns: [...job.turns, { role: 'assistant', content: assistantMessage, ts: nowIso() }],
    });
    await this.writeArtifact(id, 'result.json', JSON.stringify({
      ...result,
      ...(outputSummary ? { outputSummary } : {}),
    }, null, 2));
    await this.writeArtifact(id, 'assistant.md', `${assistantMessage.trim()}\n`);
    await this.appendEvent(id, {
      source: 'agent',
      phase: 'needs_review',
      message: 'Agent produced a draft for review',
      details: {
        resultPath,
        ...(outputSummary ? {
          outputStatus: outputSummary.status,
          artifactCount: outputSummary.artifacts.length,
          recordCount: outputSummary.records.length,
          blockerCount: outputSummary.blockers.length,
        } : {}),
      },
    });
    return updated;
  }

  async failJob(
    id: string,
    message: string,
    result?: Record<string, unknown>,
    outputSummary?: FoundryAcquisitionStructuredResult,
  ): Promise<FoundryAcquisitionJobRecord> {
    const job = await this.requireJob(id);
    const resultPath = join(job.jobRoot, 'result.json');
    if (result || outputSummary) {
      await this.writeArtifact(id, 'result.json', JSON.stringify({
        ...(result ?? {}),
        ...(outputSummary ? { outputSummary } : {}),
      }, null, 2));
    }
    await this.appendEvent(id, {
      source: 'server',
      phase: 'failed',
      message,
      ...(outputSummary ? {
        details: {
          resultPath,
          outputStatus: outputSummary.status,
          artifactCount: outputSummary.artifacts.length,
          recordCount: outputSummary.records.length,
          blockerCount: outputSummary.blockers.length,
        },
      } : {}),
    });
    return this.updateJob(id, {
      status: 'failed',
      message,
      ...(result ? { result } : {}),
      ...(result || outputSummary ? { resultPath } : {}),
      ...(outputSummary ? { outputSummary } : {}),
    });
  }

  async markComplete(id: string, message = 'Foundry job marked complete by user'): Promise<FoundryAcquisitionJobRecord> {
    await this.appendEvent(id, {
      source: 'user',
      phase: 'marked_complete',
      message,
    });
    return this.updateJob(id, { status: 'complete', message });
  }

  async appendEvent(id: string, event: FoundryAcquisitionJobEvent): Promise<void> {
    const job = await this.getJob(id);
    const eventsPath = job?.eventsPath ?? join(this.jobsRoot, sanitizeId(id), 'events.jsonl');
    await mkdir(dirname(eventsPath), { recursive: true });
    await appendFile(eventsPath, `${JSON.stringify({ ...event, ts: event.ts ?? nowIso() })}\n`, 'utf-8');
  }

  async readEvents(id: string): Promise<FoundryAcquisitionJobEvent[]> {
    const job = await this.requireJob(id);
    if (!existsSync(job.eventsPath)) return [];
    const text = await readFile(job.eventsPath, 'utf-8');
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as FoundryAcquisitionJobEvent);
  }

  private async writeArtifact(id: string, name: string, content: string): Promise<void> {
    const job = await this.requireJob(id);
    const path = join(job.jobRoot, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf-8');
  }

  private async updateJob(
    id: string,
    patch: FoundryAcquisitionJobPatch,
  ): Promise<FoundryAcquisitionJobRecord> {
    const existing = await this.requireJob(id);
    const updated = compactRecord({
      ...existing,
      ...patch,
      updatedAt: nowIso(),
    }) as FoundryAcquisitionJobRecord;
    await this.writeJob(updated);
    return updated;
  }

  private async requireJob(id: string): Promise<FoundryAcquisitionJobRecord> {
    const job = await this.getJob(id);
    if (!job) throw new Error(`Foundry job not found: ${id}`);
    return job;
  }

  private async writeJob(record: FoundryAcquisitionJobRecord): Promise<void> {
    await writeYamlFile(this.jobPath(record.id), record);
  }

  private jobPath(id: string): string {
    return join(this.jobsRoot, sanitizeId(id), 'job.yaml');
  }
}
