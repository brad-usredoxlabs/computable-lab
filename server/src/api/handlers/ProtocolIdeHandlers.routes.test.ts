import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { RecordStore } from '../../store/types.js';
import { createProtocolIdeHandlers } from './ProtocolIdeHandlers.js';
import { readyTasks, scanFoundryLedger, saveFoundryLedger } from '../../foundry/FoundryLedger.js';
import { writeYamlFile } from '../../foundry/FoundryArtifacts.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockStore(
  createResult: { success: boolean; error?: string } = { success: true },
): RecordStore {
  return {
    create: vi.fn().mockResolvedValue(createResult),
    get: vi.fn().mockResolvedValue(null),
    getByPath: vi.fn().mockResolvedValue(null),
    getWithValidation: vi.fn().mockResolvedValue({ success: true }),
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({ success: true }),
    delete: vi.fn().mockResolvedValue({ success: true }),
    validate: vi.fn().mockResolvedValue({ valid: true }),
    lint: vi.fn().mockResolvedValue({ valid: true }),
    exists: vi.fn().mockResolvedValue(false),
  } as unknown as RecordStore;
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function makeMockCtx(store: RecordStore, workspaceRoot = '/tmp') {
  return {
    schemaRegistry: {} as any,
    validator: {} as any,
    lintEngine: {} as any,
    repoAdapter: {} as any,
    store,
    indexManager: {} as any,
    uiSpecLoader: {} as any,
    workspaceRoot,
    recordsDir: 'records',
    schemaDir: 'schema',
    platformRegistry: {} as any,
    lifecycleEngine: {} as any,
    policyBundleService: {} as any,
  } as unknown as any;
}

// ---------------------------------------------------------------------------
// Route registration helper
// ---------------------------------------------------------------------------

async function buildTestApp(store: RecordStore) {
  return buildTestAppWithWorkspace(store, '/tmp');
}

async function buildTestAppWithWorkspace(store: RecordStore, workspaceRoot: string) {
  const handlers = createProtocolIdeHandlers(makeMockCtx(store, workspaceRoot));
  const app = Fastify();

  await app.register(async (instance) => {
    instance.get('/protocol-ide/foundry/status', handlers.getFoundryStatus.bind(handlers));
    instance.get('/protocol-ide/foundry/reviews', handlers.listFoundryReviews.bind(handlers));
    instance.get('/protocol-ide/foundry/:protocolId/:variant/review-context', handlers.getFoundryReviewContext.bind(handlers));
    instance.post('/protocol-ide/foundry/:protocolId/:variant/synthesize-spec', handlers.synthesizeFoundrySpec.bind(handlers));
    instance.post('/protocol-ide/foundry/:protocolId/:variant/reject', handlers.rejectFoundryReview.bind(handlers));
    instance.post('/protocol-ide/foundry/:protocolId/:variant/reopen', handlers.reopenFoundryReview.bind(handlers));
    instance.post('/protocol-ide/sessions', handlers.createSession.bind(handlers));
    instance.post('/protocol-ide/sessions/:sessionId/feedback', handlers.submitFeedback.bind(handlers));
    instance.get('/protocol-ide/sessions/:sessionId/rolling-summary', handlers.getRollingSummary.bind(handlers));
    instance.post('/protocol-ide/sessions/:sessionId/generate-issue-cards', handlers.generateIssueCards.bind(handlers));
    instance.get('/protocol-ide/sessions/:sessionId/issue-cards', handlers.getIssueCards.bind(handlers));
    instance.post('/protocol-ide/sessions/:sessionId/export-issue-cards', handlers.exportIssueCards.bind(handlers));
    instance.get('/protocol-ide/sessions/:sessionId/can-export', handlers.canExport.bind(handlers));
  }, { prefix: '/api' });

  return app;
}

async function makeFoundryWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'protocol-ide-foundry-routes-'));
  const artifactRoot = join(workspaceRoot, 'artifacts');
  await mkdir(join(artifactRoot, 'segments'), { recursive: true });
  await mkdir(join(artifactRoot, 'text'), { recursive: true });
  await writeFile(join(artifactRoot, 'segments', 'demo-protocol.yaml'), 'protocolId: demo-protocol\ntext: Add PBS.\n', 'utf-8');
  await writeFile(join(artifactRoot, 'text', 'demo-protocol.txt'), 'Step 1. Add PBS to each well.', 'utf-8');
  await writeYamlFile(join(artifactRoot, 'material-context', 'demo-protocol.yaml'), {
    kind: 'protocol-material-context',
    material_mentions: [{ label: 'PBS', layer: 'material' }],
  });
  await writeYamlFile(join(artifactRoot, 'compiler', 'demo-protocol', 'manual_tubes.yaml'), {
    kind: 'protocol-foundry-compiler-result',
    outcome: 'gap',
    eventCount: 1,
    diagnostics: [{ code: 'missing_wash' }],
  });
  await writeYamlFile(join(artifactRoot, 'event-graphs', 'demo-protocol', 'manual_tubes.yaml'), {
    kind: 'protocol-event-graph-proposal',
    events: [{ eventId: 'evt-1', semanticKey: 'EVT-add-pbs-1' }],
  });
  await writeYamlFile(join(artifactRoot, 'execution-scale', 'demo-protocol', 'manual_tubes.yaml'), {
    kind: 'execution-scale-plan',
  });
  await writeYamlFile(join(artifactRoot, 'assumptions', 'demo-protocol', 'manual_tubes.yaml'), {
    kind: 'protocol-foundry-test-assumption-profile',
  });
  await writeYamlFile(join(artifactRoot, 'browser-review', 'demo-protocol', 'manual_tubes', 'report.yaml'), {
    kind: 'protocol-browser-review-report',
    status: 'fail',
  });
  await writeYamlFile(join(artifactRoot, 'architect', 'demo-protocol', 'manual_tubes', 'verdict.yaml'), {
    kind: 'protocol-foundry-architect-verdict',
    verdict: 'needs_fix',
    recommended_patch: { change: 'Add a durable mapping.' },
  });
  await writeYamlFile(join(artifactRoot, 'patch-specs', 'demo-protocol', 'manual_tubes', 'fix-wash.yaml'), {
    kind: 'protocol-foundry-patch-spec',
    id: 'fix-wash',
    title: 'Add wash mapping',
  });
  const ledger = await scanFoundryLedger(artifactRoot);
  await saveFoundryLedger(ledger);
  return workspaceRoot;
}

