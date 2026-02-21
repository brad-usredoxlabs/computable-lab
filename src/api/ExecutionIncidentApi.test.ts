import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { createServer, initializeApp } from '../server.js';
import type { AppContext } from '../server.js';

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
  resolvedAt: { type: string }
  notes: { type: string }
`;

describe('Execution Incident API', () => {
  const testDir = resolve(process.cwd(), 'tmp/execution-incident-api-test');
  let ctx: AppContext;
  let app: FastifyInstance;

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
        recordId: 'EXR-000100',
        schemaId: 'https://computable-lab.com/schema/computable-lab/execution-run.schema.yaml',
        payload: {
          kind: 'execution-run',
          recordId: 'EXR-000100',
          robotPlanRef: { kind: 'record', id: 'RP-000100', type: 'robot-plan' },
          status: 'failed',
          mode: 'sidecar_process',
          startedAt: new Date().toISOString(),
          failureCode: 'RETRY_EXHAUSTED',
          failureClass: 'terminal',
          retryReason: 'retry_exhausted_after_3',
          retryRecommended: false,
        },
      },
      message: 'seed retry exhausted run',
      skipValidation: true,
      skipLint: true,
    });
    app = await createServer(ctx, {
      logLevel: 'silent',
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it('supports incident scan, lifecycle transitions, summary, and worker controls', async () => {
    const scanned = await app.inject({
      method: 'POST',
      url: '/api/execution/incidents/scan',
      payload: {},
    });
    expect(scanned.statusCode).toBe(200);
    const scannedBody = JSON.parse(scanned.payload) as { summary?: { created?: number } };
    expect((scannedBody.summary?.created ?? 0) >= 1).toBe(true);

    const listed = await app.inject({
      method: 'GET',
      url: '/api/execution/incidents',
    });
    expect(listed.statusCode).toBe(200);
    const listedBody = JSON.parse(listed.payload) as { incidents: Array<{ recordId: string }> };
    expect(listedBody.incidents.length).toBeGreaterThan(0);
    const incidentId = listedBody.incidents[0]!.recordId;

    const acked = await app.inject({
      method: 'POST',
      url: `/api/execution/incidents/${incidentId}/ack`,
      payload: { notes: 'operator ack' },
    });
    expect(acked.statusCode).toBe(200);
    expect(JSON.parse(acked.payload).status).toBe('acked');

    const resolved = await app.inject({
      method: 'POST',
      url: `/api/execution/incidents/${incidentId}/resolve`,
      payload: { notes: 'operator resolved' },
    });
    expect(resolved.statusCode).toBe(200);
    expect(JSON.parse(resolved.payload).status).toBe('resolved');

    const summary = await app.inject({
      method: 'GET',
      url: '/api/execution/incidents/summary',
    });
    expect(summary.statusCode).toBe(200);
    const summaryBody = JSON.parse(summary.payload) as { summary: { total: number; byStatus: Record<string, number> } };
    expect(summaryBody.summary.total).toBeGreaterThan(0);
    expect((summaryBody.summary.byStatus['resolved'] ?? 0) >= 1).toBe(true);

    const started = await app.inject({
      method: 'POST',
      url: '/api/execution/incidents/worker/start',
      payload: { intervalMs: 50 },
    });
    expect(started.statusCode).toBe(200);
    expect(JSON.parse(started.payload).status.running).toBe(true);

    const status = await app.inject({
      method: 'GET',
      url: '/api/execution/incidents/worker/status',
    });
    expect(status.statusCode).toBe(200);
    expect(JSON.parse(status.payload).status.running).toBe(true);

    const runOnce = await app.inject({
      method: 'POST',
      url: '/api/execution/incidents/worker/run-once',
      payload: {},
    });
    expect(runOnce.statusCode).toBe(200);
    expect(JSON.parse(runOnce.payload).summary.timestamp).toBeTypeOf('string');

    const takeover = await app.inject({
      method: 'POST',
      url: '/api/execution/incidents/worker/takeover',
      payload: { intervalMs: 25 },
    });
    expect(takeover.statusCode).toBe(200);
    expect(JSON.parse(takeover.payload).status.running).toBe(true);

    const stopped = await app.inject({
      method: 'POST',
      url: '/api/execution/incidents/worker/stop',
      payload: {},
    });
    expect(stopped.statusCode).toBe(200);
    expect(JSON.parse(stopped.payload).status.running).toBe(false);

    const retryTakeover = await app.inject({
      method: 'POST',
      url: '/api/execution/retry-worker/takeover',
      payload: { intervalMs: 25 },
    });
    expect(retryTakeover.statusCode).toBe(200);
    expect(JSON.parse(retryTakeover.payload).status.running).toBe(true);
    const retryStopped = await app.inject({
      method: 'POST',
      url: '/api/execution/retry-worker/stop',
      payload: {},
    });
    expect(retryStopped.statusCode).toBe(200);
    expect(JSON.parse(retryStopped.payload).status.running).toBe(false);

    const pollerTakeover = await app.inject({
      method: 'POST',
      url: '/api/execution/poller/takeover',
      payload: { intervalMs: 25 },
    });
    expect(pollerTakeover.statusCode).toBe(200);
    expect(JSON.parse(pollerTakeover.payload).status.running).toBe(true);
    const pollerStopped = await app.inject({
      method: 'POST',
      url: '/api/execution/poller/stop',
      payload: {},
    });
    expect(pollerStopped.statusCode).toBe(200);
    expect(JSON.parse(pollerStopped.payload).status.running).toBe(false);

    const leases = await app.inject({
      method: 'GET',
      url: '/api/execution/workers/leases',
    });
    expect(leases.statusCode).toBe(200);
    const leasesBody = JSON.parse(leases.payload) as {
      total: number;
      leases: Array<{ workerId: string; stateRecordId: string; status: string; running: boolean }>;
    };
    expect(leasesBody.total).toBe(3);
    const retryLease = leasesBody.leases.find((l) => l.workerId === 'retry-worker');
    expect(retryLease).toBeDefined();
    expect(retryLease?.stateRecordId).toBe('EWS-RETRY-WORKER');

    const filtered = await app.inject({
      method: 'GET',
      url: '/api/execution/workers/leases?workerId=incident-scanner',
    });
    expect(filtered.statusCode).toBe(200);
    const filteredBody = JSON.parse(filtered.payload) as { total: number; leases: Array<{ workerId: string }> };
    expect(filteredBody.total).toBe(1);
    expect(filteredBody.leases[0]?.workerId).toBe('incident-scanner');

    const opsSnapshot = await app.inject({
      method: 'GET',
      url: '/api/execution/ops/snapshot',
    });
    expect(opsSnapshot.statusCode).toBe(200);
    const opsBody = JSON.parse(opsSnapshot.payload) as {
      executionRuns: { total: number; byStatus: Record<string, number>; retryCandidates: number };
      incidents: { total: number };
      adapterHealth: { total: number };
      workerLeases: { total: number };
      timestamp: string;
    };
    expect(opsBody.executionRuns.total).toBeGreaterThan(0);
    expect(opsBody.executionRuns.byStatus).toBeTypeOf('object');
    expect(opsBody.executionRuns.retryCandidates).toBeGreaterThanOrEqual(0);
    expect(opsBody.incidents.total).toBeGreaterThan(0);
    expect(opsBody.adapterHealth.total).toBeGreaterThan(0);
    expect(opsBody.workerLeases.total).toBe(3);
    expect(opsBody.timestamp).toBeTypeOf('string');
  });
});
