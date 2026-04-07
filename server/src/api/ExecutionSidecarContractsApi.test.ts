import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { createServer, initializeApp } from '../server.js';
import type { AppContext } from '../server.js';

const schemaFiles: Array<{ name: string; content: string }> = [
  {
    name: 'integra-assist-submit-request.schema.yaml',
    content: `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/sidecar/integra-assist-submit-request.schema.yaml"
type: object
required: [robotPlanId, targetPlatform, artifactUri, vialabXml, parameters]
properties:
  robotPlanId: { type: string }
  targetPlatform: { const: integra_assist }
  artifactUri: { type: string }
  vialabXml: { type: string }
  parameters: { type: object }
additionalProperties: false
`,
  },
  {
    name: 'integra-assist-submit-response.schema.yaml',
    content: `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/sidecar/integra-assist-submit-response.schema.yaml"
type: object
required: [contractVersion, adapterId, operation, result]
properties:
  contractVersion: { const: labos-bridge/v1 }
  adapterId: { const: integra_assist }
  operation: { const: submit }
  result:
    type: object
    required: [runId, status]
    properties:
      runId: { type: string }
      status: { type: string }
`,
  },
  {
    name: 'integra-assist-status-response.schema.yaml',
    content: `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/sidecar/integra-assist-status-response.schema.yaml"
type: object
required: [contractVersion, adapterId, operation, result]
properties:
  contractVersion: { const: labos-bridge/v1 }
  adapterId: { const: integra_assist }
  operation: { const: status }
  result:
    type: object
    required: [runId, status]
    properties:
      runId: { type: string }
      status: { type: string }
`,
  },
  {
    name: 'integra-assist-cancel-request.schema.yaml',
    content: `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/sidecar/integra-assist-cancel-request.schema.yaml"
type: object
required: [actionType]
properties:
  actionType: { const: stop }
additionalProperties: false
`,
  },
  {
    name: 'integra-assist-cancel-response.schema.yaml',
    content: `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/sidecar/integra-assist-cancel-response.schema.yaml"
type: object
required: [contractVersion, adapterId, operation, result]
properties:
  contractVersion: { const: labos-bridge/v1 }
  adapterId: { const: integra_assist }
  operation: { const: cancel }
  result:
    type: object
    required: [runId, status]
    properties:
      runId: { type: string }
      status: { type: string }
`,
  },
  {
    name: 'gemini-active-read-request.schema.yaml',
    content: `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/sidecar/gemini-active-read-request.schema.yaml"
type: object
required: [adapterId, parameters]
properties:
  adapterId: { const: molecular_devices_gemini }
  outputPath: { type: string }
  parameters: { type: object }
additionalProperties: false
`,
  },
  {
    name: 'gemini-active-read-response.schema.yaml',
    content: `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/sidecar/gemini-active-read-response.schema.yaml"
type: object
required: [contractVersion, adapterId, operation, result]
properties:
  contractVersion: { const: labos-bridge/v1 }
  adapterId: { const: molecular_devices_gemini }
  operation: { const: active_read }
  result:
    type: object
    required: [rawDataPath]
    properties:
      rawDataPath: { type: string }
      parserId: { type: string }
      status: { type: string }
`,
  },
];

