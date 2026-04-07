import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { initializeApp, createServer } from '../server.js';
import type { AppContext } from '../server.js';

const protocolSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/protocol.schema.yaml"
type: object
required: [kind, recordId, title, steps]
properties:
  kind: { const: "protocol" }
  recordId: { type: string }
  title: { type: string }
  steps:
    type: array
    items:
      type: object
      required: [stepId, kind]
      properties:
        stepId: { type: string }
        kind: { type: string }
`;

const plannedRunSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml"
type: object
required: [kind, recordId, title, sourceType, sourceRef, state]
properties:
  kind: { const: "planned-run" }
  recordId: { type: string }
  title: { type: string }
  sourceType:
    type: string
    enum: [protocol, event-graph]
  sourceRef:
    type: object
    required: [kind, id]
    properties:
      kind: { type: string }
      id: { type: string }
      type: { type: string }
  protocolRef:
    type: object
  state:
    type: string
    enum: [draft, ready, executing, completed, failed]
  bindings:
    type: object
`;

const robotPlanSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/robot-plan.schema.yaml"
type: object
required: [kind, id, plannedRunRef, targetPlatform, status]
properties:
  kind: { const: "robot-plan" }
  id: { type: string }
  plannedRunRef: { type: object }
  targetPlatform:
    type: string
    enum: [opentrons_ot2, opentrons_flex, integra_assist]
  status:
    type: string
    enum: [compiled, validated, error]
  generatedAt: { type: string }
  generatorVersion: { type: string }
  deckSlots:
    type: array
    items: { type: object }
  pipettes:
    type: array
    items: { type: object }
  executionSteps:
    type: array
    items: { type: object }
  artifacts:
    type: array
    items:
      type: object
      required: [role, fileRef]
      properties:
        role: { type: string }
        fileRef:
          type: object
          required: [uri]
          properties:
            uri: { type: string }
            mimeType: { type: string }
            label: { type: string }
`;

const instrumentLogSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/instrument-log.schema.yaml"
type: object
required: [kind, id, logType, status]
properties:
  kind: { const: "instrument-log" }
  id: { type: string }
  logType:
    type: string
    enum: [robot_telemetry, instrument_readout, error_log, operator_notes]
  status:
    type: string
    enum: [completed, aborted, error]
  startedAt: { type: string }
  completedAt: { type: string }
  entries:
    type: array
    items: { type: object }
  artifacts:
    type: array
    items: { type: object }
`;

const executionRunSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/execution-run.schema.yaml"
type: object
required: [kind, recordId, robotPlanRef, status, mode, startedAt]
properties:
  kind: { const: "execution-run" }
  recordId: { type: string }
  robotPlanRef: { type: object }
  plannedRunRef: { type: object }
  status:
    type: string
    enum: [running, completed, failed, canceled]
  mode: { type: string }
  startedAt: { type: string }
  completedAt: { type: string }
  failureClass:
    type: string
    enum: [transient, terminal, unknown]
  retryRecommended: { type: boolean }
  retryReason: { type: string }
`;

describe('Execution Orchestration API', () => {
  let app: FastifyInstance;
  let ctx: AppContext;
  const testDir = resolve(process.cwd(), 'tmp/execution-orchestration-api-test');

  beforeAll(async () => {
    await mkdir(resolve(testDir, 'schema'), { recursive: true });
    await mkdir(resolve(testDir, 'records'), { recursive: true });
    await writeFile(resolve(testDir, 'schema/protocol.schema.yaml'), protocolSchema);
    await writeFile(resolve(testDir, 'schema/planned-run.schema.yaml'), plannedRunSchema);
    await writeFile(resolve(testDir, 'schema/robot-plan.schema.yaml'), robotPlanSchema);
    await writeFile(resolve(testDir, 'schema/instrument-log.schema.yaml'), instrumentLogSchema);
    await writeFile(resolve(testDir, 'schema/execution-run.schema.yaml'), executionRunSchema);

    ctx = await initializeApp(testDir, {
      schemaDir: 'schema',
      recordsDir: 'records',
      logLevel: 'silent',
    });
    await ctx.store.create({
      envelope: {
        recordId: 'PRO-000001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml',
        payload: {
          kind: 'protocol',
          recordId: 'PRO-000001',
          title: 'Assist Plus Transfer',
          steps: [{ stepId: 's1', kind: 'transfer' }],
        },
      },
      message: 'seed protocol',
      skipLint: true,
    });
    await ctx.store.create({
      envelope: {
        recordId: 'PLR-000001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml',
        payload: {
          kind: 'planned-run',
          recordId: 'PLR-000001',
          title: 'orchestrate',
          sourceType: 'protocol',
          sourceRef: { kind: 'record', id: 'PRO-000001', type: 'protocol' },
          protocolRef: { kind: 'record', id: 'PRO-000001', type: 'protocol' },
          state: 'ready',
          bindings: {},
        },
      },
      message: 'seed planned run',
      skipLint: true,
    });

    app = await createServer(ctx, {
      logLevel: 'silent',
    });
    await app.ready();
    process.env['LABOS_SIMULATE_ASSIST_PLUS'] = '1';
  });

  afterAll(async () => {
    delete process.env['LABOS_SIMULATE_ASSIST_PLUS'];
    await app.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it('orchestrates compile->validate->execute with simulator mode', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/execution/orchestrate',
      payload: {
        plannedRunId: 'PLR-000001',
        targetPlatform: 'integra_assist',
        parameters: {
          simulate: true,
          vialLayout: '3x5',
        },
      },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.plannedRunId).toBe('PLR-000001');
    expect(body.robotPlanId).toBe('RP-000001');
    expect(body.executionRunId).toBe('EXR-000001');
    expect(body.logId).toBe('ILOG-000001');
    expect(body.status).toBe('completed');
    expect(body.normalizedParameters.simulate).toBe(true);
  });

  it('supports dry-run orchestration without execution', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/execution/orchestrate',
      payload: {
        plannedRunId: 'PLR-000001',
        targetPlatform: 'integra_assist',
        dryRun: true,
        parameters: {
          simulate: true,
          mixCycles: 4,
        },
      },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.dryRun).toBe(true);
    expect(body.executionRunId).toBeUndefined();
    expect(body.normalizedParameters.mixCycles).toBe(4);
  });
});

