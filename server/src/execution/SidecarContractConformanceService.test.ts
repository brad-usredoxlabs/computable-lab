import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeApp } from '../server.js';
import type { AppContext } from '../server.js';
import { SidecarContractConformanceService } from './SidecarContractConformanceService.js';

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

describe('SidecarContractConformanceService', () => {
  const testDir = resolve(process.cwd(), 'tmp/sidecar-contract-conformance-test');
  let ctx: AppContext;

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
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('reports contract manifest and passing self-test', async () => {
    const service = new SidecarContractConformanceService(ctx);
    const manifest = service.manifest();
    expect(manifest.total).toBe(7);
    expect(manifest.contractVersion).toBe('labos-bridge/v1');

    const result = await service.selfTest();
    expect(result.ok).toBe(true);
    expect(result.failedChecks).toBe(0);
    expect(result.totalChecks).toBeGreaterThanOrEqual(10);
  });

  it('validates arbitrary payloads by contractId', async () => {
    const service = new SidecarContractConformanceService(ctx);
    const valid = service.validatePayload('molecular_devices_gemini.active_read.response', {
      contractVersion: 'labos-bridge/v1',
      adapterId: 'molecular_devices_gemini',
      operation: 'active_read',
      result: { rawDataPath: 'records/inbox/gemini.csv' },
    });
    expect(valid.valid).toBe(true);

    const invalid = service.validatePayload('molecular_devices_gemini.active_read.response', {
      adapterId: 'molecular_devices_gemini',
      operation: 'active_read',
      result: {},
    });
    expect(invalid.valid).toBe(false);

    const unknown = service.validatePayload('unknown.contract', {});
    expect(unknown.valid).toBe(false);
    expect(unknown.error).toContain('Unknown contractId');
  });

  it('provides examples and batch validation summaries', async () => {
    const service = new SidecarContractConformanceService(ctx);
    const examples = service.examples();
    expect(examples.total).toBe(7);
    expect(examples.contracts[0]).toHaveProperty('sample');

    const filtered = service.examples({ contractId: 'integra_assist.submit.request' });
    expect(filtered.total).toBe(1);
    expect(filtered.contracts[0]?.contractId).toBe('integra_assist.submit.request');

    const batch = service.validateBatch([
      {
        contractId: 'integra_assist.cancel.request',
        payload: { actionType: 'stop' },
      },
      {
        contractId: 'integra_assist.cancel.request',
        payload: { actionType: 'noop' },
      },
    ]);
    expect(batch.total).toBe(2);
    expect(batch.passed).toBe(1);
    expect(batch.failed).toBe(1);
  });

  it('provides diagnostics, persists self-test report, and evaluates gate', async () => {
    const service = new SidecarContractConformanceService(ctx);
    const diagnostics = service.diagnostics();
    expect(diagnostics.totalContracts).toBe(7);
    expect(diagnostics.loadedContracts).toBe(7);
    expect(diagnostics.missingContracts).toBe(0);

    const persisted = await service.selfTestAndPersist({
      profile: 'ci',
      notes: 'service test',
    });
    expect(persisted.ok).toBe(true);
    expect(persisted.reportId).toBe('SCR-000001');
    const report = await ctx.store.get('SCR-000001');
    expect(report).not.toBeNull();

    const gate = await service.gate({
      requireStrict: true,
      requireAllSchemasLoaded: true,
      requireSelfTestPass: true,
    });
    expect(gate.ready).toBe(true);
  });
});
