import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
const PROTOCOL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml';

async function createRun(app: FastifyInstance, title: string): Promise<string> {
  const recordId = `RS-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    payload: {
      schemaId: RUN_SCHEMA_ID,
      payload: { kind: 'run', recordId, title, status: 'planned' },
    },
  });
  if (res.statusCode !== 201) {
    throw new Error(`Failed to create run: ${res.statusCode} - ${res.payload}`);
  }
  return recordId;
}

async function createProtocol(app: FastifyInstance, steps: Array<Record<string, unknown>>): Promise<string> {
  const recordId = `PS-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    payload: {
      schemaId: PROTOCOL_SCHEMA_ID,
      payload: { kind: 'protocol', recordId, title: 'Test Protocol', steps },
    },
  });
  if (res.statusCode !== 201) {
    throw new Error(`Failed to create protocol: ${res.statusCode} - ${res.payload}`);
  }
  return recordId;
}

describe('Settings API', () => {
  const testDir = resolve(process.cwd(), 'tmp/settings-api-test');
  let ctx: AppContext;
  let app: FastifyInstance;

  beforeAll(async () => {
    await mkdir(resolve(testDir, 'schema/workflow'), { recursive: true });
    await mkdir(resolve(testDir, 'schema/lab'), { recursive: true });
    await mkdir(resolve(testDir, 'records'), { recursive: true });
    await writeFile(resolve(testDir, 'schema/lab/material-profile.registry.yaml'), MATERIAL_PROFILE_REGISTRY);

    const runSchema = `$schema: https://json-schema.org/draft/2020-12/schema
$id: https://computable-lab.com/schema/computable-lab/run.schema.yaml
title: Run
type: object
unevaluatedProperties: false
required: [kind, recordId, status]
properties:
  kind: { const: run }
  recordId: { type: string }
  title: { type: string }
  status: { type: string, enum: [planned, in_progress, completed, aborted, failed, superseded] }
  startedAt: { type: string, format: date-time }
  endedAt: { type: string, format: date-time }
  createdAt: { type: string }
  updatedAt: { type: string }
  createdBy: { type: string }
  executedBy: { type: string }
  executionTracking: { type: object }
  executionSettings: { type: object }
  plannedEventGraphId: { type: string }
  executedEventGraphId: { type: string }`;
    await writeFile(resolve(testDir, 'schema/run.schema.yaml'), runSchema);

    const protocolSchema = `$schema: https://json-schema.org/draft/2020-12/schema
$id: https://computable-lab.com/schema/computable-lab/protocol.schema.yaml
title: Protocol
type: object
unevaluatedProperties: false
required: [kind, recordId, steps]
properties:
  kind: { const: protocol }
  recordId: { type: string }
  title: { type: string }
  steps: { type: array, items: { type: object } }
  createdAt: { type: string }
  updatedAt: { type: string }
  createdBy: { type: string }`;
    await writeFile(resolve(testDir, 'schema/workflow/protocol.schema.yaml'), protocolSchema);

    ctx = await initializeApp(testDir, { schemaDir: 'schema', recordsDir: 'records', logLevel: 'silent' });
    app = await createServer(ctx, { logLevel: 'silent' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await rm(testDir, { recursive: true, force: true });
  });

  // ========================================================================
  // GET /api/protocols/:protocolId/steps/:stepId/settings
  // ========================================================================
  describe('GET /api/protocols/:protocolId/steps/:stepId/settings', () => {
    let protocolId: string;

    beforeAll(async () => {
      protocolId = await createProtocol(app, [
        { stepId: 'step-1', label: 'Incubate', ordinal: 1, kind: 'incubate', settings: [
          { settingId: 'temperature', label: 'Temperature', type: 'temperature', unit: 'C', defaultValue: 37 },
          { settingId: 'duration', label: 'Duration', type: 'duration', unit: 'min', defaultValue: 60 },
        ]},
        { stepId: 'step-2', label: 'Mix', ordinal: 2, kind: 'mix' },
      ]);
    });

    it('returns settings for a step that has them', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/protocols/${protocolId}/steps/step-1/settings` });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.settings.length).toBe(2);
      expect(body.settings[0].settingId).toBe('temperature');
      expect(body.settings[0].defaultValue).toBe(37);
      expect(body.settings[1].settingId).toBe('duration');
    });

    it('returns empty array for a step without settings', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/protocols/${protocolId}/steps/step-2/settings` });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.settings).toEqual([]);
    });

    it('returns 404 for non-existent protocol', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/protocols/NON-EXISTENT/steps/step-1/settings' });
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.payload).error).toBe('PROTOCOL_NOT_FOUND');
    });

    it('returns 404 for non-existent step', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/protocols/${protocolId}/steps/FAKE/settings` });
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.payload).error).toBe('STEP_NOT_FOUND');
    });

    it('returns 400 when record is not a protocol', async () => {
      const runId = await createRun(app, 'Not a protocol');
      const res = await app.inject({ method: 'GET', url: `/api/protocols/${runId}/steps/step-1/settings` });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).error).toBe('NOT_A_PROTOCOL');
    });
  });

  // ========================================================================
  // POST /api/runs/:runId/settings
  // ========================================================================
  describe('POST /api/runs/:runId/settings', () => {
    it('saves a setting value for a step in a run', async () => {
      const runId = await createRun(app, 'Save setting');
      const startRes = await app.inject({ method: 'POST', url: `/api/runs/${runId}/start`, payload: { executedBy: 'op' } });
      expect(startRes.statusCode).toBe(200);

      const res = await app.inject({ method: 'POST', url: `/api/runs/${runId}/settings`, payload: {
        stepId: 'step-1', settingId: 'temperature', value: 42,
      }});
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.stepId).toBe('step-1');
      expect(body.settingId).toBe('temperature');
      expect(body.value).toBe(42);
    });

    it('saves multiple settings for different steps', async () => {
      const runId = await createRun(app, 'Multiple settings');
      await app.inject({ method: 'POST', url: `/api/runs/${runId}/start`, payload: { executedBy: 'op' } });

      const res1 = await app.inject({ method: 'POST', url: `/api/runs/${runId}/settings`, payload: {
        stepId: 'step-1', settingId: 'temperature', value: 37,
      }});
      expect(res1.statusCode).toBe(200);

      const res2 = await app.inject({ method: 'POST', url: `/api/runs/${runId}/settings`, payload: {
        stepId: 'step-2', settingId: 'speed', value: 1200,
      }});
      expect(res2.statusCode).toBe(200);

      const res3 = await app.inject({ method: 'POST', url: `/api/runs/${runId}/settings`, payload: {
        stepId: 'step-1', settingId: 'duration', value: 30,
      }});
      expect(res3.statusCode).toBe(200);
      expect(JSON.parse(res3.payload).value).toBe(30);
    });

    it('overrides a previously saved setting', async () => {
      const runId = await createRun(app, 'Override setting');
      await app.inject({ method: 'POST', url: `/api/runs/${runId}/start`, payload: { executedBy: 'op' } });

      await app.inject({ method: 'POST', url: `/api/runs/${runId}/settings`, payload: {
        stepId: 'step-1', settingId: 'temperature', value: 25,
      }});

      const res = await app.inject({ method: 'POST', url: `/api/runs/${runId}/settings`, payload: {
        stepId: 'step-1', settingId: 'temperature', value: 37,
      }});
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).value).toBe(37);
    });

    it('saves string and boolean values', async () => {
      const runId = await createRun(app, 'Typed values');
      await app.inject({ method: 'POST', url: `/api/runs/${runId}/start`, payload: { executedBy: 'op' } });

      const res1 = await app.inject({ method: 'POST', url: `/api/runs/${runId}/settings`, payload: {
        stepId: 'step-1', settingId: 'sample-name', value: 'Sample A',
      }});
      expect(res1.statusCode).toBe(200);
      expect(JSON.parse(res1.payload).value).toBe('Sample A');

      const res2 = await app.inject({ method: 'POST', url: `/api/runs/${runId}/settings`, payload: {
        stepId: 'step-1', settingId: 'shaking', value: true,
      }});
      expect(res2.statusCode).toBe(200);
      expect(JSON.parse(res2.payload).value).toBe(true);
    });

    it('returns 400 when stepId is missing', async () => {
      const runId = await createRun(app, 'Missing stepId');
      await app.inject({ method: 'POST', url: `/api/runs/${runId}/start`, payload: { executedBy: 'op' } });
      const res = await app.inject({ method: 'POST', url: `/api/runs/${runId}/settings`, payload: {
        settingId: 'temp', value: 37,
      }});
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).error).toBe('MISSING_FIELD');
    });

    it('returns 400 when settingId is missing', async () => {
      const runId = await createRun(app, 'Missing settingId');
      await app.inject({ method: 'POST', url: `/api/runs/${runId}/start`, payload: { executedBy: 'op' } });
      const res = await app.inject({ method: 'POST', url: `/api/runs/${runId}/settings`, payload: {
        stepId: 'step-1', value: 37,
      }});
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).error).toBe('MISSING_FIELD');
    });

    it('returns 404 for non-existent run', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/runs/NON-EXISTENT/settings', payload: {
        stepId: 'step-1', settingId: 'temp', value: 37,
      }});
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.payload).error).toBe('RUN_NOT_FOUND');
    });

    it('returns 400 when run is not in progress', async () => {
      const runId = await createRun(app, 'Blocked state');
      const res = await app.inject({ method: 'POST', url: `/api/runs/${runId}/settings`, payload: {
        stepId: 'step-1', settingId: 'temp', value: 37,
      }});
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).error).toBe('INVALID_STATE_TRANSITION');
    });

    it('returns 400 when run is not a run record', async () => {
      const protocolId = await createProtocol(app, [{ stepId: 's1', label: 'X', ordinal: 1, kind: 'other' }]);
      const res = await app.inject({ method: 'POST', url: `/api/runs/${protocolId}/settings`, payload: {
        stepId: 'step-1', settingId: 'temp', value: 37,
      }});
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).error).toBe('NOT_A_RUN');
    });
  });
});
