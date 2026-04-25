import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../server.js';
import type { RecordStore, RecordEnvelope } from '../../store/types.js';
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
      body: { body: 'This should be in a 96-well plate layout' },
    } as unknown as FastifyRequest<{
      Params: { sessionId: string };
      Body: { body: string; graphAnchor?: unknown; sourceAnchor?: unknown; severity?: string };
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
        graphAnchor: { nodeId: 'wash-step-001', label: 'Wash step' },
      },
    } as unknown as FastifyRequest<{
      Params: { sessionId: string };
      Body: { body: string; graphAnchor?: unknown; sourceAnchor?: unknown; severity?: string };
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
        sourceAnchor: { sourceRef: 'vendor-doc-123', page: 3 },
      },
    } as unknown as FastifyRequest<{
      Params: { sessionId: string };
      Body: { body: string; graphAnchor?: unknown; sourceAnchor?: unknown; severity?: string };
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
      body: { body: 'test' },
    } as unknown as FastifyRequest<{
      Params: { sessionId: string };
      Body: { body: string; graphAnchor?: unknown; sourceAnchor?: unknown; severity?: string };
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
      Body: { body: string; graphAnchor?: unknown; sourceAnchor?: unknown; severity?: string };
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