describe('Execution Sidecar Contracts API', () => {
  const testDir = resolve(process.cwd(), 'tmp/execution-sidecar-contracts-api-test');
  let ctx: AppContext;
  let app: FastifyInstance;

  beforeAll(async () => {
    await mkdir(resolve(testDir, 'schema/sidecar'), { recursive: true });
    await mkdir(resolve(testDir, 'records'), { recursive: true });
    for (const file of schemaFiles) {
      await writeFile(resolve(testDir, `schema/sidecar/${file.name}`), file.content);
    }
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

  it('serves manifest, self-test, and payload validation', async () => {
    const manifest = await app.inject({
      method: 'GET',
      url: '/api/execution/sidecar/contracts',
    });
    expect(manifest.statusCode).toBe(200);
    const manifestBody = JSON.parse(manifest.payload) as { total: number; contractVersion: string };
    expect(manifestBody.total).toBe(7);
    expect(manifestBody.contractVersion).toBe('labos-bridge/v1');

    const diagnostics = await app.inject({
      method: 'GET',
      url: '/api/execution/sidecar/contracts/diagnostics',
    });
    expect(diagnostics.statusCode).toBe(200);
    const diagnosticsBody = JSON.parse(diagnostics.payload) as { totalContracts: number; loadedContracts: number; missingContracts: number };
    expect(diagnosticsBody.totalContracts).toBe(7);
    expect(diagnosticsBody.loadedContracts).toBe(7);
    expect(diagnosticsBody.missingContracts).toBe(0);

    const examples = await app.inject({
      method: 'GET',
      url: '/api/execution/sidecar/contracts/examples',
    });
    expect(examples.statusCode).toBe(200);
    const examplesBody = JSON.parse(examples.payload) as { total: number; contracts: Array<{ sample: unknown }> };
    expect(examplesBody.total).toBe(7);
    expect(examplesBody.contracts[0]).toHaveProperty('sample');

    const selfTest = await app.inject({
      method: 'POST',
      url: '/api/execution/sidecar/contracts/self-test',
      payload: {},
    });
    expect(selfTest.statusCode).toBe(200);
    const selfTestBody = JSON.parse(selfTest.payload) as { ok: boolean; failedChecks: number };
    expect(selfTestBody.ok).toBe(true);
    expect(selfTestBody.failedChecks).toBe(0);

    const persisted = await app.inject({
      method: 'POST',
      url: '/api/execution/sidecar/contracts/self-test/persist',
      payload: { profile: 'api-test', notes: 'persist from api test' },
    });
    expect(persisted.statusCode).toBe(200);
    const persistedBody = JSON.parse(persisted.payload) as { ok: boolean; reportId: string };
    expect(persistedBody.ok).toBe(true);
    expect(persistedBody.reportId).toBe('SCR-000001');

    const valid = await app.inject({
      method: 'POST',
      url: '/api/execution/sidecar/contracts/validate',
      payload: {
        contractId: 'molecular_devices_gemini.active_read.response',
        payload: {
          contractVersion: 'labos-bridge/v1',
          adapterId: 'molecular_devices_gemini',
          operation: 'active_read',
          result: {
            rawDataPath: 'records/inbox/gemini.csv',
          },
        },
      },
    });
    expect(valid.statusCode).toBe(200);
    expect(JSON.parse(valid.payload).valid).toBe(true);

    const invalid = await app.inject({
      method: 'POST',
      url: '/api/execution/sidecar/contracts/validate',
      payload: {
        contractId: 'molecular_devices_gemini.active_read.response',
        payload: {
          adapterId: 'molecular_devices_gemini',
        },
      },
    });
    expect(invalid.statusCode).toBe(400);
    expect(JSON.parse(invalid.payload).valid).toBe(false);

    const batch = await app.inject({
      method: 'POST',
      url: '/api/execution/sidecar/contracts/validate-batch',
      payload: {
        items: [
          {
            contractId: 'integra_assist.cancel.request',
            payload: { actionType: 'stop' },
          },
          {
            contractId: 'integra_assist.cancel.request',
            payload: { actionType: 'noop' },
          },
        ],
      },
    });
    expect(batch.statusCode).toBe(400);
    const batchBody = JSON.parse(batch.payload) as { total: number; passed: number; failed: number };
    expect(batchBody.total).toBe(2);
    expect(batchBody.passed).toBe(1);
    expect(batchBody.failed).toBe(1);

    const gate = await app.inject({
      method: 'POST',
      url: '/api/execution/sidecar/contracts/gate',
      payload: {
        requireStrict: true,
        requireAllSchemasLoaded: true,
        requireSelfTestPass: true,
      },
    });
    expect(gate.statusCode).toBe(200);
    const gateBody = JSON.parse(gate.payload) as { ready: boolean; checks: Array<{ passed: boolean }> };
    expect(gateBody.ready).toBe(true);
    expect(gateBody.checks.every((c) => c.passed)).toBe(true);
  });
});
