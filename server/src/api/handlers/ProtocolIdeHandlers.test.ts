import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../server.js';
import type { RecordStore, RecordEnvelope } from '../../store/types.js';
import { createProtocolIdeHandlers } from './ProtocolIdeHandlers.js';

// ---------------------------------------------------------------------------
// Module-level mocks for services used in chaining tests
// ---------------------------------------------------------------------------

// Use vi.hoisted to create mock methods that are available at the hoisted position
const mockImportSourceFn = vi.hoisted(() => vi.fn());
const mockExecuteProjectionFn = vi.hoisted(() => vi.fn());

vi.mock('../../protocol/ProtocolIdeSourceImportService.js', () => ({
  ProtocolIdeSourceImportService: function() {
    return { importSource: mockImportSourceFn };
  },
}));

vi.mock('../../protocol/ProtocolIdeProjectionService.js', () => ({
  ProtocolIdeProjectionService: function() {
    return { executeProjection: mockExecuteProjectionFn };
  },
}));

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

function makeMockCtx(store: RecordStore): AppContext {
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
  } as unknown as AppContext;
}

function makeMockReply() {
  const statusMock = vi.fn().mockReturnThis();
  return {
    code: statusMock,
    status: statusMock,
    send: vi.fn().mockReturnThis(),
  } as unknown as FastifyReply;
}

// ---------------------------------------------------------------------------
// Feedback helpers
// ---------------------------------------------------------------------------

function makeFeedbackMockStore(
  initialEnvelope: RecordEnvelope | null = null,
  updateResult: { success: boolean; error?: string } = { success: true },
): RecordStore {
  let currentEnvelope: RecordEnvelope | null = initialEnvelope;

  return {
    create: vi.fn().mockResolvedValue({ success: true }),
    get: vi.fn().mockImplementation(() => {
      return Promise.resolve(currentEnvelope);
    }),
    getByPath: vi.fn().mockResolvedValue(null),
    getWithValidation: vi.fn().mockResolvedValue({ success: true }),
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockImplementation((options) => {
      currentEnvelope = options.envelope;
      return Promise.resolve(updateResult);
    }),
    delete: vi.fn().mockResolvedValue({ success: true }),
    validate: vi.fn().mockResolvedValue({ valid: true }),
    lint: vi.fn().mockResolvedValue({ valid: true }),
    exists: vi.fn().mockResolvedValue(false),
  } as unknown as RecordStore;
}

// ---------------------------------------------------------------------------
// Vendor document source — success
// ---------------------------------------------------------------------------

