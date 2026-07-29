import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { createServer, initializeApp } from '../../src/server.js';
import type { AppContext } from '../../src/server.js';
import { computeDiff, computeEventDiff, type GraphEvent } from '../../src/utils/eventGraphDiff.js';

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
  const recordId = `TS-DEV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
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

/**
 * Create an event graph record. Returns the recordId.
 */
async function createEventGraph(
  app: FastifyInstance,
  recordId: string,
  events: GraphEvent[],
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    payload: {
      schemaId: 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml',
      payload: {
        kind: 'event-graph',
        recordId,
        id: recordId,
        name: recordId,
        events,
        labwares: [],
      },
    },
  });
  if (res.statusCode !== 201) {
    throw new Error(`Failed to create event graph: ${res.statusCode} - ${res.payload}`);
  }
  return recordId;
}

describe('Deviation Tracking API', () => {
  const testDir = resolve(process.cwd(), 'tmp/deviation-api-test');
  let ctx: AppContext;
  let app: FastifyInstance;

  beforeAll(async () => {
    await mkdir(resolve(testDir, 'schema'), { recursive: true });
    await mkdir(resolve(testDir, 'schema/lab'), { recursive: true });
    await mkdir(resolve(testDir, 'records'), { recursive: true });

    // Required material profile registry
    await writeFile(resolve(testDir, 'schema/lab/material-profile.registry.yaml'), MATERIAL_PROFILE_REGISTRY);

    // Minimal standalone run schema for tests
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
  deviationHistory:
    type: array
    items:
      type: object
`;
    await writeFile(resolve(testDir, 'schema/run.schema.yaml'), runSchema);

    // Minimal event-graph schema for diff tests
    const eventGraphSchema = `
$schema: https://json-schema.org/draft/2020-12/schema
$id: https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml
title: Event Graph
type: object
unevaluatedProperties: false
required:
  - id
  - events
  - labwares
properties:
  kind:
    type: string
    const: event-graph
  recordId:
    type: string
  id:
    type: string
  name:
    type: string
  description:
    type: string
  runId:
    type: string
  events:
    type: array
    items:
      type: object
  labwares:
    type: array
    items:
      type: object
  implementsRef:
    type: string
  executionMeta:
    type: object
  createdAt:
    type: string
    format: date-time
  updatedAt:
    type: string
    format: date-time
`;
    await writeFile(resolve(testDir, 'schema/event-graph.schema.yaml'), eventGraphSchema);

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
  // POST /api/runs/:runId/deviations
  // ========================================================================

  describe('POST /api/runs/:runId/deviations', () => {
    it('stores a deviation record on a planned run', async () => {
      const runId = await createRun(app, 'Deviation test');

      const res = await app.inject({
        method: 'POST',
        url: `/api/runs/${runId}/deviations`,
        payload: {
          deviationId: 'DEV-001',
          description: 'Temperature was 5C higher than planned',
          severity: 'warning',
          code: 'TEMP_HIGH',
          reportedBy: 'test-operator',
        },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.deviation.deviationId).toBe('DEV-001');
      expect(body.deviation.description).toBe('Temperature was 5C higher than planned');
      expect(body.deviation.severity).toBe('warning');
      expect(body.deviation.resolved).toBe(false);
      expect(body.deviation.recordedAt).toBeDefined();
    });

    it('stores a deviation record on an in-progress run', async () => {
      const runId = await createRun(app, 'In-progress deviation test');

      // Start the run
      const startRes = await app.inject({
        method: 'POST',
        url: `/api/runs/${runId}/start`,
        payload: { executedBy: 'test-operator' },
      });
      expect(startRes.statusCode).toBe(200);

      const res = await app.inject({
        method: 'POST',
        url: `/api/runs/${runId}/deviations`,
        payload: {
          deviationId: 'DEV-002',
          description: 'Used alternate reagent',
          severity: 'info',
        },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.deviation.deviationId).toBe('DEV-002');
    });

    it('rejects deviation on completed run', async () => {
      const runId = await createRun(app, 'Completed deviation test');

      // Start and complete
      await app.inject({
        method: 'POST',
        url: `/api/runs/${runId}/start`,
        payload: { executedBy: 'test-operator' },
      });
      const completeRes = await app.inject({
        method: 'POST',
        url: `/api/runs/${runId}/complete`,
        payload: {},
      });
      expect(completeRes.statusCode).toBe(200);

      // Now try to add deviation - should fail
      const res = await app.inject({
        method: 'POST',
        url: `/api/runs/${runId}/deviations`,
        payload: {
          deviationId: 'DEV-003',
          description: 'Should fail',
          severity: 'info',
        },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe('INVALID_STATE_TRANSITION');
    });

    it('returns 400 when deviationId is missing', async () => {
      const runId = await createRun(app, 'Missing field test');

      const res = await app.inject({
        method: 'POST',
        url: `/api/runs/${runId}/deviations`,
        payload: {
          description: 'No ID',
          severity: 'info',
        },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe('MISSING_FIELD');
    });

    it('returns 400 when description is missing', async () => {
      const runId = await createRun(app, 'Missing description test');

      const res = await app.inject({
        method: 'POST',
        url: `/api/runs/${runId}/deviations`,
        payload: {
          deviationId: 'DEV-004',
          severity: 'info',
        },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe('MISSING_FIELD');
    });

    it('returns 404 for non-existent run', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/runs/NON-EXISTENT-RUN/deviations',
        payload: {
          deviationId: 'DEV-005',
          description: 'Test',
          severity: 'info',
        },
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe('RUN_NOT_FOUND');
    });
  });

  // ========================================================================
  // GET /api/runs/:runId/deviations
  // ========================================================================

  describe('GET /api/runs/:runId/deviations', () => {
    let runId: string;

    beforeEach(async () => {
      runId = await createRun(app, 'Deviation retrieval test');

      // Add several deviations
      await app.inject({
        method: 'POST',
        url: `/api/runs/${runId}/deviations`,
        payload: {
          deviationId: 'DEV-A',
          description: 'First deviation',
          severity: 'warning',
        },
      });
      await app.inject({
        method: 'POST',
        url: `/api/runs/${runId}/deviations`,
        payload: {
          deviationId: 'DEV-B',
          description: 'Second deviation',
          severity: 'info',
        },
      });
      await app.inject({
        method: 'POST',
        url: `/api/runs/${runId}/deviations`,
        payload: {
          deviationId: 'DEV-C',
          description: 'Third deviation',
          severity: 'error',
        },
      });
    });

    it('retrieves all deviations for a run', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/runs/${runId}/deviations`,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.deviations).toHaveLength(3);
      expect(body.total).toBe(3);
      expect(body.filtered).toBe(3);
    });

    it('filters deviations by severity', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/runs/${runId}/deviations?severity=warning`,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.filtered).toBe(1);
      expect(body.deviations[0].severity).toBe('warning');
    });

    it('returns empty array when no deviations', async () => {
      const emptyRunId = await createRun(app, 'Empty deviations test');

      const res = await app.inject({
        method: 'GET',
        url: `/api/runs/${emptyRunId}/deviations`,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.deviations).toHaveLength(0);
      expect(body.total).toBe(0);
    });

    it('returns 404 for non-existent run', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/runs/NON-EXISTENT-RUN/deviations',
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe('RUN_NOT_FOUND');
    });
  });

  // ========================================================================
  // PATCH /api/runs/:runId/deviations/:deviationId
  // ========================================================================

  describe('PATCH /api/runs/:runId/deviations/:deviationId', () => {
    let runId: string;

    beforeEach(async () => {
      runId = await createRun(app, 'Deviation update test');

      await app.inject({
        method: 'POST',
        url: `/api/runs/${runId}/deviations`,
        payload: {
          deviationId: 'DEV-UPD-001',
          description: 'Original description',
          severity: 'warning',
        },
      });
    });

    it('marks a deviation as resolved', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/runs/${runId}/deviations/DEV-UPD-001`,
        payload: {
          resolved: true,
          resolutionNotes: 'Operator confirmed correct procedure',
        },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.deviation.resolved).toBe(true);
      expect(body.deviation.resolutionNotes).toBe('Operator confirmed correct procedure');
    });

    it('updates deviation description', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/runs/${runId}/deviations/DEV-UPD-001`,
        payload: {
          description: 'Updated description',
        },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.deviation.description).toBe('Updated description');
    });

    it('returns 404 for non-existent deviation', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/runs/${runId}/deviations/NON-EXISTENT`,
        payload: { resolved: true },
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe('DEVIATION_NOT_FOUND');
    });
  });

  // ========================================================================
  // GET /api/runs/:runId/deviations/diff
  // ========================================================================

  describe('GET /api/runs/:runId/deviations/diff', () => {
    it('computes diff between planned and executed event graphs', async () => {
      const runId = await createRun(app, 'Diff test run');

      // Create planned and executed event graphs
      const plannedEvents: GraphEvent[] = [
        { id: 'evt-1', type: 'incubate', label: 'Incubate step', duration: 600 },
        { id: 'evt-2', type: 'transfer', label: 'Transfer step', volume: 100 },
        { id: 'evt-3', type: 'read', label: 'Read step' },
      ];
      const executedEvents: GraphEvent[] = [
        { id: 'evt-1', type: 'incubate', label: 'Incubate step', duration: 300 }, // modified
        { id: 'evt-2', type: 'transfer', label: 'Transfer step', volume: 100 },   // unchanged
        { id: 'evt-4', type: 'mix', label: 'Mix step' },                          // added
        // evt-3 is removed
      ];

      const plannedId = `EVG-planned-${runId}`;
      const executedId = `EVG-executed-${runId}`;

      await createEventGraph(app, plannedId, plannedEvents);
      await createEventGraph(app, executedId, executedEvents);

      // Update run to reference the event graphs
      const record = await ctx.store.get(runId);
      if (record) {
        const updatedPayload = Object.assign(
          {},
          record.payload,
          { plannedEventGraphId: plannedId, executedEventGraphId: executedId },
        );
        await ctx.store.update({
          envelope: {
            ...record,
            payload: updatedPayload,
          },
          message: 'Set event graph IDs for diff test',
        });
      }

      const res = await app.inject({
        method: 'GET',
        url: `/api/runs/${runId}/deviations/diff`,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.diffs).toBeDefined();
      expect(Array.isArray(body.diffs)).toBe(true);

      // Find the modified event
      const modified = body.diffs.find((d: any) => d.eventId === 'evt-1');
      expect(modified).toBeDefined();
      expect(modified.status).toBe('modified');
      expect(modified.changes.length).toBeGreaterThan(0);
      expect(modified.changes.find((c: any) => c.field === 'duration')).toBeDefined();

      // Find the removed event
      const removed = body.diffs.find((d: any) => d.eventId === 'evt-3');
      expect(removed).toBeDefined();
      expect(removed.status).toBe('removed');

      // Find the added event
      const added = body.diffs.find((d: any) => d.eventId === 'evt-4');
      expect(added).toBeDefined();
      expect(added.status).toBe('added');

      // evt-2 should not appear (unchanged)
      const unchanged = body.diffs.find((d: any) => d.eventId === 'evt-2');
      expect(unchanged).toBeUndefined();
    });

    it('returns 400 when run has no plannedEventGraphId', async () => {
      const runId = await createRun(app, 'No planned graph test');

      const res = await app.inject({
        method: 'GET',
        url: `/api/runs/${runId}/deviations/diff`,
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe('MISSING_FIELD');
    });

    it('returns 404 for non-existent run', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/runs/NON-EXISTENT-RUN/deviations/diff',
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe('RUN_NOT_FOUND');
    });
  });

  // ========================================================================
  // computeDiff utility (unit tests)
  // ========================================================================

  describe('computeDiff utility', () => {
    it('returns empty diff for identical graphs', () => {
      const events: GraphEvent[] = [
        { id: 'evt-1', type: 'incubate', label: 'Incubate' },
        { id: 'evt-2', type: 'read', label: 'Read' },
      ];
      const diffs = computeDiff({ events }, { events: [...events] });
      expect(diffs).toHaveLength(0);
    });

    it('detects added events', () => {
      const diffs = computeEventDiff(
        [{ id: 'evt-1', type: 'incubate' }],
        [{ id: 'evt-1', type: 'incubate' }, { id: 'evt-2', type: 'read' }],
      );
      expect(diffs).toHaveLength(1);
      expect(diffs[0].status).toBe('added');
      expect(diffs[0].eventId).toBe('evt-2');
    });

    it('detects removed events', () => {
      const diffs = computeEventDiff(
        [{ id: 'evt-1', type: 'incubate' }, { id: 'evt-2', type: 'read' }],
        [{ id: 'evt-1', type: 'incubate' }],
      );
      expect(diffs).toHaveLength(1);
      expect(diffs[0].status).toBe('removed');
      expect(diffs[0].eventId).toBe('evt-2');
    });

    it('detects modified events with field-level changes', () => {
      const diffs = computeEventDiff(
        [{ id: 'evt-1', type: 'incubate', duration: 600, label: 'Incubate' }],
        [{ id: 'evt-1', type: 'incubate', duration: 300, label: 'Incubate' }],
      );
      expect(diffs).toHaveLength(1);
      expect(diffs[0].status).toBe('modified');
      expect(diffs[0].changes).toHaveLength(1);
      expect(diffs[0].changes[0].field).toBe('duration');
      expect(diffs[0].changes[0].planned).toBe(600);
      expect(diffs[0].changes[0].executed).toBe(300);
    });

    it('handles null inputs', () => {
      const diffs = computeDiff(null, null);
      expect(diffs).toHaveLength(0);

      const diffs2 = computeDiff({ events: [] }, { events: [] });
      expect(diffs2).toHaveLength(0);
    });

    it('handles one-sided empty graphs', () => {
      const plannedEvents: GraphEvent[] = [{ id: 'evt-1', type: 'incubate' }];
      const diffs = computeDiff({ events: plannedEvents }, null);
      expect(diffs).toHaveLength(1);
      expect(diffs[0].status).toBe('removed');

      const diffs2 = computeDiff(null, { events: plannedEvents });
      expect(diffs2).toHaveLength(1);
      expect(diffs2[0].status).toBe('added');
    });
  });
});
