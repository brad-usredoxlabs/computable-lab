/**
 * End-to-end test for ProtocolIdeProjectionService with real pass chain.
 *
 * This test:
 * - Creates a mock record store with a session and extracted text record
 * - Mocks the extraction service to return a deterministic 1-candidate draft
 * - Mocks the LLM client to return a deterministic lab-context override
 * - Runs executeProjection end to end
 * - Asserts that an event-graph record is produced with at least one event
 *   carrying a populated semanticKey
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RecordStore, RecordEnvelope } from '../store/types.js';
import { ProtocolIdeProjectionService } from './ProtocolIdeProjectionService.js';
import type { ProjectionRequest } from './ProtocolIdeProjectionContracts.js';
import { buildSemanticKey } from './SemanticKeyBuilder.js';
import { derivations } from './derivations/index.js';

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
    create: vi.fn(async ({ envelope }: { envelope: RecordEnvelope; message: string }) => {
      // Ensure payload exists (some envelopes may not have it)
      const env = { ...envelope };
      if (!env.payload) {
        env.payload = env;
      }
      records.set(env.recordId, env as RecordEnvelope);
      return { success: true };
    }),
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
  sessionId: string = 'PIS-e2e-001',
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
    sessionRef: 'PIS-e2e-001',
    directiveText: 'Add 200 µL of buffer to A1',
    rollingIssueSummary: '',
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

// ---------------------------------------------------------------------------
// E2E test — full pipeline with mocked LLM and extraction
// ---------------------------------------------------------------------------

describe('ProtocolIdeProjectionService — end-to-end with real pass chain', () => {
  it('produces an event-graph record with semanticKey-bearing events', async () => {
    // 1. Build the mock store with session + extracted text
    const records = new Map<string, RecordEnvelope>();

    const session = makeMockSession();
    records.set(session.recordId, session);

    // Extracted text record — the fixture text that protocol_extract will process
    const extractedTextEnvelope: RecordEnvelope = {
      recordId: 'TEXT-001',
      kind: 'extracted-text',
      payload: {
        kind: 'extracted-text',
        content: 'Step 1: Add 200 µL of buffer to A1. Step 2: Incubate 30 minutes.',
      },
    };
    records.set(extractedTextEnvelope.recordId, extractedTextEnvelope);

    // Canonical protocol record — needed by protocol_realize (promotion)
    const canonicalProtocolEnvelope: RecordEnvelope = {
      recordId: 'PRT-canonical-001',
      kind: 'protocol',
      payload: {
        kind: 'protocol',
        recordId: 'PRT-canonical-001',
        title: 'Test Protocol',
        steps: [
          {
            stepId: 'step-1',
            kind: 'transfer',
            phaseId: 'prep',
            source: 'reservoir-A',
            target: 'A1',
            volume_ul: 200,
          },
          {
            stepId: 'step-2',
            kind: 'incubate',
            phaseId: 'incubate',
            target: 'A1',
            duration_min: 30,
            temperature_c: 37,
          },
        ],
      },
    };
    records.set(canonicalProtocolEnvelope.recordId, canonicalProtocolEnvelope);

    // Verb definitions — needed by events_emit for semanticKey
    const verbTransferEnvelope: RecordEnvelope = {
      recordId: 'VERB-TRANSFER',
      kind: 'verb-definition',
      payload: {
        kind: 'verb-definition',
        canonical: 'transfer',
        semanticInputs: [
          {
            name: 'target',
            derivedFrom: { input: 'target', fn: 'passthrough' },
            required: true,
          },
          {
            name: 'formulation',
            derivedFrom: { input: 'formulation', fn: 'solvent' },
            required: false,
          },
        ],
      },
    };
    records.set(verbTransferEnvelope.recordId, verbTransferEnvelope);

    const verbIncubateEnvelope: RecordEnvelope = {
      recordId: 'VERB-INCUBATE',
      kind: 'verb-definition',
      payload: {
        kind: 'verb-definition',
        canonical: 'incubate',
        semanticInputs: [
          {
            name: 'target',
            derivedFrom: { input: 'target', fn: 'passthrough' },
            required: true,
          },
        ],
      },
    };
    records.set(verbIncubateEnvelope.recordId, verbIncubateEnvelope);

    const store = makeMockStore(records);

    // 2. Mock extraction service — return a deterministic 1-candidate draft
    const mockExtractionResult = {
      candidates: [
        {
          target_kind: 'protocol',
          draft: {
            variant_label: 'default',
            display_name: 'Test Protocol',
            title: 'Test Protocol',
            steps: [
              {
                stepId: 'step-1',
                kind: 'transfer',
                phaseId: 'prep',
                source: 'reservoir-A',
                target: 'A1',
                volume_ul: 200,
              },
              {
                stepId: 'step-2',
                kind: 'incubate',
                phaseId: 'incubate',
                target: 'A1',
                duration_min: 30,
                temperature_c: 37,
              },
            ],
          },
          confidence: 0.95,
        },
      ],
    };

    // 3. Mock LLM client — return deterministic lab-context override
    const mockLlmClient = {
      complete: vi.fn().mockResolvedValue(JSON.stringify({
        labwareKind: '96-well-plate',
        plateCount: 1,
        sampleCount: 1,
      })),
    };

    // 4. Mock runPromotionCompile — return the canonical protocol
    const mockRunPromotionCompile = vi.fn().mockResolvedValue({
      ok: true,
      canonicalRecord: canonicalProtocolEnvelope.payload,
      diagnostics: [],
    });

    // 5. Mock loadVerbDefinition
    const verbDefs = new Map<string, { canonical: string; semanticInputs?: Array<{ name: string; derivedFrom: { input: string; fn: string }; required: boolean }> }>();
    verbDefs.set('transfer', {
      canonical: 'transfer',
      semanticInputs: [
        { name: 'target', derivedFrom: { input: 'target', fn: 'passthrough' }, required: true },
        { name: 'formulation', derivedFrom: { input: 'formulation', fn: 'solvent' }, required: false },
      ],
    });
    verbDefs.set('incubate', {
      canonical: 'incubate',
      semanticInputs: [
        { name: 'target', derivedFrom: { input: 'target', fn: 'passthrough' }, required: true },
      ],
    });
    const mockLoadVerbDefinition = vi.fn().mockImplementation(async (canonical: string) => {
      return verbDefs.get(canonical) ?? null;
    });

    // 6. Build the projection service with mocked deps
    const service = new ProtocolIdeProjectionService(store, {
      recordStore: store,
      runChunkedExtraction: async () => mockExtractionResult,
      runPromotionCompile: mockRunPromotionCompile,
      llmClient: mockLlmClient,
      ajvValidator: {
        validate: () => ({ valid: true, errors: [] }),
      },
      buildSemanticKey,
      derivations,
      loadVerbDefinition: mockLoadVerbDefinition,
    });

    // 7. Execute the projection
    const request = makeValidRequest();
    const result = await service.executeProjection(request);

    // 8. Assert results
    expect(result.status).toBe('success');
    expect(result.eventGraphData.recordId).toBeDefined();
    expect(result.eventGraphData.recordId).not.toBe('');
    expect(result.eventGraphData.eventCount).toBeGreaterThan(0);

    // 9. Verify the event-graph record was persisted with semanticKey-bearing events
    // Note: result.eventGraphData.recordId is a synthetic ID; the actual event-graph
    // record has a different ID (EVG-...). Find it by kind.
    let eventGraphEnvelope: RecordEnvelope | undefined;
    for (const [, val] of records.entries()) {
      if ((val.payload as Record<string, unknown>)?.kind === 'event-graph') {
        eventGraphEnvelope = val;
        break;
      }
    }
    expect(eventGraphEnvelope).toBeDefined();
    expect(eventGraphEnvelope?.payload?.kind).toBe('event-graph');

    const events = (eventGraphEnvelope?.payload as Record<string, unknown>)?.events as Array<Record<string, unknown>>;
    expect(events.length).toBeGreaterThan(0);

    // At least one event must have a populated semanticKey
    const eventWithSemanticKey = events.find((e) => e.semanticKey && typeof e.semanticKey === 'string' && e.semanticKey.length > 0);
    expect(eventWithSemanticKey).toBeDefined();
    expect(eventWithSemanticKey!.semanticKey).toMatch(/^EVT-/);
    expect(eventWithSemanticKey!.semanticKeyComponents).toBeDefined();
    expect(eventWithSemanticKey!.semanticKeyComponents.verb).toBeDefined();
    expect(eventWithSemanticKey!.semanticKeyComponents.phaseId).toBeDefined();
    expect(eventWithSemanticKey!.semanticKeyComponents.ordinal).toBeGreaterThan(0);
  });
});