describe('ProtocolIdeHandlers — vendor_document source', () => {
  it('creates a session and returns 201 with shell-ready metadata', async () => {
    const store = makeMockStore();
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      body: {
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
    } as unknown as FastifyRequest<{
      Body: { directiveText?: string; source?: Record<string, unknown> };
    }>;

    const reply = makeMockReply();
    const result = await handlers.createSession(request, reply);

    expect(reply.status).toHaveBeenCalledWith(201);
    expect(result).toMatchObject({
      success: true,
      sessionId: expect.stringMatching(/^PIS-/),
      status: 'importing',
      sourceSummary: expect.stringContaining('thermo'),
      latestDirectiveText: 'extract the DNA extraction protocol',
      sourceEvidenceRef: null,
      graphReviewRef: null,
      issueCardsRef: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Pasted URL source — success
// ---------------------------------------------------------------------------

describe('ProtocolIdeHandlers — pasted_url source', () => {
  it('creates a session with status importing', async () => {
    const store = makeMockStore();
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      body: {
        directiveText: 'extract protocol from URL',
        source: {
          sourceKind: 'pasted_url',
          url: 'https://example.com/protocol.pdf',
        },
      },
    } as unknown as FastifyRequest<{
      Body: { directiveText?: string; source?: Record<string, unknown> };
    }>;

    const reply = makeMockReply();
    const result = await handlers.createSession(request, reply);

    expect(reply.status).toHaveBeenCalledWith(201);
    expect(result).toMatchObject({
      success: true,
      status: 'importing',
      sourceSummary: expect.stringContaining('PDF URL'),
    });
  });
});

// ---------------------------------------------------------------------------
// Uploaded PDF source — success
// ---------------------------------------------------------------------------

describe('ProtocolIdeHandlers — uploaded_pdf source', () => {
  it('creates a session from uploaded PDF', async () => {
    const store = makeMockStore();
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      body: {
        directiveText: 'extract protocol from uploaded PDF',
        source: {
          sourceKind: 'uploaded_pdf',
          uploadId: 'upload-abc123',
          fileName: 'protocol.pdf',
          mediaType: 'application/pdf',
          contentBase64: 'AAAA',
        },
      },
    } as unknown as FastifyRequest<{
      Body: { directiveText?: string; source?: Record<string, unknown> };
    }>;

    const reply = makeMockReply();
    const result = await handlers.createSession(request, reply);

    expect(reply.status).toHaveBeenCalledWith(201);
    expect(result).toMatchObject({
      success: true,
      status: 'importing',
      sourceSummary: expect.stringContaining('Uploaded: protocol.pdf'),
    });
  });
});

// ---------------------------------------------------------------------------
// Validation failures
// ---------------------------------------------------------------------------

describe('ProtocolIdeHandlers — validation failures', () => {
  it('rejects missing directiveText', async () => {
    const store = makeMockStore();
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      body: {
        source: {
          sourceKind: 'pasted_url',
          url: 'https://example.com/protocol.pdf',
        },
      },
    } as unknown as FastifyRequest<{
      Body: { directiveText?: string; source?: Record<string, unknown> };
    }>;

    const reply = makeMockReply();
    const result = await handlers.createSession(request, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(result).toMatchObject({
      error: 'INVALID_INTAKE',
      message: expect.stringContaining('directiveText'),
    });
  });

  it('rejects empty directiveText', async () => {
    const store = makeMockStore();
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      body: {
        directiveText: '',
        source: {
          sourceKind: 'pasted_url',
          url: 'https://example.com/protocol.pdf',
        },
      },
    } as unknown as FastifyRequest<{
      Body: { directiveText?: string; source?: Record<string, unknown> };
    }>;

    const reply = makeMockReply();
    const result = await handlers.createSession(request, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(result).toMatchObject({
      error: 'INVALID_INTAKE',
      message: expect.stringContaining('directiveText'),
    });
  });

  it('rejects whitespace-only directiveText', async () => {
    const store = makeMockStore();
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      body: {
        directiveText: '   ',
        source: {
          sourceKind: 'pasted_url',
          url: 'https://example.com/protocol.pdf',
        },
      },
    } as unknown as FastifyRequest<{
      Body: { directiveText?: string; source?: Record<string, unknown> };
    }>;

    const reply = makeMockReply();
    const result = await handlers.createSession(request, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(result).toMatchObject({
      error: 'INVALID_INTAKE',
      message: expect.stringContaining('directiveText'),
    });
  });

  it('rejects missing source', async () => {
    const store = makeMockStore();
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      body: {
        directiveText: 'extract protocol',
      },
    } as unknown as FastifyRequest<{
      Body: { directiveText?: string; source?: Record<string, unknown> };
    }>;

    const reply = makeMockReply();
    const result = await handlers.createSession(request, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(result).toMatchObject({
      error: 'INVALID_INTAKE',
      message: expect.stringContaining('source'),
    });
  });

  it('rejects unknown sourceKind', async () => {
    const store = makeMockStore();
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      body: {
        directiveText: 'extract protocol',
        source: {
          sourceKind: 'unknown_kind',
        },
      },
    } as unknown as FastifyRequest<{
      Body: { directiveText?: string; source?: Record<string, unknown> };
    }>;

    const reply = makeMockReply();
    const result = await handlers.createSession(request, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(result).toMatchObject({
      error: 'INVALID_INTAKE',
      message: expect.stringContaining('Unknown sourceKind'),
    });
  });
});

// ---------------------------------------------------------------------------
// Second-source rejection (conflict)
// ---------------------------------------------------------------------------

describe('ProtocolIdeHandlers — second-source rejection', () => {
  it('returns 409 when a session already exists for the source hint', async () => {
    const mockEnvelope: RecordEnvelope = {
      kind: 'protocol-ide-session',
      recordId: 'PIS-existing-001',
      payload: { status: 'importing' },
      meta: { createdAt: new Date().toISOString() },
    };
    const store = makeMockStore();
    (store.list as ReturnType<typeof vi.fn>).mockResolvedValue([mockEnvelope]);
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      body: {
        directiveText: 'extract protocol',
        source: {
          sourceKind: 'vendor_document',
          vendor: 'thermo',
          title: 'DNA Extraction Protocol v2',
          landingUrl: 'https://example.com/protocol',
          sessionIdHint: 'PIS-existing-001',
        },
      },
    } as unknown as FastifyRequest<{
      Body: { directiveText?: string; source?: Record<string, unknown> };
    }>;

    const reply = makeMockReply();
    const result = await handlers.createSession(request, reply);

    expect(reply.status).toHaveBeenCalledWith(409);
    expect(result).toMatchObject({
      error: 'SESSION_EXISTS',
      message: expect.stringContaining('already exists'),
    });
  });
});

// ---------------------------------------------------------------------------
// Store failure
// ---------------------------------------------------------------------------

describe('ProtocolIdeHandlers — store failure', () => {
  it('returns 500 when session creation fails', async () => {
    const store = makeMockStore({
      success: false,
      error: 'database error',
    });
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      body: {
        directiveText: 'extract protocol',
        source: {
          sourceKind: 'pasted_url',
          url: 'https://example.com/protocol.pdf',
        },
      },
    } as unknown as FastifyRequest<{
      Body: { directiveText?: string; source?: Record<string, unknown> };
    }>;

    const reply = makeMockReply();
    const result = await handlers.createSession(request, reply);

    expect(reply.status).toHaveBeenCalledWith(500);
    expect(result).toMatchObject({
      error: 'SESSION_CREATE_FAILED',
      message: expect.stringContaining('database error'),
    });
  });
});

// ---------------------------------------------------------------------------
// Feedback submission — success
// ---------------------------------------------------------------------------

describe('ProtocolIdeHandlers — submitFeedback', () => {
  it('submits a freeform comment and returns 201', async () => {
    const mockEnvelope: RecordEnvelope = {
      kind: 'protocol-ide-session',
      recordId: 'PIS-001',
      payload: { kind: 'protocol-ide-session', status: 'reviewing' },
      meta: { createdAt: new Date().toISOString() },
    };
    const store = makeFeedbackMockStore(mockEnvelope, { success: true });
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      params: { sessionId: 'PIS-001' },
      body: {
        body: 'This should be in a 96-well plate layout',
        anchors: [{ kind: 'phase', phaseId: 'phase-1' }],
      },
    } as unknown as FastifyRequest<{
      Params: { sessionId: string };
      Body: { body: string; anchors?: unknown[]; severity?: string };
    }>;

    const reply = makeMockReply();
    const result = await handlers.submitFeedback(request, reply);

    expect(reply.status).toHaveBeenCalledWith(201);
    expect(result).toMatchObject({
      success: true,
      feedbackId: expect.stringMatching(/^fb-/),
      rollingSummary: expect.objectContaining({
        commentCount: 1,
      }),
    });
  });

  it('submits a comment with a graph anchor', async () => {
    const mockEnvelope: RecordEnvelope = {
      kind: 'protocol-ide-session',
      recordId: 'PIS-001',
      payload: { kind: 'protocol-ide-session', status: 'reviewing' },
      meta: { createdAt: new Date().toISOString() },
    };
    const store = makeFeedbackMockStore(mockEnvelope, { success: true });
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      params: { sessionId: 'PIS-001' },
      body: {
        body: 'Wash step needs adjustment',
        anchors: [{ kind: 'node', semanticKey: 'wash-step-001', snapshot: { step: 'wash' } }],
      },
    } as unknown as FastifyRequest<{
      Params: { sessionId: string };
      Body: { body: string; anchors?: unknown[]; severity?: string };
    }>;

    const reply = makeMockReply();
    const result = await handlers.submitFeedback(request, reply);

    expect(reply.status).toHaveBeenCalledWith(201);
    expect(result).toMatchObject({
      success: true,
      rollingSummary: expect.objectContaining({
        commentCount: 1,
      }),
    });
  });

  it('submits a comment with a source anchor', async () => {
    const mockEnvelope: RecordEnvelope = {
      kind: 'protocol-ide-session',
      recordId: 'PIS-001',
      payload: { kind: 'protocol-ide-session', status: 'reviewing' },
      meta: { createdAt: new Date().toISOString() },
    };
    const store = makeFeedbackMockStore(mockEnvelope, { success: true });
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      params: { sessionId: 'PIS-001' },
      body: {
        body: 'Volume is too low',
        anchors: [{ kind: 'source', documentRef: 'vendor-doc-123', page: 3 }],
      },
    } as unknown as FastifyRequest<{
      Params: { sessionId: string };
      Body: { body: string; anchors?: unknown[]; severity?: string };
    }>;

    const reply = makeMockReply();
    const result = await handlers.submitFeedback(request, reply);

    expect(reply.status).toHaveBeenCalledWith(201);
    expect(result).toMatchObject({
      success: true,
      rollingSummary: expect.objectContaining({
        commentCount: 1,
      }),
    });
  });

  it('returns 404 when session is not found', async () => {
    const store = makeFeedbackMockStore(null, { success: true });
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      params: { sessionId: 'PIS-nonexistent' },
      body: {
        body: 'test',
        anchors: [{ kind: 'phase', phaseId: 'phase-1' }],
      },
    } as unknown as FastifyRequest<{
      Params: { sessionId: string };
      Body: { body: string; anchors?: unknown[]; severity?: string };
    }>;

    const reply = makeMockReply();
    const result = await handlers.submitFeedback(request, reply);

    expect(reply.status).toHaveBeenCalledWith(404);
    expect(result).toMatchObject({
      error: 'SESSION_NOT_FOUND',
      message: expect.stringContaining('not found'),
    });
  });

  it('returns 400 when body is empty', async () => {
    const mockEnvelope: RecordEnvelope = {
      kind: 'protocol-ide-session',
      recordId: 'PIS-001',
      payload: { kind: 'protocol-ide-session', status: 'reviewing' },
      meta: { createdAt: new Date().toISOString() },
    };
    const store = makeFeedbackMockStore(mockEnvelope, { success: true });
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      params: { sessionId: 'PIS-001' },
      body: { body: '' },
    } as unknown as FastifyRequest<{
      Params: { sessionId: string };
      Body: { body: string; anchors?: unknown[]; severity?: string };
    }>;

    const reply = makeMockReply();
    const result = await handlers.submitFeedback(request, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(result).toMatchObject({
      error: 'INVALID_FEEDBACK',
      message: expect.stringContaining('non-empty string'),
    });
  });
});

