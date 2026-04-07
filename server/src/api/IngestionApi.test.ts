import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer, initializeApp } from '../server.js';
import type { AppContext } from '../server.js';

describe('Ingestion API', () => {
  let app: FastifyInstance;
  let ctx: AppContext;
  const repoRoot = resolve(process.cwd());
  const testRoot = resolve(repoRoot, 'tmp/ingestion-api-test');
  const originalConfigPath = process.env.CONFIG_PATH;

  beforeAll(async () => {
    process.env.CONFIG_PATH = resolve(testRoot, 'missing-config.yaml');
    await rm(testRoot, { recursive: true, force: true });
    await mkdir(resolve(testRoot, 'records'), { recursive: true });

    ctx = await initializeApp(repoRoot, {
      recordsDir: 'tmp/ingestion-api-test/records',
      logLevel: 'silent',
    });
    app = await createServer(ctx, { logLevel: 'silent' });
    await app.ready();
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (originalConfigPath === undefined) delete process.env.CONFIG_PATH;
    else process.env.CONFIG_PATH = originalConfigPath;
    await rm(testRoot, { recursive: true, force: true });
  }, 30000);

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates and retrieves an ingestion job with its source artifact', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/ingestion/jobs',
      payload: {
        name: 'Cayman library PDF',
        sourceKind: 'vendor_plate_map_pdf',
        adapterKind: 'vendor_plate_map_pdf',
        source: {
          fileName: 'cayman-lipid-library.pdf',
          mediaType: 'application/pdf',
          sizeBytes: 2048,
          note: 'Initial milestone A smoke test',
        },
      },
    });

    expect(createResponse.statusCode).toBe(200);
    const created = JSON.parse(createResponse.payload) as {
      job: { recordId: string; payload: { name: string; source_kind: string } };
      artifacts: Array<{ recordId: string; payload: { artifact_role: string; file_ref?: { file_name?: string } } }>;
    };

    expect(created.job.payload.name).toBe('Cayman library PDF');
    expect(created.job.payload.source_kind).toBe('vendor_plate_map_pdf');
    expect(created.artifacts).toHaveLength(1);
    expect(created.artifacts[0]?.payload.artifact_role).toBe('primary_source');
    expect(created.artifacts[0]?.payload.file_ref?.file_name).toBe('cayman-lipid-library.pdf');

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/ingestion/jobs',
    });

    expect(listResponse.statusCode).toBe(200);
    const listed = JSON.parse(listResponse.payload) as {
      items: Array<{ id: string; artifactCount: number; bundleCount: number; issueCount: number }>;
      total: number;
    };

    expect(listed.total).toBeGreaterThan(0);
    const summary = listed.items.find((item) => item.id === created.job.recordId);
    expect(summary).toBeTruthy();
    expect(summary?.artifactCount).toBe(1);
    expect(summary?.bundleCount).toBe(0);
    expect(summary?.issueCount).toBe(0);

    const getResponse = await app.inject({
      method: 'GET',
      url: `/api/ingestion/jobs/${encodeURIComponent(created.job.recordId)}`,
    });

    expect(getResponse.statusCode).toBe(200);
    const detail = JSON.parse(getResponse.payload) as {
      job: { recordId: string };
      artifacts: Array<unknown>;
      bundles: Array<unknown>;
      candidates: Array<unknown>;
      issues: Array<unknown>;
    };

    expect(detail.job.recordId).toBe(created.job.recordId);
    expect(detail.artifacts).toHaveLength(1);
    expect(detail.bundles).toHaveLength(0);
    expect(detail.candidates).toHaveLength(0);
    expect(detail.issues).toHaveLength(0);
  });

  it('adds a supporting artifact to an existing job', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/ingestion/jobs',
      payload: {
        sourceKind: 'vendor_formulation_html',
        source: {
          sourceUrl: 'https://example.com/rpmi-1640',
        },
      },
    });

    const created = JSON.parse(createResponse.payload) as {
      job: { recordId: string };
    };

    const addArtifactResponse = await app.inject({
      method: 'POST',
      url: `/api/ingestion/jobs/${encodeURIComponent(created.job.recordId)}/artifacts`,
      payload: {
        fileName: 'rpmi.html',
        mediaType: 'text/html',
        note: 'Cached vendor page snapshot',
      },
    });

    expect(addArtifactResponse.statusCode).toBe(200);

    const getResponse = await app.inject({
      method: 'GET',
      url: `/api/ingestion/jobs/${encodeURIComponent(created.job.recordId)}`,
    });
    const detail = JSON.parse(getResponse.payload) as {
      artifacts: Array<{ payload: { file_ref?: { file_name?: string } } }>;
    };

    expect(detail.artifacts).toHaveLength(2);
    expect(detail.artifacts.some((artifact) => artifact.payload.file_ref?.file_name === 'rpmi.html')).toBe(true);
  });

  it('rejects malformed ingestion job requests', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/ingestion/jobs',
      payload: {
        sourceKind: 'vendor_plate_map_pdf',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload)).toMatchObject({
      error: 'BAD_REQUEST',
    });
  });

  it('runs Cayman ingestion to review and publishes plate layouts', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes('/ols4/api/search')) {
        throw new Error(`Unexpected fetch URL in test: ${url}`);
      }
      const query = new URL(url).searchParams.get('q') ?? 'Unknown';
      return {
        ok: true,
        json: async () => ({
          response: {
            docs: [
              {
                obo_id: `CHEBI:${Math.abs(query.split('').reduce((total, char) => total + char.charCodeAt(0), 0))}`,
                label: query,
                iri: `https://example.org/chebi/${encodeURIComponent(query)}`,
                ontology_name: 'chebi',
                description: [`Ontology description for ${query}`],
                synonym: [`${query} synonym`],
              },
            ],
          },
        }),
      } as Response;
    }) as typeof fetch);

    const pdfBuffer = await readFile(resolve(repoRoot, '../tmp/flex/cayman-lipid-library.pdf'));
    const xlsxBuffer = await readFile(resolve(repoRoot, '../tmp/downloads/Cayman-Lipid-Library.xlsx'));
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/ingestion/jobs',
      payload: {
        name: 'Cayman lipid library',
        sourceKind: 'vendor_plate_map_pdf',
        ontologyPreferences: ['chebi', 'ncit'],
        source: {
          fileName: 'cayman-lipid-library.pdf',
          mediaType: 'application/pdf',
          sizeBytes: pdfBuffer.byteLength,
          contentBase64: pdfBuffer.toString('base64'),
        },
      },
    });
    expect(createResponse.statusCode).toBe(200);
    const created = JSON.parse(createResponse.payload) as { job: { recordId: string } };

    const addSpreadsheetResponse = await app.inject({
      method: 'POST',
      url: `/api/ingestion/jobs/${encodeURIComponent(created.job.recordId)}/artifacts`,
      payload: {
        fileName: 'Cayman-Lipid-Library.xlsx',
        mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: xlsxBuffer.byteLength,
        contentBase64: xlsxBuffer.toString('base64'),
        note: 'Spreadsheet enrichment source',
      },
    });
    expect(addSpreadsheetResponse.statusCode).toBe(200);

    const runResponse = await app.inject({
      method: 'POST',
      url: `/api/ingestion/jobs/${encodeURIComponent(created.job.recordId)}/run`,
      payload: {},
    });
    expect(runResponse.statusCode).toBe(200);
    const reviewed = JSON.parse(runResponse.payload) as {
      job: { payload: { status: string; stage: string } };
      bundles: Array<{ recordId: string; payload: { metrics?: Record<string, number> } }>;
      candidates: Array<{ payload: { candidate_type: string } }>;
    };
    expect(reviewed.job.payload.status).toBe('waiting_for_review');
    expect(reviewed.job.payload.stage).toBe('review');
    expect(reviewed.bundles).toHaveLength(1);
    expect(reviewed.bundles[0]?.payload.metrics?.plates_detected).toBe(13);
    expect(reviewed.candidates.filter((candidate) => candidate.payload.candidate_type === 'plate_layout')).toHaveLength(13);

    const bundleId = reviewed.bundles[0]!.recordId;
    const approveResponse = await app.inject({
      method: 'POST',
      url: `/api/ingestion/jobs/${encodeURIComponent(created.job.recordId)}/bundles/${encodeURIComponent(bundleId)}/approve`,
    });
    expect(approveResponse.statusCode).toBe(200);

    const publishResponse = await app.inject({
      method: 'POST',
      url: `/api/ingestion/jobs/${encodeURIComponent(created.job.recordId)}/bundles/${encodeURIComponent(bundleId)}/publish`,
    });
    expect(publishResponse.statusCode).toBe(200);
    const published = JSON.parse(publishResponse.payload) as {
      detail: { job: { payload: { status: string } } };
      publishResult: { createdPlateLayoutTemplateIds: string[]; createdMaterialIds: string[] };
    };
    expect(published.detail.job.payload.status).toBe('published');
    expect(published.publishResult.createdPlateLayoutTemplateIds).toHaveLength(13);
    expect(published.publishResult.createdMaterialIds.length).toBeGreaterThan(100);

    const createdMaterial = await app.inject({
      method: 'GET',
      url: `/api/records/${encodeURIComponent(published.publishResult.createdMaterialIds[0]!)}`,
    });
    expect(createdMaterial.statusCode).toBe(200);
    const materialRecord = JSON.parse(createdMaterial.payload) as {
      record: {
        payload: {
          class?: Array<{ kind: string; id: string; namespace: string }>;
          definition?: string;
          molecular_weight?: { value: number; unit: string };
          chemical_properties?: { molecular_formula?: string; cas_number?: string; solubility?: string };
        };
      }
    };
    expect(materialRecord.record.payload.class?.[0]).toMatchObject({
      kind: 'ontology',
      namespace: 'CHEBI',
    });
    expect(materialRecord.record.payload.definition).toBeTruthy();
    expect(materialRecord.record.payload.molecular_weight?.unit).toBe('g/mol');
    expect(materialRecord.record.payload.chemical_properties?.molecular_formula).toBeTruthy();
    expect(materialRecord.record.payload.chemical_properties?.solubility).toBeTruthy();
  }, 60000);

  it('runs Sigma formulation ingestion to review and publishes material specs and recipes', async () => {
    const html = `
      <!doctype html>
      <html>
        <head><title>Sigma RPMI 1640 Media Formulations</title></head>
        <body>
          <h1>RPMI 1640 Media Formulations</h1>
          <h2>RPMI 1640 with L-glutamine</h2>
          <table>
            <tr><th>Component</th><th>Concentration</th></tr>
            <tr><td>Glucose</td><td>2 g/L</td></tr>
            <tr><td>Sodium bicarbonate</td><td>2 g/L</td></tr>
            <tr><td>L-Glutamine</td><td>0.3 g/L</td></tr>
          </table>
          <h2>RPMI 1640 without L-glutamine</h2>
          <table>
            <tr><th>Component</th><th>Concentration</th></tr>
            <tr><td>Glucose</td><td>2 g/L</td></tr>
            <tr><td>Sodium bicarbonate</td><td>2 g/L</td></tr>
            <tr><td>Calcium nitrate tetrahydrate</td><td>0.1 g/L</td></tr>
          </table>
          <h2>RPMI 1640 with HEPES</h2>
          <table>
            <tr><th>Component</th><th>Concentration</th></tr>
            <tr><td>Glucose</td><td>2 g/L</td></tr>
            <tr><td>Sodium bicarbonate</td><td>2 g/L</td></tr>
            <tr><td>HEPES</td><td>5 g/L</td></tr>
          </table>
        </body>
      </html>
    `;

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/ingestion/jobs',
      payload: {
        name: 'Sigma RPMI 1640',
        sourceKind: 'vendor_formulation_html',
        source: {
          fileName: 'rpmi-1640.html',
          mediaType: 'text/html',
          sizeBytes: html.length,
          contentBase64: Buffer.from(html, 'utf8').toString('base64'),
        },
      },
    });
    expect(createResponse.statusCode).toBe(200);
    const created = JSON.parse(createResponse.payload) as { job: { recordId: string } };

    const runResponse = await app.inject({
      method: 'POST',
      url: `/api/ingestion/jobs/${encodeURIComponent(created.job.recordId)}/run`,
      payload: {},
    });
    if (runResponse.statusCode !== 200) {
      throw new Error(runResponse.payload);
    }
    expect(runResponse.statusCode).toBe(200);
    const reviewed = JSON.parse(runResponse.payload) as {
      job: { payload: { status: string; stage: string; metrics?: Record<string, number> } };
      bundles: Array<{ recordId: string; payload: { metrics?: Record<string, number> } }>;
      candidates: Array<{ payload: { candidate_type: string } }>;
      issues: Array<{ payload: { issue_type: string } }>;
    };
    expect(reviewed.job.payload.status).toBe('waiting_for_review');
    expect(reviewed.job.payload.stage).toBe('review');
    expect(reviewed.job.payload.metrics?.variants_detected).toBe(3);
    expect(reviewed.candidates.filter((candidate) => candidate.payload.candidate_type === 'formulation')).toHaveLength(3);
    expect(reviewed.candidates.filter((candidate) => candidate.payload.candidate_type === 'recipe')).toHaveLength(3);
    expect(reviewed.issues.some((issue) => issue.payload.issue_type === 'name_ambiguity')).toBe(true);

    const bundleId = reviewed.bundles[0]!.recordId;
    const approveResponse = await app.inject({
      method: 'POST',
      url: `/api/ingestion/jobs/${encodeURIComponent(created.job.recordId)}/bundles/${encodeURIComponent(bundleId)}/approve`,
    });
    expect(approveResponse.statusCode).toBe(200);

    const publishResponse = await app.inject({
      method: 'POST',
      url: `/api/ingestion/jobs/${encodeURIComponent(created.job.recordId)}/bundles/${encodeURIComponent(bundleId)}/publish`,
    });
    expect(publishResponse.statusCode).toBe(200);
    const published = JSON.parse(publishResponse.payload) as {
      detail: { job: { payload: { status: string } } };
      publishResult: { createdMaterialSpecIds?: string[]; createdRecipeIds?: string[]; createdMaterialIds: string[] };
    };
    expect(published.detail.job.payload.status).toBe('published');
    expect(published.publishResult.createdMaterialSpecIds).toHaveLength(3);
    expect(published.publishResult.createdRecipeIds).toHaveLength(3);
    expect(published.publishResult.createdMaterialIds.length).toBeGreaterThanOrEqual(6);
  }, 60000);

  it('runs spreadsheet-only Cayman ingestion and returns review bundles from persisted refs', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes('/ols4/api/search')) {
        throw new Error(`Unexpected fetch URL in test: ${url}`);
      }
      const query = new URL(url).searchParams.get('q') ?? 'Unknown';
      return {
        ok: true,
        json: async () => ({
          response: {
            docs: [
              {
                obo_id: `CHEBI:${Math.abs(query.split('').reduce((total, char) => total + char.charCodeAt(0), 0))}`,
                label: query,
                iri: `https://example.org/chebi/${encodeURIComponent(query)}`,
                ontology_name: 'chebi',
                description: [`Ontology description for ${query}`],
                synonym: [`${query} synonym`],
              },
            ],
          },
        }),
      } as Response;
    }) as typeof fetch);

    const xlsxBuffer = await readFile(resolve(repoRoot, '../tmp/downloads/Cayman-stem-cell.xlsx'));
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/ingestion/jobs',
      payload: {
        name: 'Cayman stem cell spreadsheet',
        sourceKind: 'vendor_plate_map_spreadsheet',
        ontologyPreferences: ['chebi', 'ncit'],
        source: {
          fileName: 'Cayman-stem-cell.xlsx',
          mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          sizeBytes: xlsxBuffer.byteLength,
          contentBase64: xlsxBuffer.toString('base64'),
        },
      },
    });
    expect(createResponse.statusCode).toBe(200);
    const created = JSON.parse(createResponse.payload) as { job: { recordId: string; payload: { source_kind: string } } };
    expect(created.job.payload.source_kind).toBe('vendor_plate_map_spreadsheet');

    const runResponse = await app.inject({
      method: 'POST',
      url: `/api/ingestion/jobs/${encodeURIComponent(created.job.recordId)}/run`,
      payload: {},
    });
    if (runResponse.statusCode !== 200) {
      throw new Error(runResponse.payload);
    }
    const reviewed = JSON.parse(runResponse.payload) as {
      job: { payload: { status: string; stage: string; metrics?: Record<string, number>; progress?: { phase?: string; current?: number; total?: number; unit?: string } } };
      bundles: Array<{ recordId: string; payload: { bundle_type: string; metrics?: Record<string, number>; candidate_refs?: unknown[] } }>;
      candidates: Array<{ payload: { candidate_type: string } }>;
      issues: Array<{ payload: { issue_type: string } }>;
    };
    expect(reviewed.job.payload.status).toBe('waiting_for_review');
    expect(reviewed.job.payload.stage).toBe('review');
    expect(reviewed.job.payload.progress).toMatchObject({
      phase: 'review',
      current: 1,
      total: 1,
      unit: 'bundle',
    });
    expect(reviewed.bundles).toHaveLength(1);
    expect(reviewed.bundles[0]?.payload.bundle_type).toBe('screening_library');
    expect(reviewed.bundles[0]?.payload.metrics?.plates_detected).toBe(2);
    expect(reviewed.bundles[0]?.payload.candidate_refs?.length).toBeGreaterThan(0);
    expect(reviewed.candidates.filter((candidate) => candidate.payload.candidate_type === 'plate_layout')).toHaveLength(2);
    expect(reviewed.candidates.some((candidate) => candidate.payload.candidate_type === 'material')).toBe(true);

    const fetchedDetail = await app.inject({
      method: 'GET',
      url: `/api/ingestion/jobs/${encodeURIComponent(created.job.recordId)}`,
    });
    expect(fetchedDetail.statusCode).toBe(200);
    const detail = JSON.parse(fetchedDetail.payload) as {
      bundles: Array<unknown>;
      candidates: Array<unknown>;
      issues: Array<unknown>;
    };
    expect(detail.bundles).toHaveLength(1);
    expect(detail.candidates.length).toBeGreaterThan(0);
    expect(detail.issues.length).toBeGreaterThan(0);
  }, 180000);
});
