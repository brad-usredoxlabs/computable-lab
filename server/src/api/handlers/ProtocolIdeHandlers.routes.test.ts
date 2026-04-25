import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { RecordStore } from '../../store/types.js';
import { createProtocolIdeHandlers } from './ProtocolIdeHandlers.js';

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

function makeMockCtx(store: RecordStore) {
  return {
    schemaRegistry: {} as any,
    validator: {} as any,
    lintEngine: {} as any,
    repoAdapter: {} as any,
    store,
    indexManager: {} as any,
    uiSpecLoader: {} as any,
    workspaceRoot: '/tmp',
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
  const handlers = createProtocolIdeHandlers(makeMockCtx(store));
  const app = Fastify();

  await app.register(async (instance) => {
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