// ---------------------------------------------------------------------------
// Rolling summary retrieval
// ---------------------------------------------------------------------------

describe('ProtocolIdeHandlers — getRollingSummary', () => {
  it('returns the rolling summary for a session', async () => {
    const mockEnvelope: RecordEnvelope = {
      kind: 'protocol-ide-session',
      recordId: 'PIS-001',
      payload: {
        kind: 'protocol-ide-session',
        status: 'reviewing',
        feedbackComments: [
          {
            id: 'fb-001',
            body: 'First comment',
            anchors: [],
            submittedAt: new Date().toISOString(),
          },
        ],
        rollingIssueSummary: {
          summary: 'First comment',
          updatedAt: new Date().toISOString(),
          commentCount: 1,
        },
      },
      meta: { createdAt: new Date().toISOString() },
    };
    const store = makeFeedbackMockStore(mockEnvelope);
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      params: { sessionId: 'PIS-001' },
    } as unknown as FastifyRequest<{
      Params: { sessionId: string };
    }>;

    const reply = makeMockReply();
    const result = await handlers.getRollingSummary(request, reply);

    expect(reply.status).toHaveBeenCalledWith(200);
    expect(result).toMatchObject({
      success: true,
      rollingSummary: expect.objectContaining({
        summary: 'First comment',
        commentCount: 1,
      }),
    });
  });

  it('returns an empty summary when no feedback exists', async () => {
    const mockEnvelope: RecordEnvelope = {
      kind: 'protocol-ide-session',
      recordId: 'PIS-001',
      payload: { kind: 'protocol-ide-session', status: 'reviewing' },
      meta: { createdAt: new Date().toISOString() },
    };
    const store = makeFeedbackMockStore(mockEnvelope);
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      params: { sessionId: 'PIS-001' },
    } as unknown as FastifyRequest<{
      Params: { sessionId: string };
    }>;

    const reply = makeMockReply();
    const result = await handlers.getRollingSummary(request, reply);

    expect(reply.status).toHaveBeenCalledWith(200);
    expect(result).toMatchObject({
      success: true,
      rollingSummary: expect.objectContaining({
        summary: '',
        commentCount: 0,
      }),
    });
  });

  it('returns 404 when session is not found', async () => {
    const store = makeFeedbackMockStore(null);
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      params: { sessionId: 'PIS-nonexistent' },
    } as unknown as FastifyRequest<{
      Params: { sessionId: string };
    }>;

    const reply = makeMockReply();
    const result = await handlers.getRollingSummary(request, reply);

    expect(reply.status).toHaveBeenCalledWith(404);
    expect(result).toMatchObject({
      error: 'SESSION_NOT_FOUND',
      message: expect.stringContaining('not found'),
    });
  });
});

