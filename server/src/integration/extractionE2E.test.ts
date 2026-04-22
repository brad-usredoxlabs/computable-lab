/**
 * E2E integration test: PDF upload → extract → draft persisted → promote → canonical + audit record.
 *
 * This test exercises the full extraction pipeline end-to-end:
 * 1. POST /extract/upload  — uploads a tiny PDF, returns XDR-* recordId
 * 2. GET  /records/:id     — retrieves the extraction-draft with candidates
 * 3. POST /extraction/drafts/:id/candidates/0/promote — promotes candidate
 * 4. Assert canonical protocol record exists
 * 5. Assert extraction-promotion audit record (XPR-*) exists
 * 6. Assert draft status is 'promoted'
 *
 * All I/O is in-memory / local temp directory. No real LLM or pdftotext calls.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { resolve } from 'node:path';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { initializeApp, createServer } from '../server.js';
import type { AppContext } from '../server.js';
import type { ExtractorAdapter, ExtractionRequest, ExtractionResult } from '../extract/ExtractorAdapter.js';
import type { MentionCandidatePopulator } from '../extract/MentionCandidatePopulator.js';
import type { ResolutionCandidate } from '../extract/MentionResolver.js';
import { ExtractionRunnerService } from '../extract/ExtractionRunnerService.js';
import { ExtractionMetrics } from '../extract/ExtractionMetrics.js';
import { createExtractHandlers } from '../api/handlers/ExtractHandlers.js';

// ──────────────────────────────────────────────
// Minimal schemas needed for the extraction pipeline
// ──────────────────────────────────────────────

const protocolSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/protocol.schema.yaml"
type: object
required: [kind, recordId, title, steps]
properties:
  kind: { const: "protocol" }
  recordId: { type: string }
  title: { type: string }
  description: { type: string }
  state: { type: string }
  tags:
    type: array
    items: { type: string }
  roles: { type: object }
  steps:
    type: array
    items:
      type: object
      required: [stepId, kind]
      properties:
        stepId: { type: string }
        kind: { type: string }
        action: { type: string }
        description: { type: string }
        evidence_span: { type: string }
        uncertainty: { type: string }
        mentions:
          type: array
          items: { type: object }
additionalProperties: true
`;

const extractionDraftSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/workflow/extraction-draft.schema.yaml"
type: object
required: [kind, recordId, source_artifact, candidates, status]
properties:
  kind: { const: "extraction-draft" }
  recordId: { type: string, pattern: '^XDR-[A-Za-z0-9_-]+$' }
  source_artifact:
    type: object
    required: [kind, id]
    properties:
      kind: { type: string, enum: [file, publication, freetext] }
      id: { type: string }
      locator: { type: string }
  candidates:
    type: array
    items:
      type: object
      required: [target_kind, draft, confidence]
      properties:
        target_kind: { type: string }
        draft: { type: object }
        confidence: { type: number, minimum: 0, maximum: 1 }
        evidence_span: { type: string, maxLength: 400 }
        uncertainty: { type: string, enum: [low, medium, high, unresolved, inferred] }
        status: { type: string, enum: [pending_review, partially_promoted, rejected, promoted] }
  status: { type: string, enum: [pending_review, partially_promoted, rejected, promoted] }
  notes: { type: string }
  diagnostics:
    type: array
    items:
      type: object
      required: [severity, code, message]
      properties:
        severity: { type: string, enum: [error, warning, info] }
        code: { type: string }
        message: { type: string }
        details: { type: object }
        pass_id: { type: string }
  extractor_profile: { type: string }
`;

const extractionPromotionSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/workflow/extraction-promotion.schema.yaml"
type: object
required: [kind, recordId, output_kind, source_draft_ref, candidate_path, source_artifact_ref, output_ref, source_content_hash, promoted_at, version]
properties:
  kind: { const: "extraction-promotion" }
  recordId: { type: string }
  output_kind: { type: string }
  source_draft_ref:
    type: object
    required: [kind, id, type]
    properties:
      kind: { const: "record" }
      id: { type: string }
      type: { const: "extraction-draft" }
  candidate_path: { type: string }
  source_artifact_ref:
    type: object
    required: [kind, id]
    properties:
      kind: { type: string, enum: [file, publication, freetext] }
      id: { type: string }
      locator: { type: string }
  output_ref:
    type: object
    required: [kind, id, type]
    properties:
      kind: { const: "record" }
      id: { type: string }
      type: { type: string }
  source_content_hash: { type: string }
  promoted_at: { type: string, format: date-time }
  version: { const: 1 }
additionalProperties: true
`;

// ──────────────────────────────────────────────
// Canned extractor that returns a protocol candidate
// ──────────────────────────────────────────────

const cannedAdapter: ExtractorAdapter = {
  async extract(_req: ExtractionRequest): Promise<ExtractionResult> {
    return {
      candidates: [
        {
          target_kind: 'protocol',
          confidence: 0.92,
          evidence_span: 'Add 10 uL DMSO then incubate.',
          uncertainty: 'low',
          draft: {
            display_name: 'Tiny Protocol',
            variant_label: null,
            sections: [
              {
                heading: 'Steps',
                evidence_span: 'Add 10 uL DMSO then incubate.',
                steps: [
                  {
                    order: 1,
                    action: 'add',
                    description: 'Add 10 uL DMSO',
                    mentions: [],
                    evidence_span: 'Add 10 uL DMSO',
                    uncertainty: 'low',
                  },
                ],
              },
            ],
            report: { unresolved_refs: [], notes: [] },
          },
          ambiguity_spans: [],
        },
      ],
      diagnostics: [],
    };
  },
};

// ──────────────────────────────────────────────
// Test suite
// ──────────────────────────────────────────────

describe('E2E: PDF upload → extract → draft → promote → canonical + audit', () => {
  let app: FastifyInstance;
  let ctx: AppContext;
  const testDir = resolve(process.cwd(), 'tmp/extraction-e2e-test');

  beforeAll(async () => {
    // Create test directory structure
    await mkdir(resolve(testDir, 'schema'), { recursive: true });
    await mkdir(resolve(testDir, 'schema/workflow'), { recursive: true });
    await mkdir(resolve(testDir, 'records'), { recursive: true });

    // Write minimal schemas
    await writeFile(resolve(testDir, 'schema/protocol.schema.yaml'), protocolSchema);
    await writeFile(resolve(testDir, 'schema/workflow/extraction-draft.schema.yaml'), extractionDraftSchema);
    await writeFile(resolve(testDir, 'schema/workflow/extraction-promotion.schema.yaml'), extractionPromotionSchema);

    // Initialize app with test directory
    ctx = await initializeApp(testDir, {
      schemaDir: 'schema',
      recordsDir: 'records',
      logLevel: 'silent',
    });

    // ── Build a custom server with mocked extractor ──

    // Create a custom extractor factory that returns our canned adapter
    const extractorFactory = (_targetKind: string): ExtractorAdapter => cannedAdapter;

    // Create a fake populator that returns empty candidates (we don't need mentions for this test)
    const fakePopulator: MentionCandidatePopulator = {
      populate: async (_kinds: ReadonlyArray<string>): Promise<Map<string, ResolutionCandidate[]>> => {
        return new Map();
      },
    };

    // Use absolute path to the pipeline file
    const pipelinePath = resolve(__dirname, '../../../schema/registry/compile-pipelines/extraction-compile.yaml');

    const metrics = new ExtractionMetrics();
    const runner = new ExtractionRunnerService({
      extractorFactory,
      populator: fakePopulator,
      pipelinePath,
      recordIdPrefix: 'XDR-',
      metrics,
    });

    // Create extract handlers with our mocked runner
    const extractHandlers = createExtractHandlers(
      runner,
      ctx.store,
      ctx.schemaRegistry,
      ctx.validator,
      metrics,
    );

    // Create a completely fresh fastify instance
    const { default: Fastify } = await import('fastify');
    const cors = await import('@fastify/cors');
    const multipart = await import('@fastify/multipart');

    const testApp = Fastify({
      logger: false,
      bodyLimit: 25 * 1024 * 1024,
    });

    await testApp.register(cors.default, {
      origin: true,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    });

    await testApp.register(multipart.default, {
      limits: {
        fileSize: 25 * 1024 * 1024,
        files: 5,
      },
    });

    // Create handlers
    const recordHandlers = await import('../api/handlers/RecordHandlers.js');
    const schemaHandlers = await import('../api/handlers/SchemaHandlers.js');
    const validationHandlers = await import('../api/handlers/ValidationHandlers.js');

    const rh = recordHandlers.createRecordHandlers(
      ctx.store,
      ctx.indexManager,
      ctx.identity,
      () => ctx.appConfig?.lab?.materialTracking,
      ctx.lifecycleEngine,
    );
    const sh = schemaHandlers.createSchemaHandlers(ctx.schemaRegistry);
    const vh = validationHandlers.createValidationHandlers(ctx.validator, ctx.lintEngine);

    // Register basic routes
    testApp.get('/health', async (): Promise<{ status: string; timestamp: string; components: object }> => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
      components: { schemas: { loaded: ctx.schemaRegistry.size } },
    }));

    testApp.get('/records', rh.listRecords.bind(rh));
    testApp.get('/records/:id', rh.getRecord.bind(rh));
    testApp.post('/records', rh.createRecord.bind(rh));
    testApp.put('/records/:id', rh.updateRecord.bind(rh));
    testApp.delete('/records/:id', rh.deleteRecord.bind(rh));

    testApp.get('/schemas', sh.listSchemas.bind(sh));
    testApp.get('/schemas/:id', sh.getSchema.bind(sh));

    testApp.post('/validate', vh.validate.bind(vh));

    // Register extract routes with our mocked handlers
    testApp.post('/extract', extractHandlers.extract.bind(extractHandlers));
    testApp.post('/extract/upload', extractHandlers.upload.bind(extractHandlers));
    testApp.get('/extract/metrics', extractHandlers.getMetrics.bind(extractHandlers));
    testApp.post('/extraction/drafts/:id/candidates/:i/promote', extractHandlers.promoteCandidate.bind(extractHandlers));
    testApp.post('/extraction/drafts/:id/candidates/:i/reject', extractHandlers.rejectCandidate.bind(extractHandlers));

    app = testApp;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await rm(testDir, { recursive: true, force: true });
  });

  // ── Step 1: Build a tiny PDF buffer ──

  async function buildTinyPdfBase64(): Promise<string> {
    // Use a real PDF from the resources directory.
    // This avoids issues with hand-crafted PDFs that pdf-parse can't parse.
    const pdfPath = resolve(process.cwd(), 'resources/vendor_pdfs/Bulletin_6816.pdf');
    const pdfBuffer = await readFile(pdfPath);
    return Buffer.from(pdfBuffer).toString('base64');
  }

  it('full pipeline: upload PDF → extract → draft → promote → canonical + audit', async () => {
    // 1. Build a tiny PDF buffer
    const pdfBase64 = await buildTinyPdfBase64();

    // 2. POST /extract/upload
    const uploadRes = await app.inject({
      method: 'POST',
      url: '/extract/upload',
      payload: {
        target_kind: 'protocol',
        fileName: 'test.pdf',
        contentBase64: pdfBase64,
      },
    });

    console.log('Upload status:', uploadRes.statusCode);
    console.log('Upload body:', uploadRes.payload);
    console.log('Upload headers:', uploadRes.headers);
    expect(uploadRes.statusCode).toBe(200);
    const uploadBody = JSON.parse(uploadRes.payload) as { recordId: string };
    expect(uploadBody.recordId).toMatch(/^XDR-/);
    const recordId = uploadBody.recordId;

    // 3. GET /records/<recordId> — retrieve the extraction-draft
    const getRes = await app.inject({
      method: 'GET',
      url: `/records/${recordId}`,
    });

    expect(getRes.statusCode).toBe(200);
    const getBody = JSON.parse(getRes.payload) as { record: { payload: { candidates: unknown[] } } };
    expect(getBody.record.payload.candidates).toHaveLength(1);
    expect(getBody.record.payload.candidates[0].target_kind).toBe('protocol');

    // 4. POST /extraction/drafts/<recordId>/candidates/0/promote
    const promRes = await app.inject({
      method: 'POST',
      url: `/extraction/drafts/${recordId}/candidates/0/promote`,
    });

    expect(promRes.statusCode).toBe(200);
    const promBody = JSON.parse(promRes.payload) as { success: boolean; recordId?: string; promotionId?: string };
    expect(promBody.success).toBe(true);
    expect(promBody.recordId).toBeDefined();
    expect(promBody.promotionId).toBeDefined();

    const canonicalRecordId = promBody.recordId!;
    const promotionRecordId = promBody.promotionId!;

    // 5. Assert canonical protocol record exists
    const canonRes = await app.inject({
      method: 'GET',
      url: `/records/${canonicalRecordId}`,
    });
    expect(canonRes.statusCode).toBe(200);
    const canonBody = JSON.parse(canonRes.payload) as { record: { payload: { kind: string } } };
    expect(canonBody.record.payload.kind).toBe('protocol');

    // 6. Assert extraction-promotion audit record exists
    const auditRes = await app.inject({
      method: 'GET',
      url: `/records/${promotionRecordId}`,
    });
    expect(auditRes.statusCode).toBe(200);
    const auditBody = JSON.parse(auditRes.payload) as { record: { payload: { kind: string } } };
    expect(auditBody.record.payload.kind).toBe('extraction-promotion');

    // 7. Assert draft status is 'promoted'
    const draftRes = await app.inject({
      method: 'GET',
      url: `/records/${recordId}`,
    });
    expect(draftRes.statusCode).toBe(200);
    const draftBody = JSON.parse(draftRes.payload) as { record: { payload: { status: string } } };
    expect(draftBody.record.payload.status).toBe('promoted');

    // 8. Assert XPR-* audit record exists via list
    const auditListRes = await app.inject({
      method: 'GET',
      url: '/records?kind=extraction-promotion',
    });
    expect(auditListRes.statusCode).toBe(200);
    const auditListBody = JSON.parse(auditListRes.payload) as { records: Array<{ recordId: string }> };
    expect(auditListBody.records.some((a) => a.recordId.startsWith('XPR-'))).toBe(true);

    // 9. Assert canonical protocol record exists via list
    const canonListRes = await app.inject({
      method: 'GET',
      url: '/records?kind=protocol',
    });
    expect(canonListRes.statusCode).toBe(200);
    const canonListBody = JSON.parse(canonListRes.payload) as { records: Array<unknown> };
    expect(canonListBody.records.length).toBeGreaterThan(0);
  });
});
