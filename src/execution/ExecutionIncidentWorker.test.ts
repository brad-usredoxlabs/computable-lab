import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExecutionIncidentWorker } from './ExecutionIncidentWorker.js';
import type { ExecutionIncidentService } from './ExecutionIncidentService.js';
import type { AppContext } from '../server.js';

describe('ExecutionIncidentWorker', () => {
  function createMockContext(): AppContext {
    const envelopes = new Map<string, { recordId: string; schemaId: string; payload: unknown }>();
    return {
      store: {
        async get(recordId: string) {
          return envelopes.get(recordId) ?? null;
        },
        async create(args: { envelope: { recordId: string; schemaId: string; payload: unknown } }) {
          envelopes.set(args.envelope.recordId, args.envelope);
          return { success: true };
        },
        async update(args: { envelope: { recordId: string; schemaId: string; payload: unknown } }) {
          envelopes.set(args.envelope.recordId, args.envelope);
          return { success: true };
        },
      },
    } as unknown as AppContext;
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs one scan and reports status metadata', async () => {
    const service = {
      scanAndCreateIncidents: vi.fn(async () => ({
        created: 1,
        skipped: 0,
        details: { adapterHealthCreated: 1, retryExhaustedCreated: 0 },
      })),
    } as unknown as ExecutionIncidentService;

    const worker = new ExecutionIncidentWorker(createMockContext(), service);
    const summary = await worker.runOnce();
    expect(summary.created).toBe(1);

    const status = worker.status();
    expect(status.running).toBe(false);
    expect(status.inFlight).toBe(false);
    expect(status.errorStreak).toBe(0);
    expect(status.lastRunAt).toBeTypeOf('string');
    expect(status.lastRunSummary).toBeDefined();
  });

  it('returns skippedBusy when a scan is already in flight', async () => {
    let release: (() => void) | null = null;
    const service = {
      scanAndCreateIncidents: vi.fn(
        () =>
          new Promise((resolve) => {
            release = () => resolve({ created: 0, skipped: 0, details: {} });
          }),
      ),
    } as unknown as ExecutionIncidentService;

    const worker = new ExecutionIncidentWorker(createMockContext(), service);
    const first = worker.runOnce();
    const second = await worker.runOnce();
    expect(second.skippedBusy).toBe(true);
    expect(release).toBeTypeOf('function');
    release?.();
    await first;
  });

  it('starts and stops interval worker loop', async () => {
    vi.useFakeTimers();
    const service = {
      scanAndCreateIncidents: vi.fn(async () => ({ created: 0, skipped: 0, details: {} })),
    } as unknown as ExecutionIncidentService;

    const ctx = createMockContext();
    const worker = new ExecutionIncidentWorker(ctx, service);
    const started = await worker.start(20);
    expect(started.running).toBe(true);
    expect(started.intervalMs).toBe(20);

    await vi.advanceTimersByTimeAsync(65);
    expect(service.scanAndCreateIncidents).toHaveBeenCalled();

    const stopped = await worker.stop();
    expect(stopped.running).toBe(false);
  });

  it('restores persisted state and reports lease contention on takeover attempt', async () => {
    vi.useFakeTimers();
    const ctx = createMockContext();
    const service = {
      scanAndCreateIncidents: vi.fn(async () => ({ created: 0, skipped: 0, details: {} })),
    } as unknown as ExecutionIncidentService;

    const workerA = new ExecutionIncidentWorker(ctx, service);
    await workerA.start(25);
    await workerA.stop({ persist: false });

    const workerB = new ExecutionIncidentWorker(ctx, service);
    await workerB.restore();
    const status = workerB.status();
    expect(status.running).toBe(false);
    expect(status.intervalMs).toBe(25);
    expect(status.leaseBlockedBy).toBeDefined();
    const taken = await workerB.start(25, { forceTakeover: true });
    expect(taken.running).toBe(true);

    await workerB.stop();
    await workerA.stop();
  });
});