// ---------------------------------------------------------------------------
// Foundry human-review routes
// ---------------------------------------------------------------------------

describe('ProtocolIdeHandlers routes — Foundry review inbox', () => {
  it('returns refreshed Foundry operational status rollups', async () => {
    const workspaceRoot = await makeFoundryWorkspace();
    const app = await buildTestAppWithWorkspace(makeMockStore(), workspaceRoot);

    const response = await app.inject({
      method: 'GET',
      url: '/api/protocol-ide/foundry/status',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.status.kind).toBe('protocol-foundry-operational-status');
    expect(body.status.protocolCount).toBe(1);
    expect(body.status.loop).toMatchObject({
      metadataPath: 'manifests/loop-runtime.yaml',
      running: false,
      status: 'missing',
    });
    expect(body.status.counts.extractedText).toBe(1);
    expect(body.status.counts.compiled).toBeGreaterThanOrEqual(1);
    expect(body.index.kind).toBe('protocol-foundry-manifest-index');
    expect(body.index.manifests).toContainEqual(expect.objectContaining({
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
    }));
    await expect(readFile(join(workspaceRoot, 'artifacts', 'manifests', 'status.yaml'), 'utf-8')).resolves.toContain('protocol-foundry-operational-status');

    await app.close();
  });

  it('lists and loads exact Foundry review context', async () => {
    const workspaceRoot = await makeFoundryWorkspace();
    const app = await buildTestAppWithWorkspace(makeMockStore(), workspaceRoot);

    const listed = await app.inject({
      method: 'GET',
      url: '/api/protocol-ide/foundry/reviews',
    });
    expect(listed.statusCode).toBe(200);
    const listBody = JSON.parse(listed.body);
    expect(listBody.success).toBe(true);
    expect(listBody.reviews).toContainEqual(expect.objectContaining({
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
    }));

    const context = await app.inject({
      method: 'GET',
      url: '/api/protocol-ide/foundry/demo-protocol/manual_tubes/review-context',
    });
    expect(context.statusCode).toBe(200);
    const contextBody = JSON.parse(context.body);
    expect(contextBody.context.protocolId).toBe('demo-protocol');
    expect(contextBody.context.source.extractedText).toContain('Add PBS');
    expect(contextBody.context.artifacts.patchSpecs).toHaveLength(1);

    await app.close();
  });

  it('rejects a Foundry review without queueing coder work', async () => {
    const workspaceRoot = await makeFoundryWorkspace();
    const app = await buildTestAppWithWorkspace(makeMockStore(), workspaceRoot);

    const rejected = await app.inject({
      method: 'POST',
      url: '/api/protocol-ide/foundry/demo-protocol/manual_tubes/reject',
      payload: { reason: 'redundant spec' },
    });
    expect(rejected.statusCode).toBe(200);
    const body = JSON.parse(rejected.body);
    expect(body.status).toBe('rejected');

    const review = await readFile(join(workspaceRoot, 'artifacts', 'human-review', 'demo-protocol', 'manual_tubes', 'review.yaml'), 'utf-8');
    expect(review).toContain('status: rejected');
    expect(review).toContain('redundant spec');

    await app.close();
  });

  it('accepts a typed reasonClass and surfaces it in the response + review record', async () => {
    const workspaceRoot = await makeFoundryWorkspace();
    const app = await buildTestAppWithWorkspace(makeMockStore(), workspaceRoot);

    const rejected = await app.inject({
      method: 'POST',
      url: '/api/protocol-ide/foundry/demo-protocol/manual_tubes/reject',
      payload: { reason: 'covered by spec X', reasonClass: 'redundant' },
    });
    expect(rejected.statusCode).toBe(200);
    const body = JSON.parse(rejected.body);
    expect(body.reasonClass).toBe('redundant');

    const review = await readFile(join(workspaceRoot, 'artifacts', 'human-review', 'demo-protocol', 'manual_tubes', 'review.yaml'), 'utf-8');
    expect(review).toContain('reasonClass: redundant');

    await app.close();
  });

  it('rejects an unknown reasonClass with 400', async () => {
    const workspaceRoot = await makeFoundryWorkspace();
    const app = await buildTestAppWithWorkspace(makeMockStore(), workspaceRoot);

    const res = await app.inject({
      method: 'POST',
      url: '/api/protocol-ide/foundry/demo-protocol/manual_tubes/reject',
      payload: { reasonClass: 'nope' },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('INVALID_REASON_CLASS');

    await app.close();
  });

  it('reopens a rejected Foundry review for another human pass', async () => {
    const workspaceRoot = await makeFoundryWorkspace();
    const app = await buildTestAppWithWorkspace(makeMockStore(), workspaceRoot);

    await app.inject({
      method: 'POST',
      url: '/api/protocol-ide/foundry/demo-protocol/manual_tubes/reject',
      payload: { reason: 'redundant spec' },
    });

    const reopened = await app.inject({
      method: 'POST',
      url: '/api/protocol-ide/foundry/demo-protocol/manual_tubes/reopen',
      payload: { reason: 'needs another look' },
    });
    expect(reopened.statusCode).toBe(200);
    const body = JSON.parse(reopened.body);
    expect(body.status).toBe('reviewing');

    const context = await app.inject({
      method: 'GET',
      url: '/api/protocol-ide/foundry/demo-protocol/manual_tubes/review-context',
    });
    const contextBody = JSON.parse(context.body);
    expect(contextBody.context.status).toBe('reviewing');
    expect(contextBody.context.artifacts.humanReview.reopenHistory).toHaveLength(1);

    await app.close();
  });

  it('synthesizes a reviewed spec into knowledge records and live Foundry patch specs', async () => {
    const workspaceRoot = await makeFoundryWorkspace();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: [
        'title: Add durable wash mapping',
        'fixClass: event_graph_coverage',
        'rationale: The graph misses a wash event from the source protocol.',
        'ownedFiles:',
        '  - server/src/compiler',
        'acceptance:',
        '  - compiler emits the wash event',
        'dataFirstDisposition: Prefer YAML mapping if possible.',
        'semanticLayer: event_derived',
        'graphAnchors:',
        '  - EVT-add-pbs-1',
      ].join('\n') } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const app = await buildTestAppWithWorkspace(makeMockStore(), workspaceRoot);

    const submitted = await app.inject({
      method: 'POST',
      url: '/api/protocol-ide/foundry/demo-protocol/manual_tubes/synthesize-spec',
      payload: { humanInstruction: 'Keep the fix narrow.' },
    });
    expect(submitted.statusCode).toBe(200);
    const body = JSON.parse(submitted.body);
    expect(body.status).toBe('queued');
    expect(body.patchSpecPath).toContain('/patch-specs/demo-protocol/manual_tubes/');
    expect(body.adoptionPath).toContain('/adoption/demo-protocol/manual_tubes/adoption.yaml');

    const patchSpec = await readFile(body.patchSpecPath, 'utf-8');
    expect(patchSpec).toContain('source: human-reviewed-foundry-spec');
    expect(patchSpec).toContain('reviewedSpec:');
    expect(patchSpec).toContain('knowledgeLayer:');

    const knowledgeIndex = await readFile(
      join(workspaceRoot, 'artifacts', 'knowledge-layer', 'demo-protocol', 'manual_tubes', 'index.yaml'),
      'utf-8',
    );
    expect(knowledgeIndex).toContain('protocol-foundry-knowledge-layer-index');

    const ledger = await scanFoundryLedger(join(workspaceRoot, 'artifacts'));
    expect(readyTasks(ledger)).toContainEqual({
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      stage: 'coder_patch',
    });

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// POST /protocol-ide/sessions — success
// ---------------------------------------------------------------------------

describe('ProtocolIdeHandlers routes — POST /protocol-ide/sessions', () => {
  it('returns 201 with success:true and sessionId starting with PIS-', async () => {
    const store = makeMockStore();
    const app = await buildTestApp(store);

    const res = await app.inject({
      method: 'POST',
      url: '/api/protocol-ide/sessions',
      payload: {
        directiveText: 'extract the DNA extraction protocol',
        source: {
          sourceKind: 'vendor_document',
          vendor: 'thermo',
          title: 'DNA Extraction Protocol v2',
          pdfUrl: 'https://example.com/protocol.pdf',
          landingUrl: 'https://example.com/protocol',
          snippet: 'A comprehensive protocol.',
          documentType: 'protocol',
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.sessionId).toMatch(/^PIS-/);
    expect(body.status).toBe('importing');

    await app.close();
  });

  it('returns 400 when directiveText is missing', async () => {
    const store = makeMockStore();
    const app = await buildTestApp(store);

    const res = await app.inject({
      method: 'POST',
      url: '/api/protocol-ide/sessions',
      payload: {
        source: {
          sourceKind: 'pasted_url',
          url: 'https://example.com/protocol.pdf',
        },
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('INVALID_INTAKE');

    await app.close();
  });

  it('returns 400 when source is missing', async () => {
    const store = makeMockStore();
    const app = await buildTestApp(store);

    const res = await app.inject({
      method: 'POST',
      url: '/api/protocol-ide/sessions',
      payload: {
        directiveText: 'extract protocol',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('INVALID_INTAKE');

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// POST /protocol-ide/sessions/:sessionId/feedback
// ---------------------------------------------------------------------------

describe('ProtocolIdeHandlers routes — POST /protocol-ide/sessions/:sessionId/feedback', () => {
  it('returns 404 when session is not found', async () => {
    const store = makeMockStore();
    const app = await buildTestApp(store);

    const res = await app.inject({
      method: 'POST',
      url: '/api/protocol-ide/sessions/PIS-nonexistent/feedback',
      payload: {
        body: 'test comment',
      },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('SESSION_NOT_FOUND');

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// GET /protocol-ide/sessions/:sessionId/rolling-summary
// ---------------------------------------------------------------------------

describe('ProtocolIdeHandlers routes — GET /protocol-ide/sessions/:sessionId/rolling-summary', () => {
  it('returns 404 when session is not found', async () => {
    const store = makeMockStore();
    const app = await buildTestApp(store);

    const res = await app.inject({
      method: 'GET',
      url: '/api/protocol-ide/sessions/PIS-nonexistent/rolling-summary',
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('SESSION_NOT_FOUND');

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// POST /protocol-ide/sessions/:sessionId/generate-issue-cards
// ---------------------------------------------------------------------------

describe('ProtocolIdeHandlers routes — POST /protocol-ide/sessions/:sessionId/generate-issue-cards', () => {
  it('returns 404 when session is not found', async () => {
    const store = makeMockStore();
    const app = await buildTestApp(store);

    const res = await app.inject({
      method: 'POST',
      url: '/api/protocol-ide/sessions/PIS-nonexistent/generate-issue-cards',
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('SESSION_NOT_FOUND');

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// GET /protocol-ide/sessions/:sessionId/issue-cards
// ---------------------------------------------------------------------------

describe('ProtocolIdeHandlers routes — GET /protocol-ide/sessions/:sessionId/issue-cards', () => {
  it('returns 404 when session is not found', async () => {
    const store = makeMockStore();
    const app = await buildTestApp(store);

    const res = await app.inject({
      method: 'GET',
      url: '/api/protocol-ide/sessions/PIS-nonexistent/issue-cards',
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('SESSION_NOT_FOUND');

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// POST /protocol-ide/sessions/:sessionId/export-issue-cards
// ---------------------------------------------------------------------------

describe('ProtocolIdeHandlers routes — POST /protocol-ide/sessions/:sessionId/export-issue-cards', () => {
  it('returns 404 when session is not found', async () => {
    const store = makeMockStore();
    const app = await buildTestApp(store);

    const res = await app.inject({
      method: 'POST',
      url: '/api/protocol-ide/sessions/PIS-nonexistent/export-issue-cards',
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('SESSION_NOT_FOUND');

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// GET /protocol-ide/sessions/:sessionId/can-export
// ---------------------------------------------------------------------------

describe('ProtocolIdeHandlers routes — GET /protocol-ide/sessions/:sessionId/can-export', () => {
  it('returns 404 when session is not found', async () => {
    const store = makeMockStore();
    const app = await buildTestApp(store);

    const res = await app.inject({
      method: 'GET',
      url: '/api/protocol-ide/sessions/PIS-nonexistent/can-export',
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('SESSION_NOT_FOUND');

    await app.close();
  });
});
