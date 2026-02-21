import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeApp } from '../server.js';
import type { AppContext } from '../server.js';
import { ExecutionTimelineService } from './ExecutionTimelineService.js';

describe('ExecutionTimelineService', () => {
  const testDir = resolve(process.cwd(), 'tmp/execution-timeline-service-test');
  let ctx: AppContext;

  beforeAll(async () => {
    await mkdir(resolve(testDir, 'schema'), { recursive: true });
    await mkdir(resolve(testDir, 'records'), { recursive: true });
    ctx = await initializeApp(testDir, {
      schemaDir: 'schema',
      recordsDir: 'records',
      logLevel: 'silent',
    });

    await ctx.store.create({
      envelope: {
        recordId: 'EVG-000001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml',
        payload: {
          kind: 'event-graph',
          id: 'EVG-000001',
          events: [
            {
              eventId: 'evt-1',
              event_type: 'read',
              at: '2026-01-01T00:00:03.000Z',
            },
          ],
        },
      },
      message: 'seed event graph',
      skipValidation: true,
      skipLint: true,
    });

    await ctx.store.create({
      envelope: {
        recordId: 'ILOG-000001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/instrument-log.schema.yaml',
        payload: {
          kind: 'instrument-log',
          id: 'ILOG-000001',
          logType: 'robot_telemetry',
          status: 'completed',
          entries: [
            {
              timestamp: '2026-01-01T00:00:02.000Z',
              entryType: 'info',
              message: 'run status update',
              data: {
                robotPlanId: 'RP-000001',
              },
            },
          ],
        },
      },
      message: 'seed log',
      skipValidation: true,
      skipLint: true,
    });

    await ctx.store.create({
      envelope: {
        recordId: 'EXR-000001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/execution-run.schema.yaml',
        payload: {
          kind: 'execution-run',
          recordId: 'EXR-000001',
          robotPlanRef: { kind: 'record', id: 'RP-000001', type: 'robot-plan' },
          status: 'completed',
          mode: 'sidecar_process',
          startedAt: '2026-01-01T00:00:01.000Z',
          completedAt: '2026-01-01T00:00:04.000Z',
          materializedEventGraphId: 'EVG-000001',
        },
      },
      message: 'seed execution-run',
      skipValidation: true,
      skipLint: true,
    });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('builds merged timeline from run, logs, and materialized event graph', async () => {
    const service = new ExecutionTimelineService(ctx);
    const timeline = await service.getTimeline('EXR-000001');

    expect(timeline.executionRunId).toBe('EXR-000001');
    expect(timeline.total).toBeGreaterThanOrEqual(4);
    expect(timeline.entries[0]?.type).toBe('run_started');
    expect(timeline.entries[1]?.source).toBe('instrument-log');
    expect(timeline.entries.some((entry) => entry.source === 'event-graph' && entry.type === 'read')).toBe(true);
    expect(timeline.entries[timeline.entries.length - 1]?.type).toBe('run_finished');
  });
});