// ---------------------------------------------------------------------------
// Issue card generation — success
// ---------------------------------------------------------------------------

describe('ProtocolIdeHandlers — generateIssueCards', () => {
  it('generates issue cards and returns 200', async () => {
    const mockEnvelope: RecordEnvelope = {
      kind: 'protocol-ide-session',
      recordId: 'PIS-001',
      payload: {
        kind: 'protocol-ide-session',
        status: 'reviewing',
        feedbackComments: [
          {
            id: 'fb-001',
            body: 'Missing wash step',
            anchors: [],
            submittedAt: new Date().toISOString(),
          },
        ],
        rollingIssueSummary: {
          summary: 'Missing wash step',
          updatedAt: new Date().toISOString(),
          commentCount: 1,
        },
        latestDeckSummary: {
          summary: '2 of 12 deck slots in use, 1 slot conflict(s)',
          slotsInUse: 2,
          totalSlots: 12,
          labware: [],
          pinnedSlots: [],
          autoFilledSlots: [],
          conflicts: [{ slot: '1', candidates: ['96-well-plate', 'reservoir'] }],
          evidenceLinks: [],
        },
      },
      meta: { createdAt: new Date().toISOString() },
    };
    const store = makeFeedbackMockStore(mockEnvelope, { success: true });
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      params: { sessionId: 'PIS-001' },
    } as unknown as FastifyRequest<{
      Params: { sessionId: string };
    }>;

    const reply = makeMockReply();
    const result = await handlers.generateIssueCards(request, reply);

    expect(reply.status).toHaveBeenCalledWith(200);
    expect(result).toMatchObject({
      success: true,
      cardCount: expect.any(Number),
    });
    expect((result as any).cards).toBeDefined();
    expect(Array.isArray((result as any).cards)).toBe(true);
  });

  it('returns 404 when session is not found', async () => {
    const store = makeFeedbackMockStore(null, { success: true });
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      params: { sessionId: 'PIS-nonexistent' },
    } as unknown as FastifyRequest<{
      Params: { sessionId: string };
    }>;

    const reply = makeMockReply();
    const result = await handlers.generateIssueCards(request, reply);

    expect(reply.status).toHaveBeenCalledWith(404);
    expect(result).toMatchObject({
      error: 'SESSION_NOT_FOUND',
      message: expect.stringContaining('not found'),
    });
  });

  it('returns 500 when generation fails', async () => {
    const mockEnvelope: RecordEnvelope = {
      kind: 'protocol-ide-session',
      recordId: 'PIS-001',
      payload: {
        kind: 'protocol-ide-session',
        status: 'reviewing',
        feedbackComments: [
          {
            id: 'fb-002',
            body: 'Some feedback',
            anchors: [],
            submittedAt: new Date().toISOString(),
          },
        ],
      },
      meta: { createdAt: new Date().toISOString() },
    };
    const store = makeFeedbackMockStore(mockEnvelope, {
      success: false,
      error: 'database error',
    });
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      params: { sessionId: 'PIS-001' },
    } as unknown as FastifyRequest<{
      Params: { sessionId: string };
    }>;

    const reply = makeMockReply();
    const result = await handlers.generateIssueCards(request, reply);

    expect(reply.status).toHaveBeenCalledWith(500);
    expect(result).toMatchObject({
      error: 'ISSUE_CARDS_GENERATION_FAILED',
      message: expect.stringContaining('database error'),
    });
  });
});

