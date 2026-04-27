/**
 * Tests for ProtocolRealizePass.
 *
 * Covers:
 * 1. Single-variant happy path
 * 2. Multi-variant first-pick with info diagnostic
 * 3. Missing extraction-draft output
 * 4. Missing lab-context output
 * 5. Empty candidates in extraction-draft
 * 6. Promotion failure
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createProtocolRealizePass,
  type CreateProtocolRealizePassDeps,
} from './ProtocolRealizePass.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock RecordStore with configurable get/create behavior.
 */
function buildMockStore(options: {
  getResponse?: Record<string, unknown> | null;
  createResponse?: Record<string, unknown>;
} = {}): {
  get: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn().mockResolvedValue(options.getResponse ?? null),
    create: vi.fn().mockResolvedValue(options.createResponse ?? {}),
  };
}

/**
 * Build a mock runPromotionCompile that returns the given result.
 */
function buildMockPromotion(result: {
  ok: boolean;
  canonicalRecord?: Record<string, unknown>;
  diagnostics?: Array<{ message: string }>;
}) {
  return vi.fn().mockResolvedValue({
    ok: result.ok,
    canonicalRecord: result.canonicalRecord,
    diagnostics: result.diagnostics ?? [],
    passStatuses: [],
  });
}

/**
 * Build minimal deps with mocked recordStore and runPromotionCompile.
 */
function buildDeps(
  store: ReturnType<typeof buildMockStore>,
  promotion: ReturnType<typeof buildMockPromotion>,
): CreateProtocolRealizePassDeps {
  return {
    recordStore: store as any,
    runPromotionCompile: promotion,
  };
}

/**
 * Build a PipelineState with the given outputs map.
 */
