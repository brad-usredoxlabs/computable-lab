import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { createServer, initializeApp } from '../server.js';
import type { AppContext } from '../server.js';

const executionPlanSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/execution-plan.schema.yaml"
type: object
required: [kind, recordId]
properties:
  kind: { const: "execution-plan" }
  recordId: { type: string }
`;

describe('Execution Planning API Feature Flag', () => {
  const testDir = resolve(process.cwd(), 'tmp/execution-planning-flag-api-test');
  let ctx: AppContext;
  let app: FastifyInstance;

  beforeAll(async () => {
    delete process.env['CL_FEATURE_EXECUTION_PLANNING'];
    await mkdir(resolve(testDir, 'schema'), { recursive: true });
    await mkdir(resolve(testDir, 'records'), { recursive: true });
    await writeFile(resolve(testDir, 'schema/execution-plan.schema.yaml'), executionPlanSchema);

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

  it('does not expose execution plan routes when feature flag is disabled', async () => {
    const validate = await app.inject({
      method: 'POST',
      url: '/api/execution-plans/validate',
      payload: { executionPlanId: 'EPL-000001' },
    });
    expect(validate.statusCode).toBe(404);

    const emit = await app.inject({
      method: 'POST',
      url: '/api/execution-plans/EPL-000001/emit',
      payload: { targetPlatform: 'opentrons_ot2' },
    });
    expect(emit.statusCode).toBe(404);
  });
});
