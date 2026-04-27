/**
 * Tests for ProtocolIdeProjectionService.
 *
 * Tests:
 *  (a) Successful rerun using a deterministic fixture — session is updated
 *      with latest projection data.
 *  (b) Correct in-place session updates — latest refs, summaries, status.
 *  (c) Graceful failure behavior — session stays routable, diagnostics captured.
 *  (d) Forbidden fields in request are rejected.
 *  (e) Session not found returns failed response.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RecordStore, RecordEnvelope } from '../store/types.js';
import type { Pass } from '../compiler/pipeline/types.js';
import { ProtocolIdeProjectionService } from './ProtocolIdeProjectionService.js';
import type { ProjectionRequest } from './ProtocolIdeProjectionContracts.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockStore(
  records: Map<string, RecordEnvelope> = new Map(),
  updateResult: { success: boolean; error?: string } = { success: true },
): RecordStore {
  return {
    get: vi.fn(async (recordId: string) => records.get(recordId) ?? null),
    getByPath: vi.fn().mockResolvedValue(null),
    getWithValidation: vi.fn().mockResolvedValue({ success: true }),
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ success: true }),
    update: vi.fn(async ({ envelope }: { envelope: RecordEnvelope; message: string }) => {
      records.set(envelope.recordId, envelope as RecordEnvelope);
      return updateResult;
    }),
    delete: vi.fn().mockResolvedValue({ success: true }),
    validate: vi.fn().mockResolvedValue({ valid: true }),
    lint: vi.fn().mockResolvedValue({ valid: true }),
    exists: vi.fn().mockResolvedValue(false),
  } as unknown as RecordStore;
}

function makeMockSession(
  sessionId: string = 'PIS-test-001',
  extraPayload: Record<string, unknown> = {},
): RecordEnvelope {
  return {
    kind: 'protocol-ide-session',
    recordId: sessionId,
    payload: {
      kind: 'protocol-ide-session',
      sourceMode: 'upload',
      sourceSummary: 'Uploaded: protocol.pdf',
      latestDirectiveText: 'Extract the protocol',
      vendorDocumentRef: 'VDOC-001',
      protocolImportRef: 'PROTO-IMPORT-001',
      extractedTextRef: 'TEXT-001',
      evidenceRefs: ['cite-001'],
      evidenceCitations: [],
      ...extraPayload,
    },
    meta: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

function makeValidRequest(overrides?: Partial<ProjectionRequest>): ProjectionRequest {
  return {
    sessionRef: 'PIS-test-001',
    directiveText: 'Add 50 uL of buffer to wells B2-B4',
    rollingIssueSummary: '1 issue: wash-step volume mismatch.',
    sourceRefs: [
      {
        recordId: 'doc-extracted-text-001',
        label: 'Extracted text from source PDF',
        kind: 'document',
      },
    ],
    overlaySummaryToggles: {
      includeDeckSummary: true,
      includeToolsSummary: true,
      includeReagentsSummary: true,
      includeBudgetSummary: true,
    },
    ...overrides,
  };
}

/**
 * Build a mock store pre-populated with session + extracted text record.
 */
function makeMockStoreWithSession(session: RecordEnvelope): RecordStore {
  const records = new Map<string, RecordEnvelope>();
  records.set(session.recordId, session);
  // Add extracted text record so composePipelineInput can load it
  records.set('TEXT-001', {
    recordId: 'TEXT-001',
    kind: 'extracted-text',
    payload: {
      kind: 'extracted-text',
      content: 'Step 1: Add 50 uL of buffer to wells B2-B4.',
    },
  });
  return makeMockStore(records);
}

/**
 * Create a pass factory that echoes input through the pipeline.
 * This is used by tests that need to verify pipeline behavior
 * without running the real pass chain.
 */
function makeEchoPassFactory(): (id: string, family: string) => Pass {
  return (id, family) => ({
    id,
    family: family as Pass['family'],
    run(args: { state: { input: Record<string, unknown> } }) {
      return { ok: true, output: { pass_id: id } };
    },
  });
}

// ---------------------------------------------------------------------------
// (a) Successful rerun
// ---------------------------------------------------------------------------

