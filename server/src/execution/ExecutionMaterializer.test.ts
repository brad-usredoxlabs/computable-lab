import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeApp } from '../server.js';
import type { AppContext } from '../server.js';
import { ExecutionMaterializer } from './ExecutionMaterializer.js';

const protocolSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/protocol.schema.yaml"
type: object
required: [kind, recordId, steps]
properties:
  kind: { const: "protocol" }
  recordId: { type: string }
  steps:
    type: array
    items:
      type: object
      properties:
        stepId: { type: string }
        kind: { type: string }
`;

const plannedRunSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml"
type: object
required: [kind, recordId, sourceType, sourceRef, state, title]
properties:
  kind: { const: "planned-run" }
  recordId: { type: string }
  sourceType: { type: string }
  sourceRef: { type: object }
  state: { type: string }
  title: { type: string }
`;

describe('ExecutionMaterializer', () => {
  const testDir = resolve(process.cwd(), 'tmp/execution-materializer-test');
  let ctx: AppContext;

  beforeAll(async () => {
    await mkdir(resolve(testDir, 'schema'), { recursive: true });
    await mkdir(resolve(testDir, 'records'), { recursive: true });
    await writeFile(resolve(testDir, 'schema/protocol.schema.yaml'), protocolSchema);
    await writeFile(resolve(testDir, 'schema/planned-run.schema.yaml'), plannedRunSchema);

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
          steps: [
            { stepId: 's1', kind: 'transfer' },
            { stepId: 's2', kind: 'read' },
          ],
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
          title: 'Planned',
          sourceType: 'protocol',
          sourceRef: { kind: 'record', id: 'PRO-000001', type: 'protocol' },
          state: 'completed',
        },
      },
      message: 'seed planned run',
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
          plannedRunRef: { kind: 'record', id: 'PLR-000001', type: 'planned-run' },
          status: 'completed',
          mode: 'opentrons_http',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      },
      message: 'seed execution run',
      skipValidation: true,
      skipLint: true,
    });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('materializes event graph and is idempotent', async () => {
    const materializer = new ExecutionMaterializer(ctx);
    const first = await materializer.materializeFromExecutionRun('EXR-000001');
    expect(first.eventGraphId).toBe('EVG-000001');
    const second = await materializer.materializeFromExecutionRun('EXR-000001');
    expect(second.eventGraphId).toBe('EVG-000001');
  });
});