function buildState(outputs: Map<string, unknown>) {
  return {
    input: {},
    context: {},
    meta: {},
    outputs,
    diagnostics: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createProtocolRealizePass', () => {
  // ------------------------------------------------------------------------
  // 1. Single-variant happy path
  // ------------------------------------------------------------------------
  it('single-variant happy path: 1 candidate, lab-context present', async () => {
    const mockStore = buildMockStore({
      getResponse: {
        payload: {
          candidates: [
            {
              target_kind: 'protocol',
              draft: { display_name: 'Test Protocol', variant_label: null },
              confidence: 0.9,
            },
          ],
        },
      },
    });
    const mockPromotion = buildMockPromotion({
      ok: true,
      canonicalRecord: { recordId: 'PRT-realized-abc123', title: 'Test Protocol' },
    });

    const pass = createProtocolRealizePass(buildDeps(mockStore, mockPromotion));

    const state = buildState(
      new Map([
        [
          'protocol_extract',
          { extractionDraftRef: 'XDR-protocol-test', candidateCount: 1, variantLabels: [] },
        ],
        [
          'lab_context_resolve',
          {
            labContext: {
              labwareKind: '96-well-plate',
              plateCount: 1,
              sampleCount: 96,
              equipmentOverrides: [],
            },
          },
        ],
      ]),
    );

    const result = await pass.run({ pass_id: 'protocol_realize', state });

    expect(result.ok).toBe(true);
    expect(result.output).toMatchObject({
      protocolRef: 'PRT-realized-abc123',
      localProtocolRef: expect.stringMatching(/^LPR-realized-/),
    });
    expect(result.diagnostics).toEqual([]);
    expect(mockPromotion).toHaveBeenCalledTimes(1);
    expect(mockStore.create).toHaveBeenCalledTimes(1);
  });

  // ------------------------------------------------------------------------
  // 2. Multi-variant first-pick with info diagnostic
  // ------------------------------------------------------------------------
  it('multi-variant: picks first variant, emits info diagnostic', async () => {
    const mockStore = buildMockStore({
      getResponse: {
        payload: {
          candidates: [
            {
              target_kind: 'protocol',
              draft: { display_name: 'Cell Culture Variant', variant_label: 'cell-culture' },
              confidence: 0.9,
            },
            {
              target_kind: 'protocol',
              draft: { display_name: 'Plant Matter Variant', variant_label: 'plant-matter' },
              confidence: 0.7,
            },
          ],
        },
      },
    });
    const mockPromotion = buildMockPromotion({
      ok: true,
      canonicalRecord: { recordId: 'PRT-realized-xyz789', title: 'Cell Culture Variant' },
    });

    const pass = createProtocolRealizePass(buildDeps(mockStore, mockPromotion));

    const state = buildState(
      new Map([
        [
          'protocol_extract',
          { extractionDraftRef: 'XDR-protocol-multi', candidateCount: 2, variantLabels: ['cell-culture', 'plant-matter'] },
        ],
        [
          'lab_context_resolve',
          {
            labContext: {
              labwareKind: '96-well-plate',
              plateCount: 1,
              sampleCount: 96,
              equipmentOverrides: [],
            },
          },
        ],
      ]),
    );

    const result = await pass.run({ pass_id: 'protocol_realize', state });

    expect(result.ok).toBe(true);
    expect(result.output).toMatchObject({
      protocolRef: 'PRT-realized-xyz789',
      localProtocolRef: expect.stringMatching(/^LPR-realized-/),
      selectedVariantLabel: 'cell-culture',
    });
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics![0]).toMatchObject({
      severity: 'info',
      code: 'protocol_realize_multivariant_auto_pick',
      message: expect.stringContaining('2 variants'),
      pass_id: 'protocol_realize',
    });
  });

  // ------------------------------------------------------------------------
  // 3. Missing extraction-draft output
  // ------------------------------------------------------------------------
  it('missing protocol_extract output → ok:false with error diagnostic', async () => {
    const mockStore = buildMockStore();
    const mockPromotion = buildMockPromotion({ ok: true });

    const pass = createProtocolRealizePass(buildDeps(mockStore, mockPromotion));

    const state = buildState(
      new Map([
        [
          'lab_context_resolve',
          {
            labContext: {
              labwareKind: '96-well-plate',
              plateCount: 1,
              sampleCount: 96,
              equipmentOverrides: [],
            },
          },
        ],
      ]),
    );

    const result = await pass.run({ pass_id: 'protocol_realize', state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics![0]).toMatchObject({
      severity: 'error',
      code: 'MISSING_UPSTREAM_OUTPUT',
      message: expect.stringContaining('protocol_extract'),
      pass_id: 'protocol_realize',
    });
    expect(mockPromotion).not.toHaveBeenCalled();
    expect(mockStore.get).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------------
  // 4. Missing lab-context output
  // ------------------------------------------------------------------------
  it('missing lab_context_resolve output → ok:false with error diagnostic', async () => {
    const mockStore = buildMockStore();
    const mockPromotion = buildMockPromotion({ ok: true });

    const pass = createProtocolRealizePass(buildDeps(mockStore, mockPromotion));

    const state = buildState(
      new Map([
        [
          'protocol_extract',
          { extractionDraftRef: 'XDR-protocol-test', candidateCount: 1, variantLabels: [] },
        ],
      ]),
    );

    const result = await pass.run({ pass_id: 'protocol_realize', state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics![0]).toMatchObject({
      severity: 'error',
      code: 'MISSING_UPSTREAM_OUTPUT',
      message: expect.stringContaining('lab_context_resolve'),
      pass_id: 'protocol_realize',
    });
    expect(mockPromotion).not.toHaveBeenCalled();
    expect(mockStore.get).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------------
  // 5. Empty candidates in extraction-draft
  // ------------------------------------------------------------------------
  it('extraction-draft with zero candidates → ok:false with diagnostic', async () => {
    const mockStore = buildMockStore({
      getResponse: {
        payload: {
          candidates: [],
        },
      },
    });
    const mockPromotion = buildMockPromotion({ ok: true });

    const pass = createProtocolRealizePass(buildDeps(mockStore, mockPromotion));

    const state = buildState(
      new Map([
        [
          'protocol_extract',
          { extractionDraftRef: 'XDR-protocol-empty', candidateCount: 0, variantLabels: [] },
        ],
        [
          'lab_context_resolve',
          {
            labContext: {
              labwareKind: '96-well-plate',
              plateCount: 1,
              sampleCount: 96,
              equipmentOverrides: [],
            },
          },
        ],
      ]),
    );

    const result = await pass.run({ pass_id: 'protocol_realize', state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics![0]).toMatchObject({
      severity: 'error',
      code: 'NO_CANDIDATES',
      message: 'extraction-draft has no candidates to realize',
      pass_id: 'protocol_realize',
    });
    expect(mockPromotion).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------------
  // 6. Promotion failure
  // ------------------------------------------------------------------------
  it('promotion failure → ok:false with diagnostic mentioning promotion', async () => {
    const mockStore = buildMockStore({
      getResponse: {
        payload: {
          candidates: [
            {
              target_kind: 'protocol',
              draft: { display_name: 'Test Protocol', variant_label: null },
              confidence: 0.9,
            },
          ],
        },
      },
    });
    const mockPromotion = buildMockPromotion({
      ok: false,
      diagnostics: [{ message: 'schema validation failed: missing required field "steps"' }],
    });

    const pass = createProtocolRealizePass(buildDeps(mockStore, mockPromotion));

    const state = buildState(
      new Map([
        [
          'protocol_extract',
          { extractionDraftRef: 'XDR-protocol-test', candidateCount: 1, variantLabels: [] },
        ],
        [
          'lab_context_resolve',
          {
            labContext: {
              labwareKind: '96-well-plate',
              plateCount: 1,
              sampleCount: 96,
              equipmentOverrides: [],
            },
          },
        ],
      ]),
    );

    const result = await pass.run({ pass_id: 'protocol_realize', state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics![0]).toMatchObject({
      severity: 'error',
      code: 'PROMOTION_FAILED',
      message: expect.stringContaining('promotion failed'),
      pass_id: 'protocol_realize',
    });
    expect(mockStore.create).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------------
  // 7. Pass has correct id and family
  // ------------------------------------------------------------------------
  it('pass has correct id and family', () => {
    const mockStore = buildMockStore();
    const mockPromotion = buildMockPromotion({ ok: true });
    const pass = createProtocolRealizePass(buildDeps(mockStore, mockPromotion));

    expect(pass.id).toBe('protocol_realize');
    expect(pass.family).toBe('expand');
  });

  // ------------------------------------------------------------------------
  // 8. Custom record ID prefixes
  // ------------------------------------------------------------------------
  it('custom recordIdPrefix values are used', async () => {
    const mockStore = buildMockStore({
      getResponse: {
        payload: {
          candidates: [
            {
              target_kind: 'protocol',
              draft: { display_name: 'Test Protocol', variant_label: null },
              confidence: 0.9,
            },
          ],
        },
      },
    });
    const mockPromotion = buildMockPromotion({
      ok: true,
      canonicalRecord: { recordId: 'CUSTOM-PROT-123', title: 'Test Protocol' },
    });

    const pass = createProtocolRealizePass(
      buildDeps(mockStore, mockPromotion),
    );

    const state = buildState(
      new Map([
        [
          'protocol_extract',
          { extractionDraftRef: 'XDR-protocol-test', candidateCount: 1, variantLabels: [] },
        ],
        [
          'lab_context_resolve',
          {
            labContext: {
              labwareKind: '96-well-plate',
              plateCount: 1,
              sampleCount: 96,
              equipmentOverrides: [],
            },
          },
        ],
      ]),
    );

    const customPass = createProtocolRealizePass({
      recordStore: mockStore as any,
      runPromotionCompile: mockPromotion,
      recordIdPrefix: { protocol: 'CUSTOM-PROT-', localProtocol: 'CUSTOM-LPR-' },
    });

    const result = await customPass.run({ pass_id: 'protocol_realize', state });

    expect(result.ok).toBe(true);
    expect(result.output).toMatchObject({
      protocolRef: 'CUSTOM-PROT-123',
      localProtocolRef: expect.stringMatching(/^CUSTOM-LPR-/),
    });
  });

  // ------------------------------------------------------------------------
  // 9. Local-protocol envelope has correct structure
  // ------------------------------------------------------------------------
  it('local-protocol envelope has required fields', async () => {
    const mockStore = buildMockStore({
      getResponse: {
        payload: {
          candidates: [
            {
              target_kind: 'protocol',
              draft: { display_name: 'Test Protocol', variant_label: null },
              confidence: 0.9,
            },
          ],
        },
      },
    });
    const mockPromotion = buildMockPromotion({
      ok: true,
      canonicalRecord: { recordId: 'PRT-realized-abc123', title: 'Test Protocol' },
    });

    const pass = createProtocolRealizePass(buildDeps(mockStore, mockPromotion));

    const state = buildState(
      new Map([
        [
          'protocol_extract',
          { extractionDraftRef: 'XDR-protocol-test', candidateCount: 1, variantLabels: [] },
        ],
        [
          'lab_context_resolve',
          {
            labContext: {
              labwareKind: '96-well-plate',
              plateCount: 1,
              sampleCount: 96,
              equipmentOverrides: [],
            },
          },
        ],
      ]),
    );

    await pass.run({ pass_id: 'protocol_realize', state });

    const createCall = mockStore.create.mock.calls[0];
    const envelope = createCall[0].envelope as Record<string, unknown>;

    expect(envelope.kind).toBe('local-protocol');
    expect(envelope.recordId).toMatch(/^LPR-realized-/);
    expect(envelope.title).toBe('Realized: Test Protocol');
    expect(envelope.inherits_from).toEqual({
      kind: 'record',
      type: 'protocol',
      id: 'PRT-realized-abc123',
    });
    expect(envelope.status).toBe('draft');
    expect(envelope.protocolLayer).toBe('lab');
  });
});
