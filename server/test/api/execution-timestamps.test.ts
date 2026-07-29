import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { createServer, initializeApp } from '../../src/server.js';
import type { AppContext } from '../../src/server.js';

const MATERIAL_PROFILE_REGISTRY = [
  'version: 1',
  'profiles:',
  '  chemical: { label: Chemical, applies_when: { domain: [chemical] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }',
  '  cell_line: { label: Cell, applies_when: { domain: [cell_line] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }',
  '  media_composition: { label: Media, applies_when: { domain: [media] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }',
  '  single_active_formulation: { label: Single, applies_when: { formulation_kind: [single_active] }, layers: [formulation], fields: [{ path: name, layer: formulation, label: Name, widget: text, control: free-text }], quick_add: [name] }',
  '  sample: { label: Sample, applies_when: { domain: [sample] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }',
  '  other: { label: Other, applies_when: { domain: [other] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }',
  '',
].join('\n');

const RUN_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/run.schema.yaml';

/**
 * Create a run record via the API. Returns the recordId.
 */
async function createRun(app: FastifyInstance, title: string): Promise<string> {
  const recordId = `TS-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    payload: {
      schemaId: RUN_SCHEMA_ID,
      payload: {
        kind: 'run',
        recordId,
        title,
        status: 'planned',
      },
    },
  });
  if (res.statusCode !== 201) {
    throw new Error(`Failed to create run: ${res.statusCode} - ${res.payload}`);
  }
  return recordId;
}

describe('Execution Timestamps API', () => {
  const testDir = resolve(process.cwd(), 'tmp/execution-timestamps-api-test');
  let ctx: AppContext;
  let app: FastifyInstance;

  beforeAll(async () => {
    await mkdir(resolve(testDir, 'schema'), { recursive: true });
    await mkdir(resolve(testDir, 'schema/lab'), { recursive: true });
    await mkdir(resolve(testDir, 'records'), { recursive: true });

    // Required material profile registry
    await writeFile(resolve(testDir, 'schema/lab/material-profile.registry.yaml'), MATERIAL_PROFILE_REGISTRY);

    // Minimal standalone run schema for tests (no external $ref dependencies)
    const runSchema = `
$schema: https://json-schema.org/draft/2020-12/schema
$id: https://computable-lab.com/schema/computable-lab/run.schema.yaml
title: Run
type: object
unevaluatedProperties: false
required:
  - kind
  - recordId
  - status
properties:
  kind:
    const: run
  recordId:
    type: string
  title:
    type: string
  experimentId:
    type: string
  studyId:
    type: string
  label:
    type: string
  status:
    type: string
    enum:
      - planned
      - in_progress
      - completed
      - aborted
      - failed
      - superseded
  createdAt:
    type: string
    format: date-time
  updatedAt:
    type: string
    format: date-time
  startedAt:
    type: string
    format: date-time
  completedAt:
    type: string
    format: date-time
  createdBy:
    type: string
  updatedBy:
    type: string
  protocolRef:
    type: object
  executionTracking:
    type: object
  executionSettings:
    type: object
  executedBy:
    type: string
  plannedEventGraphId:
    type: string
  executedEventGraphId:
    type: string
  endedAt:
    type: string
    format: date-time
  tags:
    type: array
    items:
      type: string
`;
    await writeFile(resolve(testDir, 'schema/run.schema.yaml'), runSchema);

    ctx = await initializeApp(testDir, {
      schemaDir: 'schema',
      recordsDir: 'records',
      logLevel: 'silent',
    });
    app = await createServer(ctx, { logLevel: 'silent' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await rm(testDir, { recursive: true, force: true });
  });

  // ========================================================================
  // POST /api/runs/:runId/step/:stepId/start
  // ========================================================================

  describe('POST /api/runs/:runId/step/:stepId/start', () => {
    it('returns 400 when run is not in planned status', async () => {
      const runId = await createRun(app, 'State transition test');

      const res = await app.inject({
        method: 'POST',
        url: `/api/runs/${runId}/step/step-1/start`,
        payload: { executedBy: 'test-operator' },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe('INVALID_STATE_TRANSITION');
    });

    it('records step start timestamp after run is started', async () => {
      const runId = await createRun(app, 'Step start test');

      // Start the run
      const startRes = await app.inject({
        method: 'POST',
        url: `/api/runs/${runId}/start`,
        payload: { executedBy: 'test-operator' },
      });
      if (startRes.statusCode !== 200) {
        console.error('Start run error:', JSON.parse(startRes.payload));
      }
      expect(startRes.statusCode).toBe(200);
      const startBody = JSON.parse(startRes.payload);
      expect(startBody.success).toBe(true);
      expect(startBody.run.status).toBe('in_progress');

      // Record step start
      const stepStartRes = await app.inject({
        method: 'POST',
        url: `/api/runs/${runId}/step/step-1/start`,
        payload: {
          startedAt: '2025-01-15T10:00:00.000Z',
          executedBy: 'test-operator',
        },
      });
      expect(stepStartRes.statusCode).toBe(200);
      const stepBody = JSON.parse(stepStartRes.payload);
      expect(stepBody.success).toBe(true);
      expect(stepBody.stepId).toBe('step-1');
      expect(stepBody.startedAt).toBe('2025-01-15T10:00:00.000Z');
    });

    it('auto-generates timestamp when startedAt not provided', async () => {
      const runId = await createRun(app, 'Auto timestamp test');

      // Start the run
      await app.inject({
        method: 'POST',
        url: `/api/runs/${runId}/start`,
        payload: { executedBy: 'test-operator' },
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/runs/${runId}/step/step-1/start`,
        payload: { executedBy: 'test-operator' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.startedAt).toBeDefined();
      expect(new Date(body.startedAt).getTime()).toBeGreaterThan(0);
    });

    it('returns 404 for non-existent run', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/runs/NON-EXISTENT-RUN/step/step-1/start',
        payload: { executedBy: 'test-operator' },
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe('RUN_NOT_FOUND');
    });

    it('returns 400 for non-run record', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/runs/health/start',
        payload: { executedBy: 'test-operator' },
      });
      // 'health' is not a record, so 404
      expect(res.statusCode).toBe(404);
    });
  });

  // ========================================================================
  // POST /api/runs/:runId/step/:stepId/complete
  // ========================================================================

  describe('POST /api/runs/:runId/step/:stepId/complete', () => {
    it('records step completion with timestamp', async () => {
      const runId = await createRun(app, 'Step complete test');

      // Start the run
      await app.inject({
        method: 'POST',
        url: `/api/runs/${runId}/start`,
        payload: { executedBy: 'test-operator' },
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/runs/${runId}/step/step-1/complete`,
        payload: {
          completedAt: '2025-01-15T11:00:00.000Z',
          executedBy: 'test-operator',
        },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.stepId).toBe('step-1');
      expect(body.completedAt).toBe('2025-01-15T11:00:00.000Z');
      expect(body.deviations).toBe(0);
    });

    it('records step completion with deviations', async () => {
      const runId = await createRun(app, 'Deviations test');

      // Start the run
      await app.inject({
        method: 'POST',
        url: `/api/runs/${runId}/start`,
        payload: { executedBy: 'test-operator' },
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/runs/${runId}/step/step-2/complete`,
        payload: {
          completedAt: '2025-01-15T12:00:00.000Z',
          executedBy: 'test-operator',
          deviations: [
            {
              deviationId: 'DEV-001',
              description: 'Temperature was 5C higher than planned',
              severity: 'warning',
              occurredAt: '2025-01-15T12:00:00.000Z',
            },
            {
              deviationId: 'DEV-002',
              description: 'Used alternate reagent',
              severity: 'info',
            },
          ],
        },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.stepId).toBe('step-2');
      expect(body.completedAt).toBe('2025-01-15T12:00:00.000Z');
      expect(body.deviations).toBe(2);
    });

    it('auto-generates timestamp when completedAt not provided', async () => {
      const runId = await createRun(app, 'Auto complete test');

      // Start the run
      await app.inject({
        method: 'POST',
        url: `/api/runs/${runId}/start`,
        payload: { executedBy: 'test-operator' },
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/runs/${runId}/step/step-3/complete`,
        payload: { executedBy: 'test-operator' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.completedAt).toBeDefined();
      expect(new Date(body.completedAt).getTime()).toBeGreaterThan(0);
    });

    it('returns 400 when run is not in progress', async () => {
      const runId = await createRun(app, 'State blocked test');

      // Start and complete the run
      await app.inject({
        method: 'POST',
        url: `/api/runs/${runId}/start`,
        payload: { executedBy: 'test-operator' },
      });
      const completeRunRes = await app.inject({
        method: 'POST',
        url: `/api/runs/${runId}/complete`,
        payload: {},
      });
      expect(completeRunRes.statusCode).toBe(200);

      // Now try to complete a step - should fail
      const res = await app.inject({
        method: 'POST',
        url: `/api/runs/${runId}/step/step-4/complete`,
        payload: { completedAt: '2025-01-15T13:00:00.000Z' },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe('INVALID_STATE_TRANSITION');
    });

    it('returns 404 for non-existent run', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/runs/NON-EXISTENT-RUN/step/step-1/complete',
        payload: { completedAt: '2025-01-15T13:00:00.000Z' },
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe('RUN_NOT_FOUND');
    });
  });

  // ========================================================================
  // PATCH /api/runs/:runId/event/:eventId/timestamp
  // ========================================================================

  describe('PATCH /api/runs/:runId/event/:eventId/timestamp', () => {
    let runId: string;

    beforeEach(async () => {
      runId = await createRun(app, 'Event timestamp test');

      // Start the run
      const startRes = await app.inject({
        method: 'POST',
        url: `/api/runs/${runId}/start`,
        payload: { executedBy: 'test-operator' },
      });
      if (startRes.statusCode !== 200) {
        console.error('Start run error for event tests:', JSON.parse(startRes.payload));
      }
      expect(startRes.statusCode).toBe(200);
    });

    it('updates event startedAt timestamp', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/runs/${runId}/event/evt-1/timestamp`,
        payload: {
          startedAt: '2025-01-15T14:00:00.000Z',
        },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.eventId).toBe('evt-1');
      expect(body.startedAt).toBe('2025-01-15T14:00:00.000Z');
    });

    it('updates event completedAt timestamp', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/runs/${runId}/event/evt-1/timestamp`,
        payload: {
          completedAt: '2025-01-15T15:00:00.000Z',
        },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.eventId).toBe('evt-1');
      expect(body.completedAt).toBe('2025-01-15T15:00:00.000Z');
    });

    it('updates both startedAt and completedAt in one call', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/runs/${runId}/event/evt-2/timestamp`,
        payload: {
          startedAt: '2025-01-15T16:00:00.000Z',
          completedAt: '2025-01-15T17:00:00.000Z',
        },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.eventId).toBe('evt-2');
      expect(body.startedAt).toBe('2025-01-15T16:00:00.000Z');
      expect(body.completedAt).toBe('2025-01-15T17:00:00.000Z');
    });

    it('returns 400 when no timestamps provided', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/runs/${runId}/event/evt-1/timestamp`,
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe('MISSING_FIELD');
    });

    it('returns 400 when run is not in progress', async () => {
      // Complete the run first
      const completeRunRes = await app.inject({
        method: 'POST',
        url: `/api/runs/${runId}/complete`,
        payload: {},
      });
      expect(completeRunRes.statusCode).toBe(200);

      // Now try to update timestamp - should fail
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/runs/${runId}/event/evt-1/timestamp`,
        payload: { startedAt: '2025-01-15T18:00:00.000Z' },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe('INVALID_STATE_TRANSITION');
    });

    it('returns 404 for non-existent run', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/runs/NON-EXISTENT-RUN/event/evt-1/timestamp',
        payload: { startedAt: '2025-01-15T18:00:00.000Z' },
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe('RUN_NOT_FOUND');
    });
  });
});