// ---------------------------------------------------------------------------
// Issue card retrieval
// ---------------------------------------------------------------------------

describe('ProtocolIdeHandlers — getIssueCards', () => {
  it('returns the current issue cards for a session', async () => {
    const mockEnvelope: RecordEnvelope = {
      kind: 'protocol-ide-session',
      recordId: 'PIS-001',
      payload: {
        kind: 'protocol-ide-session',
        status: 'reviewing',
        issueCards: [
          {
            id: 'ic-001',
            title: 'Test card',
            body: 'Test body',
            origin: 'user',
            evidenceCitations: [],
            generatedAt: new Date().toISOString(),
          },
        ],
      },
      meta: { createdAt: new Date().toISOString() },
    };
    const store = makeFeedbackMockStore(mockEnvelope);
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      params: { sessionId: 'PIS-001' },
    } as unknown as FastifyRequest<{
      Params: { sessionId: string };
    }>;

    const reply = makeMockReply();
    const result = await handlers.getIssueCards(request, reply);

    expect(reply.status).toHaveBeenCalledWith(200);
    expect(result).toMatchObject({
      success: true,
      cardCount: 1,
    });
    expect((result as any).cards).toHaveLength(1);
    expect((result as any).cards[0].id).toBe('ic-001');
  });

  it('returns empty cards when none exist', async () => {
    const mockEnvelope: RecordEnvelope = {
      kind: 'protocol-ide-session',
      recordId: 'PIS-001',
      payload: {
        kind: 'protocol-ide-session',
        status: 'reviewing',
      },
      meta: { createdAt: new Date().toISOString() },
    };
    const store = makeFeedbackMockStore(mockEnvelope);
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      params: { sessionId: 'PIS-001' },
    } as unknown as FastifyRequest<{
      Params: { sessionId: string };
    }>;

    const reply = makeMockReply();
    const result = await handlers.getIssueCards(request, reply);

    expect(reply.status).toHaveBeenCalledWith(200);
    expect(result).toMatchObject({
      success: true,
      cardCount: 0,
    });
    expect((result as any).cards).toEqual([]);
  });

  it('returns 404 when session is not found', async () => {
    const store = makeFeedbackMockStore(null);
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      params: { sessionId: 'PIS-nonexistent' },
    } as unknown as FastifyRequest<{
      Params: { sessionId: string };
    }>;

    const reply = makeMockReply();
    const result = await handlers.getIssueCards(request, reply);

    expect(reply.status).toHaveBeenCalledWith(404);
    expect(result).toMatchObject({
      error: 'SESSION_NOT_FOUND',
      message: expect.stringContaining('not found'),
    });
  });
});

