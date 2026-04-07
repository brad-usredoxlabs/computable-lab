import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { createServer, initializeApp } from '../server.js';
import type { AppContext } from '../server.js';

describe('Protocol Import API', () => {
  const testDir = resolve(process.cwd(), 'tmp/protocol-import-api-test');
  let app: FastifyInstance;
  let ctx: AppContext;

  beforeAll(async () => {
    await mkdir(resolve(testDir, 'schema'), { recursive: true });
    await mkdir(resolve(testDir, 'records'), { recursive: true });
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

  it('returns an editable protocol draft response for uploaded PDFs', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/protocols/import',
      payload: {
        fileName: 'vendor-protocol.pdf',
        mediaType: 'application/pdf',
        contentBase64: Buffer.from('%PDF-1.4 mock').toString('base64'),
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(body.importId).toBeTypeOf('string');
    expect(body.document).toBeTruthy();
    expect((body.document as { title?: string }).title).toBe('vendor-protocol');
  });

  it('compiles protocol material intents through the material compiler endpoint', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/protocols/materials/compile',
      payload: {
        requests: [{
          nodeId: 'material-1',
          normalizedIntent: {
            domain: 'materials',
            intentId: 'material-1',
            version: '1',
            summary: 'Resolve fenofibrate stock.',
            requiredFacts: [],
            payload: {
              intentType: 'add_material_to_well',
              rawText: '1 mM fenofibrate in DMSO',
              analyteName: 'Fenofibrate',
              solventName: 'DMSO',
              concentration: {
                value: 1,
                unit: 'mM',
                basis: 'molar',
              },
            },
          },
          policyProfiles: [{
            id: 'test-profile',
            scope: 'organization',
            scopeId: 'default-org',
            settings: {
              allowAutoCreate: 'allow',
              allowPlaceholders: 'allow',
              allowRemediation: 'allow',
            },
            materialSettings: {
              mode: 'semantic-planning',
              concentrationSemantics: 'formulation',
              clarificationBehavior: 'confirm-near-match',
              remediationBehavior: 'suggest',
            },
          }],
          persist: true,
        }],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload) as { success?: boolean; results?: Array<{ nodeId: string; result: { resolved?: { analyte?: { label?: string } }; outcome?: string } }> };
    expect(body.success).toBe(true);
    expect(body.results?.[0]?.nodeId).toBe('material-1');
    expect(body.results?.[0]?.result.resolved?.analyte?.label).toBe('Fenofibrate');
    expect(body.results?.[0]?.result.outcome).toBe('auto-resolved');
  });

  it('returns structured lab-review suggestions for timing, equipment, fallback, and authorization', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/protocols/lab-review',
      payload: {
        document: {
          title: 'Vendor Lysis Protocol',
          equipment: ['Plate shaker', 'Timer'],
          steps: [
            {
              id: 'step-1',
              title: 'Warm plates',
              instruction: 'Bring the assay plate to room temperature.',
              duration: '10 min',
            },
            {
              id: 'step-2',
              title: 'Mix lysate',
              instruction: 'Shake the plate before readout.',
              duration: '1 min',
            },
          ],
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload) as {
      success?: boolean;
      policyProfile?: { label?: string };
      steps?: Array<{ suggestions?: Array<{ kind?: string }>; diagnostics?: Array<{ code?: string }> }>;
      diagnostics?: Array<{ code?: string }>;
    };
    expect(body.success).toBe(true);
    expect(body.policyProfile?.label).toBe('TapTab Lab Review Default');
    expect(body.steps?.[0]?.suggestions?.some((suggestion) => suggestion.kind === 'timing-adjustment')).toBe(true);
    expect(body.steps?.[1]?.suggestions?.some((suggestion) => suggestion.kind === 'authorization')).toBe(true);
    expect(body.diagnostics?.some((diagnostic) => diagnostic.code === 'AUTHORIZATION_REVIEW_REQUIRED')).toBe(true);
  });
});
