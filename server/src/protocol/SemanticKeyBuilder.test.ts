import { describe, it, expect } from 'vitest';
import { buildSemanticKey } from './SemanticKeyBuilder.js';
import { derivations } from './derivations/index.js';

describe('buildSemanticKey', () => {
  const baseTransferVerb = {
    canonical: 'transfer',
    semanticInputs: [
      { name: 'substance', derivedFrom: { input: 'formulation', fn: 'active_ingredients' }, required: true },
      { name: 'sourceRole', derivedFrom: { input: 'source', fn: 'labware_role' }, required: true },
      { name: 'destRole', derivedFrom: { input: 'destination', fn: 'labware_role' }, required: true },
    ],
  };

  // ── Case 1: single-active transfer ──────────────────────────────────
  it('Case 1 — single-active transfer', () => {
    const result = buildSemanticKey({
      verb: baseTransferVerb,
      resolvedInputs: {
        formulation: { analyte: 'clofibrate', solvent: 'DMSO' },
        source: 'reagents-reservoir',
        destination: 'cell-plate',
      },
      phaseId: 'dose-administration',
      ordinal: 1,
      derivations,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.semanticKey).toBe(
        'EVT-transfer-clofibrate-reagents-reservoir-cell-plate-dose-administration-1',
      );
      expect(result.result.semanticKeyComponents.identity.substance).toEqual(['clofibrate']);
    }
  });

  // ── Case 2: multi-substance cocktail ────────────────────────────────
  it('Case 2 — multi-substance cocktail (sorted, joined with +)', () => {
    const result = buildSemanticKey({
      verb: baseTransferVerb,
      resolvedInputs: {
        formulation: {
          ingredients: [
            { analyte: 'gemfibrozil' },
            { analyte: 'clofibrate' },
            { analyte: 'fenofibrate' },
          ],
          solvent: 'DMSO',
        },
        source: 'reagents-reservoir',
        destination: 'cell-plate',
      },
      phaseId: 'dose-administration',
      ordinal: 1,
      derivations,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.semanticKey).toBe(
        'EVT-transfer-clofibrate-fenofibrate-gemfibrozil-reagents-reservoir-cell-plate-dose-administration-1',
      );
      expect(result.result.semanticKeyComponents.identity.substance).toEqual([
        'clofibrate',
        'fenofibrate',
        'gemfibrozil',
      ]);
    }
  });

  // ── Case 3: verb with empty semanticInputs ──────────────────────────
  it('Case 3 — verb with no semanticInputs (empty array)', () => {
    const result = buildSemanticKey({
      verb: { canonical: 'incubate', semanticInputs: [] },
      resolvedInputs: {},
      phaseId: 'incubate',
      ordinal: 1,
      derivations,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.semanticKey).toBe('EVT-incubate-incubate-1');
    }
  });

  // ── Case 4: verb with undefined semanticInputs ──────────────────────
  it('Case 4 — verb with no semanticInputs field (undefined)', () => {
    const result = buildSemanticKey({
      verb: { canonical: 'mix' } as any,
      resolvedInputs: {},
      phaseId: 'prep',
      ordinal: 2,
      derivations,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.semanticKey).toBe('EVT-mix-prep-2');
    }
  });

  // ── Case 5: auto-generated labware role passes through ──────────────
  it('Case 5 — auto-generated labware role passes through', () => {
    const result = buildSemanticKey({
      verb: baseTransferVerb,
      resolvedInputs: {
        formulation: { analyte: 'clofibrate', solvent: 'DMSO' },
        source: 'auto:reagents-reservoir:staging',
        destination: 'cell-plate',
      },
      phaseId: 'dose-administration',
      ordinal: 1,
      derivations,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.semanticKey).toContain('auto-reagents-reservoir-staging');
    }
  });

  // ── Case 6: required input missing ──────────────────────────────────
  it('Case 6 — required input missing returns ok:false', () => {
    const result = buildSemanticKey({
      verb: baseTransferVerb,
      resolvedInputs: {
        source: 'X',
        destination: 'Y',
      },
      phaseId: 'dose-administration',
      ordinal: 1,
      derivations,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/substance|formulation/i);
    }
  });

  // ── Case 7: optional input missing skips that component ─────────────
  it('Case 7 — optional input missing skips that component', () => {
    const aspirateVerb = {
      canonical: 'aspirate',
      semanticInputs: [
        { name: 'substance', derivedFrom: { input: 'formulation', fn: 'active_ingredients' }, required: false },
        { name: 'sourceRole', derivedFrom: { input: 'source', fn: 'labware_role' }, required: true },
      ],
    };

    const result = buildSemanticKey({
      verb: aspirateVerb,
      resolvedInputs: {
        source: 'waste-reservoir',
      },
      phaseId: 'cleanup',
      ordinal: 1,
      derivations,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.semanticKey).toBe('EVT-aspirate-waste-reservoir-cleanup-1');
      expect(result.result.semanticKeyComponents.identity).not.toHaveProperty('substance');
    }
  });

  // ── Case 8: unknown derivation function name ────────────────────────
  it('Case 8 — unknown derivation function name returns ok:false', () => {
    const result = buildSemanticKey({
      verb: {
        canonical: 'mix',
        semanticInputs: [
          { name: 'targetRole', derivedFrom: { input: 'target', fn: 'not_a_real_fn' }, required: true },
        ],
      },
      resolvedInputs: { target: 'plate' },
      phaseId: 'prep',
      ordinal: 1,
      derivations,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('not_a_real_fn');
    }
  });
});
