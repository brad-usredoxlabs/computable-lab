import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeApp } from '../server.js';
import type { AppContext } from '../server.js';
import { ExecutionIncidentService } from './ExecutionIncidentService.js';
import { AdapterHealthService } from './AdapterHealthService.js';

const executionRunSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/execution-run.schema.yaml"
type: object
required: [kind, recordId, robotPlanRef, status, mode, startedAt]
properties:
  kind: { const: "execution-run" }
  recordId: { type: string }
  robotPlanRef: { type: object }
  status: { type: string }
  mode: { type: string }
  startedAt: { type: string }
  failureCode: { type: string }
  failureClass: { type: string }
  retryReason: { type: string }
  retryRecommended: { type: boolean }
`;

const incidentSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/execution-incident.schema.yaml"
type: object
required: [kind, recordId, title, status, incidentType, source, detectedAt]
properties:
  kind: { const: "execution-incident" }
  recordId: { type: string }
  title: { type: string }
  status: { type: string, enum: [open, acked, resolved] }
  incidentType: { type: string }
  source: { type: object }
  dedupeKey: { type: string }
  details: { type: object }
  detectedAt: { type: string }
  acknowledgedAt: { type: string }
  notes: { type: string }
`;

describe('ExecutionIncidentService', () => {
  const testDir = resolve(process.cwd(), 'tmp/execution-incident-service-test');
  let ctx: AppContext;

  beforeAll(async () => {
    await mkdir(resolve(testDir, 'schema'), { recursive: true });
    await mkdir(resolve(testDir, 'records'), { recursive: true });
    await writeFile(resolve(testDir, 'schema/execution-run.schema.yaml'), executionRunSchema);
    await writeFile(resolve(testDir, 'schema/execution-incident.schema.yaml'), incidentSchema);
    ctx = await initializeApp(testDir, {
      schemaDir: 'schema',
      recordsDir: 'records',
      logLevel: 'silent',
    });
    await ctx.store.create({
      envelope: {
        recordId: 'EXR-000001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/execution-run.schema.yaml',
        payload: {
          kind: 'execution-run',
          recordId: 'EXR-000001',
          robotPlanRef: { kind: 'record', id: 'RP-000001', type: 'robot-plan' },
          status: 'failed',
          mode: 'sidecar_process',
          startedAt: new Date().toISOString(),
          failureCode: 'RETRY_EXHAUSTED',
          failureClass: 'terminal',
          retryReason: 'retry_exhausted_after_3',
          retryRecommended: false,
        },
      },
      message: 'seed exhausted run',
      skipValidation: true,
      skipLint: true,
    });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('scans and creates deduplicated incidents, then acknowledges/resolves with summary', async () => {
    const fakeHealth = {
      check: async () => ({
        adapters: [
          { adapterId: 'integra_assist', status: 'missing_config', details: { expected: ['x'] } },
          { adapterId: 'opentrons_ot2', status: 'ready', details: {} },
        ],
        total: 2,
        summary: {},
        timestamp: new Date().toISOString(),
      }),
    };
    const service = new ExecutionIncidentService(ctx, fakeHealth as unknown as AdapterHealthService);
    const first = await service.scanAndCreateIncidents();
    expect(first.created).toBe(2);
    const second = await service.scanAndCreateIncidents();
    expect(second.created).toBe(0);
    expect(second.skipped).toBeGreaterThanOrEqual(2);

    const listed = await service.listIncidents({ status: 'open' });
    expect(listed.length).toBe(2);
    const firstIncidentId = listed[0]?.recordId;
    expect(firstIncidentId).toBeDefined();
    const acked = await service.acknowledgeIncident(firstIncidentId!, 'ack test');
    expect(acked.status).toBe('acked');

    const ackedList = await service.listIncidents({ status: 'acked' });
    expect(ackedList.length).toBe(1);

    const resolved = await service.resolveIncident(firstIncidentId!, 'resolved test');
    expect(resolved.status).toBe('resolved');
    const resolvedList = await service.listIncidents({ status: 'resolved' });
    expect(resolvedList.length).toBe(1);

    const summary = await service.summary();
    expect(summary.total).toBe(2);
    expect(summary.byStatus).toMatchObject({ resolved: 1, open: 1 });
    expect(summary.byType).toMatchObject({ adapter_health: 1, retry_exhausted: 1 });
  });
});