describe('ProtocolIdeProjectionService — successful rerun', () => {
  it('executes a projection and returns a success response', async () => {
    const session = makeMockSession();
    const store = makeMockStoreWithSession(session);
    const service = new ProtocolIdeProjectionService(store, {} as any, {
      passFactory: makeEchoPassFactory(),
    });

    const request = makeValidRequest();
    const result = await service.executeProjection(request);

    expect(result.status).toBe('success');
    expect(result.eventGraphData.recordId).toBe('graph-PIS-test-001');
    expect(result.eventGraphData.eventCount).toBeGreaterThan(0);
    expect(result.projectedProtocolRef).toBe('proto-PIS-test-001');
    expect(result.projectedRunRef).toBe('run-PIS-test-001');
    expect(result.evidenceMap).toHaveProperty('doc-extracted-text-001');
    expect(result.overlaySummaries.deck).toBeDefined();
    expect(result.overlaySummaries.tools).toBeDefined();
    expect(result.overlaySummaries.reagents).toBeDefined();
    expect(result.overlaySummaries.budget).toBeDefined();
  });

  it('updates the session in place with latest projection data', async () => {
    const session = makeMockSession();
    const store = makeMockStoreWithSession(session);
    const service = new ProtocolIdeProjectionService(store, {} as any, {
      passFactory: makeEchoPassFactory(),
    });

    const request = makeValidRequest();
    await service.executeProjection(request);

    // Verify update was called twice: once for projecting, once for projected
    expect(store.update).toHaveBeenCalledTimes(2);
    // Check the second update call (the success update)
    const updateCall = (store.update as ReturnType<typeof vi.fn>).mock.calls[1][0];
    const updatedPayload = updateCall.envelope.payload as Record<string, unknown>;

    expect(updatedPayload.status).toBe('projected');
    expect(updatedPayload.latestProtocolRef).toBe('proto-PIS-test-001');
    expect(updatedPayload.latestEventGraphRef).toBe('graph-PIS-test-001');
    expect(updatedPayload.latestEventGraphCacheKey).toBe('graph-PIS-test-001');
    expect(updatedPayload.latestDeckSummaryRef).toBe('deck-PIS-test-001');
    expect(updatedPayload.latestToolsSummaryRef).toBe('tools-PIS-test-001');
    expect(updatedPayload.latestReagentsSummaryRef).toBe('reagents-PIS-test-001');
    expect(updatedPayload.latestBudgetSummaryRef).toBe('budget-PIS-test-001');
  });

  it('respects overlay summary toggles — omits disabled summaries', async () => {
    const session = makeMockSession();
    const store = makeMockStoreWithSession(session);
    const service = new ProtocolIdeProjectionService(store, {} as any, {
      passFactory: makeEchoPassFactory(),
    });

    const request = makeValidRequest({
      overlaySummaryToggles: {
        includeDeckSummary: false,
        includeToolsSummary: true,
        includeReagentsSummary: false,
        includeBudgetSummary: true,
      },
    });
    const result = await service.executeProjection(request);

    expect(result.overlaySummaries.deck).toBeUndefined();
    expect(result.overlaySummaries.tools).toBeDefined();
    expect(result.overlaySummaries.reagents).toBeUndefined();
    expect(result.overlaySummaries.budget).toBeDefined();
  });

  it('uses minimal toggles (all true) when no toggles provided', async () => {
    const session = makeMockSession();
    const store = makeMockStoreWithSession(session);
    const service = new ProtocolIdeProjectionService(store, {} as any, {
      passFactory: makeEchoPassFactory(),
    });

    const request = makeValidRequest({
      overlaySummaryToggles: undefined,
    });
    const result = await service.executeProjection(request);

    expect(result.overlaySummaries.deck).toBeDefined();
    expect(result.overlaySummaries.tools).toBeDefined();
    expect(result.overlaySummaries.reagents).toBeDefined();
    expect(result.overlaySummaries.budget).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// (b) Correct in-place session updates
// ---------------------------------------------------------------------------

describe('ProtocolIdeProjectionService — in-place session updates', () => {
  it('updates updatedAt timestamp on success', async () => {
    const session = makeMockSession();
    const store = makeMockStoreWithSession(session);
    const service = new ProtocolIdeProjectionService(store, {} as any, {
      passFactory: makeEchoPassFactory(),
    });

    const request = makeValidRequest();
    await service.executeProjection(request);

    const updateCall = (store.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const updatedPayload = updateCall.envelope.payload as Record<string, unknown>;
    const updatedMeta = updateCall.envelope.meta;

    expect(updatedPayload.updatedAt).toBeDefined();
    expect(updatedMeta.updatedAt).toBeDefined();
    // The updatedAt should be a valid ISO timestamp
    expect(new Date(updatedPayload.updatedAt).toISOString()).toBe(updatedPayload.updatedAt);
  });

  it('persists the latestEventGraphRef on success', async () => {
    const session = makeMockSession();
    const store = makeMockStoreWithSession(session);
    const service = new ProtocolIdeProjectionService(store, {} as any, {
      passFactory: makeEchoPassFactory(),
    });

    const request = makeValidRequest();
    await service.executeProjection(request);

    // Check the second update call (the success update)
    const updateCall = (store.update as ReturnType<typeof vi.fn>).mock.calls[1][0];
    const updatedPayload = updateCall.envelope.payload as Record<string, unknown>;

    expect(updatedPayload.latestEventGraphRef).toBe('graph-PIS-test-001');
  });

  it('persists all summary refs when toggles are enabled', async () => {
    const session = makeMockSession();
    const store = makeMockStoreWithSession(session);
    const service = new ProtocolIdeProjectionService(store, {} as any, {
      passFactory: makeEchoPassFactory(),
    });

    const request = makeValidRequest({
      overlaySummaryToggles: {
        includeDeckSummary: true,
        includeToolsSummary: true,
        includeReagentsSummary: true,
        includeBudgetSummary: true,
      },
    });
    await service.executeProjection(request);

    // Check the second update call (the success update)
    const updateCall = (store.update as ReturnType<typeof vi.fn>).mock.calls[1][0];
    const updatedPayload = updateCall.envelope.payload as Record<string, unknown>;

    expect(updatedPayload.latestDeckSummaryRef).toBe('deck-PIS-test-001');
    expect(updatedPayload.latestToolsSummaryRef).toBe('tools-PIS-test-001');
    expect(updatedPayload.latestReagentsSummaryRef).toBe('reagents-PIS-test-001');
    expect(updatedPayload.latestBudgetSummaryRef).toBe('budget-PIS-test-001');
  });
});

// ---------------------------------------------------------------------------
// (c) Graceful failure behavior
// ---------------------------------------------------------------------------

describe('ProtocolIdeProjectionService — graceful failure', () => {
  it('returns a failed response when pipeline throws', async () => {
    const session = makeMockSession();
    const store = makeMockStoreWithSession(session);
    const service = new ProtocolIdeProjectionService(store, {} as any, {
      passFactory: () => {
        throw new Error('Pipeline pass failed');
      },
    });

    const request = makeValidRequest();
    const result = await service.executeProjection(request);

    expect(result.status).toBe('failed');
    expect(result.eventGraphData.recordId).toBe('graph-PIS-test-001');
    expect(result.eventGraphData.eventCount).toBe(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].severity).toBe('error');
    expect(result.diagnostics[0].title).toBe('PROJECTION_FAILED');
    expect(result.diagnostics[0].detail).toContain('Pipeline pass failed');
  });

  it('persists failure diagnostics to the session', async () => {
    const session = makeMockSession();
    const store = makeMockStoreWithSession(session);
    const service = new ProtocolIdeProjectionService(store, {} as any, {
      passFactory: () => {
        throw new Error('Pipeline pass failed');
      },
    });

    const request = makeValidRequest();
    await service.executeProjection(request);

    // Verify update was called twice: once for projecting, once for projection_failed
    expect(store.update).toHaveBeenCalledTimes(2);
    // Check the second update call (the failure update)
    const updateCall = (store.update as ReturnType<typeof vi.fn>).mock.calls[1][0];
    const updatedPayload = updateCall.envelope.payload as Record<string, unknown>;

    expect(updatedPayload.status).toBe('projection_failed');
    expect(updatedPayload.latestProjectionDiagnostics).toBeDefined();
    expect(Array.isArray(updatedPayload.latestProjectionDiagnostics)).toBe(true);
    expect(updatedPayload.latestProjectionDiagnostics.length).toBe(1);
    expect(updatedPayload.latestProjectionDiagnostics[0].severity).toBe('error');
  });

  it('keeps the session routable after failure', async () => {
    const session = makeMockSession();
    const store = makeMockStoreWithSession(session);
    const service = new ProtocolIdeProjectionService(store, {} as any, {
      passFactory: () => {
        throw new Error('Pipeline pass failed');
      },
    });

    const request = makeValidRequest();
    await service.executeProjection(request);

    // The session should still exist and be loadable
    expect(store.get).toHaveBeenCalledWith('PIS-test-001');
    // The update should have been called (to persist diagnostics)
    expect(store.update).toHaveBeenCalled();
  });

  it('does not corrupt the source workspace on failure', async () => {
    const session = makeMockSession('PIS-test-001', {
      vendorDocumentRef: 'VDOC-001',
      protocolImportRef: 'PROTO-IMPORT-001',
      extractedTextRef: 'TEXT-001',
      evidenceRefs: ['cite-001'],
    });
    const store = makeMockStoreWithSession(session);
    const service = new ProtocolIdeProjectionService(store, {} as any, {
      passFactory: () => {
        throw new Error('Pipeline pass failed');
      },
    });

    const request = makeValidRequest();
    await service.executeProjection(request);

    // Verify the original source refs are preserved
    const updateCall = (store.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const updatedPayload = updateCall.envelope.payload as Record<string, unknown>;

    expect(updatedPayload.vendorDocumentRef).toBe('VDOC-001');
    expect(updatedPayload.protocolImportRef).toBe('PROTO-IMPORT-001');
    expect(updatedPayload.extractedTextRef).toBe('TEXT-001');
    expect(updatedPayload.evidenceRefs).toEqual(['cite-001']);
  });
});

// ---------------------------------------------------------------------------
// (d) Session not found
// ---------------------------------------------------------------------------

describe('ProtocolIdeProjectionService — session not found', () => {
  it('returns a failed response when session does not exist', async () => {
    const store = makeMockStore(new Map());
    const service = new ProtocolIdeProjectionService(store, {} as any);

    const request = makeValidRequest({ sessionRef: 'PIS-nonexistent' });
    const result = await service.executeProjection(request);

    expect(result.status).toBe('failed');
    expect(result.eventGraphData.recordId).toBe('graph-PIS-nonexistent');
    expect(result.eventGraphData.eventCount).toBe(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].severity).toBe('error');
    expect(result.diagnostics[0].detail).toContain('Session not found');
  });
});

// ---------------------------------------------------------------------------
// (e) Wrong record kind
// ---------------------------------------------------------------------------

describe('ProtocolIdeProjectionService — wrong record kind', () => {
  it('returns a failed response when the record is not a protocol-ide-session', async () => {
    const store = makeMockStore(new Map([
      ['PIS-test-001', {
        kind: 'some-other-kind',
        recordId: 'PIS-test-001',
        payload: { kind: 'some-other-kind' },
        meta: { createdAt: new Date().toISOString() },
      }],
    ]));
    const service = new ProtocolIdeProjectionService(store, {} as any);

    const request = makeValidRequest();
    const result = await service.executeProjection(request);

    expect(result.status).toBe('failed');
    expect(result.diagnostics[0].detail).toContain('not a protocol-ide-session');
  });
});

// ---------------------------------------------------------------------------
// (f) Rolling issue summary injection
// ---------------------------------------------------------------------------

describe('ProtocolIdeProjectionService — rolling issue summary', () => {
  it('includes the rolling issue summary in the pipeline input', async () => {
    const session = makeMockSession();
    const store = makeMockStoreWithSession(session);

    let capturedInput: Record<string, unknown> | undefined;
    const service = new ProtocolIdeProjectionService(store, {} as any, {
      passFactory: (id, family) => ({
        id,
        family: family as Pass['family'],
        run(args: { state: { input: Record<string, unknown> } }) {
          if (id === 'protocol_extract') {
            capturedInput = args.state.input;
          }
          return { ok: true, output: { pass_id: id } };
        },
      }),
    });

    const request = makeValidRequest({
      rollingIssueSummary: 'Prior feedback: fix volume mismatch in wash step.',
    });
    await service.executeProjection(request);

    expect(capturedInput).toBeDefined();
    expect(capturedInput!.rollingIssueSummary).toBe('Prior feedback: fix volume mismatch in wash step.');
  });
});

// ---------------------------------------------------------------------------
// (g) Directive text threading
// ---------------------------------------------------------------------------

describe('ProtocolIdeProjectionService — directive text threading', () => {
  it('threads the directive text through the pipeline input', async () => {
    const session = makeMockSession();
    const store = makeMockStoreWithSession(session);

    let capturedInput: Record<string, unknown> | undefined;
    const service = new ProtocolIdeProjectionService(store, {} as any, {
      passFactory: (id, family) => ({
        id,
        family: family as Pass['family'],
        run(args: { state: { input: Record<string, unknown> } }) {
          if (id === 'protocol_extract') {
            capturedInput = args.state.input;
          }
          return { ok: true, output: { pass_id: id } };
        },
      }),
    });

    const request = makeValidRequest({
      directiveText: 'New directive: use 384-well plate instead.',
    });
    await service.executeProjection(request);

    expect(capturedInput).toBeDefined();
    expect(capturedInput!.directiveText).toBe('New directive: use 384-well plate instead.');
  });
});

// ---------------------------------------------------------------------------
// (h) Latest-state invariant — no branching
// ---------------------------------------------------------------------------

describe('ProtocolIdeProjectionService — latest-state invariant', () => {
  it('always reads the latest session state (no branching)', async () => {
    const session = makeMockSession();
    const store = makeMockStoreWithSession(session);
    const service = new ProtocolIdeProjectionService(store, {} as any, {
      passFactory: makeEchoPassFactory(),
    });

    const request = makeValidRequest();
    await service.executeProjection(request);

    // Should call get twice: once for session, once for extracted text
    expect(store.get).toHaveBeenCalledTimes(2);
    expect(store.get).toHaveBeenCalledWith('PIS-test-001');
    expect(store.get).toHaveBeenCalledWith('TEXT-001');
  });
});

// ---------------------------------------------------------------------------
// (i) Evidence map construction
// ---------------------------------------------------------------------------

describe('ProtocolIdeProjectionService — evidence map', () => {
  it('builds evidence map from source refs', async () => {
    const session = makeMockSession();
    const store = makeMockStoreWithSession(session);
    const service = new ProtocolIdeProjectionService(store, {} as any, {
      passFactory: makeEchoPassFactory(),
    });

    const request = makeValidRequest({
      sourceRefs: [
        { recordId: 'ref-1', label: 'First source', kind: 'document' },
        { recordId: 'ref-2', label: 'Second source', kind: 'evidence' },
      ],
    });
    const result = await service.executeProjection(request);

    expect(result.evidenceMap).toHaveProperty('ref-1');
    expect(result.evidenceMap).toHaveProperty('ref-2');
    expect(result.evidenceMap['ref-1'][0].description).toBe('First source');
    expect(result.evidenceMap['ref-2'][0].description).toBe('Second source');
  });
});

// ---------------------------------------------------------------------------
// (j) Pipeline failure with diagnostics
// ---------------------------------------------------------------------------

describe('ProtocolIdeProjectionService — pipeline diagnostics', () => {
  it('converts pipeline diagnostics to compact format', async () => {
    const session = makeMockSession();
    const store = makeMockStoreWithSession(session);

    // Create a pass that emits diagnostics
    const service = new ProtocolIdeProjectionService(store, {} as any, {
      passFactory: (id, family) => ({
        id,
        family: family as Pass['family'],
        run() {
          return {
            ok: true,
            output: { pass_id: id },
            diagnostics: [
              {
                severity: 'warning',
                code: 'WELL_COUNT_MISMATCH',
                message: 'Well count exceeds pipette capacity.',
                pass_id: id,
              },
            ],
          };
        },
      }),
    });

    const request = makeValidRequest();
    const result = await service.executeProjection(request);

    expect(result.diagnostics).toHaveLength(8); // 8 passes, each emits one warning
    for (const diag of result.diagnostics) {
      expect(diag.severity).toBe('warning');
      expect(diag.title).toBe('WELL_COUNT_MISMATCH');
      expect(diag.detail).toBe('Well count exceeds pipette capacity.');
    }
  });
});