// ---------------------------------------------------------------------------
// Import source chaining — success and failure
// ---------------------------------------------------------------------------

describe('ProtocolIdeHandlers — importSource chaining', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls importSource with correct upload fields for uploaded_pdf', async () => {
    mockImportSourceFn.mockResolvedValue({
      sessionId: 'PIS-test',
      status: 'imported',
      vendorDocumentRef: null,
      ingestionJobRef: null,
      protocolImportRef: 'PROTO-001',
      extractedTextRef: 'TEXT-001',
      evidenceRefs: [],
      evidenceCitations: [],
      protocolImportState: 'ready',
      protocolImportConfidence: 0.95,
    });

    const store = makeMockStore();
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      body: {
        directiveText: 'extract protocol from uploaded PDF',
        source: {
          sourceKind: 'uploaded_pdf',
          uploadId: 'upload-abc123',
          fileName: 'protocol.pdf',
          mediaType: 'application/pdf',
          contentBase64: 'AAAA',
        },
      },
    } as unknown as FastifyRequest<{
      Body: { directiveText?: string; source?: Record<string, unknown> };
    }>;

    const reply = makeMockReply();
    const result = await handlers.createSession(request, reply);

    expect(reply.status).toHaveBeenCalledWith(201);
    expect(mockImportSourceFn).toHaveBeenCalledTimes(1);
    expect(mockImportSourceFn).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: expect.stringMatching(/^PIS-/),
        sourceKind: 'uploaded_pdf',
        upload: {
          fileName: 'protocol.pdf',
          mediaType: 'application/pdf',
          contentBase64: 'AAAA',
        },
      }),
    );
    expect(result).toMatchObject({
      success: true,
      sourceEvidenceRef: 'PROTO-001',
      graphReviewRef: null,
      issueCardsRef: null,
    });
  });

  it('returns importWarning when importSource throws', async () => {
    mockImportSourceFn.mockRejectedValue(new Error('PDF extraction failed'));

    const store = makeMockStore();
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      body: {
        directiveText: 'extract protocol from uploaded PDF',
        source: {
          sourceKind: 'uploaded_pdf',
          uploadId: 'upload-abc123',
          fileName: 'protocol.pdf',
          mediaType: 'application/pdf',
          contentBase64: 'AAAA',
        },
      },
    } as unknown as FastifyRequest<{
      Body: { directiveText?: string; source?: Record<string, unknown> };
    }>;

    const reply = makeMockReply();
    const result = await handlers.createSession(request, reply);

    // Session is still created (201) even though import failed
    expect(reply.status).toHaveBeenCalledWith(201);
    expect(mockImportSourceFn).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: true,
      sourceEvidenceRef: null,
      importWarning: 'PDF extraction failed',
    });
  });

  it('returns 409 without calling importSource when session already exists', async () => {
    mockImportSourceFn.mockResolvedValue({
      sessionId: 'PIS-test',
      status: 'imported',
      vendorDocumentRef: null,
      ingestionJobRef: null,
      protocolImportRef: 'PROTO-001',
      extractedTextRef: 'TEXT-001',
      evidenceRefs: [],
      evidenceCitations: [],
      protocolImportState: 'ready',
      protocolImportConfidence: 0.95,
    });

    const mockEnvelope: RecordEnvelope = {
      kind: 'protocol-ide-session',
      recordId: 'PIS-existing-001',
      payload: { status: 'importing' },
      meta: { createdAt: new Date().toISOString() },
    };
    const store = makeMockStore();
    (store.list as ReturnType<typeof vi.fn>).mockResolvedValue([mockEnvelope]);
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      body: {
        directiveText: 'extract protocol',
        source: {
          sourceKind: 'vendor_document',
          vendor: 'thermo',
          title: 'DNA Extraction Protocol v2',
          landingUrl: 'https://example.com/protocol',
          sessionIdHint: 'PIS-existing-001',
        },
      },
    } as unknown as FastifyRequest<{
      Body: { directiveText?: string; source?: Record<string, unknown> };
    }>;

    const reply = makeMockReply();
    const result = await handlers.createSession(request, reply);

    expect(reply.status).toHaveBeenCalledWith(409);
    expect(result).toMatchObject({
      error: 'SESSION_EXISTS',
    });
    // importSource should NOT be called when session already exists
    expect(mockImportSourceFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Projection chaining — success and failure
// ---------------------------------------------------------------------------

describe('ProtocolIdeHandlers — projection chaining', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls executeProjection with correct args on successful import', async () => {
    mockImportSourceFn.mockResolvedValue({
      sessionId: 'PIS-test',
      status: 'imported',
      vendorDocumentRef: null,
      ingestionJobRef: null,
      protocolImportRef: 'PROTO-001',
      extractedTextRef: 'TEXT-001',
      evidenceRefs: [],
      evidenceCitations: [],
      protocolImportState: 'ready',
      protocolImportConfidence: 0.95,
    });
    mockExecuteProjectionFn.mockResolvedValue({
      status: 'success',
      eventGraphData: {
        recordId: 'graph-PIS-test',
        eventCount: 5,
        description: 'Projection completed.',
      },
      projectedProtocolRef: 'proto-PIS-test',
      projectedRunRef: 'run-PIS-test',
      evidenceMap: {},
      overlaySummaries: {},
      diagnostics: [],
    });

    const store = makeMockStore();
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      body: {
        directiveText: 'extract protocol from uploaded PDF',
        source: {
          sourceKind: 'uploaded_pdf',
          uploadId: 'upload-abc123',
          fileName: 'protocol.pdf',
          mediaType: 'application/pdf',
          contentBase64: 'AAAA',
        },
      },
    } as unknown as FastifyRequest<{
      Body: { directiveText?: string; source?: Record<string, unknown> };
    }>;

    const reply = makeMockReply();
    const result = await handlers.createSession(request, reply);

    expect(reply.status).toHaveBeenCalledWith(201);
    expect(mockImportSourceFn).toHaveBeenCalledTimes(1);
    expect(mockExecuteProjectionFn).toHaveBeenCalledTimes(1);
    expect(mockExecuteProjectionFn).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionRef: expect.stringMatching(/^PIS-/),
        directiveText: 'extract protocol from uploaded PDF',
      }),
    );
    expect(result).toMatchObject({
      success: true,
      sourceEvidenceRef: 'PROTO-001',
      graphReviewRef: 'graph-PIS-test',
      issueCardsRef: null,
    });
  });

  it('returns projectionWarning when executeProjection throws', async () => {
    mockImportSourceFn.mockResolvedValue({
      sessionId: 'PIS-test',
      status: 'imported',
      vendorDocumentRef: null,
      ingestionJobRef: null,
      protocolImportRef: 'PROTO-001',
      extractedTextRef: 'TEXT-001',
      evidenceRefs: [],
      evidenceCitations: [],
      protocolImportState: 'ready',
      protocolImportConfidence: 0.95,
    });
    mockExecuteProjectionFn.mockRejectedValue(new Error('Projection failed'));

    const store = makeMockStore();
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      body: {
        directiveText: 'extract protocol from uploaded PDF',
        source: {
          sourceKind: 'uploaded_pdf',
          uploadId: 'upload-abc123',
          fileName: 'protocol.pdf',
          mediaType: 'application/pdf',
          contentBase64: 'AAAA',
        },
      },
    } as unknown as FastifyRequest<{
      Body: { directiveText?: string; source?: Record<string, unknown> };
    }>;

    const reply = makeMockReply();
    const result = await handlers.createSession(request, reply);

    // Session is still created (201) even though projection failed
    expect(reply.status).toHaveBeenCalledWith(201);
    expect(mockImportSourceFn).toHaveBeenCalledTimes(1);
    expect(mockExecuteProjectionFn).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: true,
      sourceEvidenceRef: 'PROTO-001',
      graphReviewRef: null,
      projectionWarning: 'Projection failed',
    });
  });

  it('returns projectionWarning when executeProjection returns failed status', async () => {
    mockImportSourceFn.mockResolvedValue({
      sessionId: 'PIS-test',
      status: 'imported',
      vendorDocumentRef: null,
      ingestionJobRef: null,
      protocolImportRef: 'PROTO-001',
      extractedTextRef: 'TEXT-001',
      evidenceRefs: [],
      evidenceCitations: [],
      protocolImportState: 'ready',
      protocolImportConfidence: 0.95,
    });
    mockExecuteProjectionFn.mockResolvedValue({
      status: 'failed',
      eventGraphData: {
        recordId: 'graph-PIS-test',
        eventCount: 0,
        description: 'Projection failed.',
      },
      projectedProtocolRef: null,
      projectedRunRef: null,
      evidenceMap: {},
      overlaySummaries: {},
      diagnostics: [],
    });

    const store = makeMockStore();
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      body: {
        directiveText: 'extract protocol from uploaded PDF',
        source: {
          sourceKind: 'uploaded_pdf',
          uploadId: 'upload-abc123',
          fileName: 'protocol.pdf',
          mediaType: 'application/pdf',
          contentBase64: 'AAAA',
        },
      },
    } as unknown as FastifyRequest<{
      Body: { directiveText?: string; source?: Record<string, unknown> };
    }>;

    const reply = makeMockReply();
    const result = await handlers.createSession(request, reply);

    expect(reply.status).toHaveBeenCalledWith(201);
    expect(mockImportSourceFn).toHaveBeenCalledTimes(1);
    expect(mockExecuteProjectionFn).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: true,
      sourceEvidenceRef: 'PROTO-001',
      graphReviewRef: null,
      projectionWarning: 'projection status failed',
    });
  });

  it('skips projection when sourceEvidenceRef is null and sourceKind is pasted_url', async () => {
    mockImportSourceFn.mockResolvedValue({
      sessionId: 'PIS-test',
      status: 'imported',
      vendorDocumentRef: null,
      ingestionJobRef: null,
      protocolImportRef: null,
      extractedTextRef: null,
      evidenceRefs: [],
      evidenceCitations: [],
      protocolImportState: 'ready',
      protocolImportConfidence: 0.95,
    });
    mockExecuteProjectionFn.mockResolvedValue({
      status: 'success',
      eventGraphData: {
        recordId: 'graph-PIS-test',
        eventCount: 5,
        description: 'Projection completed.',
      },
      projectedProtocolRef: 'proto-PIS-test',
      projectedRunRef: 'run-PIS-test',
      evidenceMap: {},
      overlaySummaries: {},
      diagnostics: [],
    });

    const store = makeMockStore();
    const ctx = makeMockCtx(store);
    const handlers = createProtocolIdeHandlers(ctx);

    const request = {
      body: {
        directiveText: 'extract protocol from URL',
        source: {
          sourceKind: 'pasted_url',
          url: 'https://example.com/protocol.pdf',
        },
      },
    } as unknown as FastifyRequest<{
      Body: { directiveText?: string; source?: Record<string, unknown> };
    }>;

    const reply = makeMockReply();
    const result = await handlers.createSession(request, reply);

    expect(reply.status).toHaveBeenCalledWith(201);
    expect(mockImportSourceFn).toHaveBeenCalledTimes(1);
    // executeProjection should NOT be called when sourceEvidenceRef is null and sourceKind is pasted_url
    expect(mockExecuteProjectionFn).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      sourceEvidenceRef: null,
      graphReviewRef: null,
    });
  });
});
