import { describe, expect, it } from 'vitest';
import {
  computeAssurance,
  bindingConfidence,
  type AssuranceInput,
  type CriticalBinding,
} from './assurance.js';
import type { MaterialResolution } from './MaterialResolution.js';

const resolved = (localId: string, tier: 1 | 2 | 3 | 4, score: number): MaterialResolution => ({
  status: 'resolved',
  localId,
  tier,
  score,
  mention: localId,
});

const binding = (
  mention: string,
  resolution: MaterialResolution,
  confidence?: number,
): CriticalBinding => ({
  mention,
  resolution,
  confidence: confidence ?? bindingConfidence(resolution),
});

function base(over: Partial<AssuranceInput> = {}): AssuranceInput {
  return {
    criticalBindings: [binding('DMSO', resolved('MAT-dmso', 1, 1.0))],
    materialResolutions: [resolved('MAT-dmso', 1, 1.0)],
    deterministicCompleteness: 1,
    quantityCompleteness: 1,
    validationErrorCount: 0,
    validationQuality: 1,
    unresolvedRefCount: 0,
    threshold: 0.9,
    ...over,
  };
}

describe('computeAssurance — hard gate semantics', () => {
  it('RESOLVEs a fully-resolved, clean prompt', () => {
    const r = computeAssurance(base());
    expect(r.decision).toBe('RESOLVE');
    expect(r.blockers).toEqual([]);
    expect(r.score).toBeGreaterThanOrEqual(0.95);
  });

  it('CONFIRMs on a minted local term even when aggregate would pass (weighted-average trap)', () => {
    // Simulate Brad's trap: everything strong, but the material needs minting.
    const r = computeAssurance(
      base({
        criticalBindings: [binding('clofibrate', {
          status: 'new_local_proposed',
          mention: 'clofibrate',
        })],
        materialResolutions: [{ status: 'new_local_proposed', mention: 'clofibrate' }],
        deterministicCompleteness: 1,
        quantityCompleteness: 1,
        validationQuality: 1,
      }),
    );
    expect(r.decision).toBe('CONFIRM');
    expect(r.blockers.some((f) => f.code === 'NEW_LOCAL_ENTITY')).toBe(true);
  });

  it('CONFIRMs on a critical binding below threshold even when aggregate >= 0.9 (the averaging trap)', () => {
    // Many strong-resolved benign materials push the aggregate >= 0.9, but ONE
    // critical identity binding resolved low (tier-4 vendor floor). The strong
    // score elsewhere must NOT wash out the questionable noun binding.
    const r = computeAssurance(
      base({
        criticalBindings: [
          binding('reagent', resolved('MAT-reagent', 4, 0.7), 0.7), // critical, low
          binding('buffer', resolved('MAT-buffer', 1, 1.0)),
          binding('plate', resolved('MAT-plate', 1, 1.0)),
        ],
        materialResolutions: [
          resolved('MAT-reagent', 4, 0.7),
          resolved('MAT-buffer', 1, 1.0),
          resolved('MAT-plate', 1, 1.0),
          resolved('MAT-enzyme', 1, 1.0),
        ],
        deterministicCompleteness: 1,
        quantityCompleteness: 1,
        validationQuality: 1,
      }),
    );
    // score must be HIGH (>= 0.9) to prove the aggregate alone isn't the gate
    expect(r.score).toBeGreaterThanOrEqual(0.9);
    expect(r.decision).toBe('CONFIRM');
    expect(r.blockers.some((f) => f.code === 'LOW_BINDING_CONFIDENCE')).toBe(true);
  });

  it('CONFIRMs on an unresolved reference', () => {
    const r = computeAssurance(base({ unresolvedRefCount: 1 }));
    expect(r.decision).toBe('CONFIRM');
    expect(r.blockers.some((f) => f.code === 'UNRESOLVED_REFERENCE')).toBe(true);
  });

  it('CONFIRMs on a missing required quantity', () => {
    const r = computeAssurance(base({ quantityCompleteness: 0.5 }));
    expect(r.decision).toBe('CONFIRM');
    expect(r.blockers.some((f) => f.code === 'MISSING_REQUIRED_QUANTITY')).toBe(true);
  });

  it('BLOCKs on a validation error (not a penalty)', () => {
    const r = computeAssurance(base({ validationErrorCount: 1, validationQuality: 0.9 }));
    expect(r.decision).toBe('CONFIRM');
    expect(r.blockers.some((f) => f.code === 'VALIDATION_ERROR')).toBe(true);
  });

  it('BLOCKs on a type mismatch (definition where batch required)', () => {
    const r = computeAssurance(base({ hasTypeMismatch: true }));
    expect(r.decision).toBe('CONFIRM');
    expect(r.blockers.some((f) => f.code === 'VALIDATION_ERROR')).toBe(true);
  });

  it('CONFIRMs on an ambiguity with no clear winner', () => {
    const r = computeAssurance(
      base({
        criticalBindings: [binding('CHO cells', {
          status: 'ambiguous',
          candidates: [
            { id: 'CL:0000000', label: 'a', score: 0.9 },
            { id: 'CL:0000001', label: 'b', score: 0.86 },
          ],
        })],
      }),
    );
    expect(r.decision).toBe('CONFIRM');
    expect(r.blockers.some((f) => f.code === 'AMBIGUOUS_BINDING')).toBe(true);
    expect(r.blockers.find((f) => f.code === 'AMBIGUOUS_BINDING')?.candidateIds).toEqual([
      'CL:0000000',
      'CL:0000001',
    ]);
  });

  it('lets a harmless formatting normalization pass (degrader only)', () => {
    const r = computeAssurance(base());
    expect(r.decision).toBe('RESOLVE');
    expect(r.blockers).toEqual([]);
  });

  it('drops the grounded sub-score toward zero when no resolution is resolved', () => {
    // All materials are minted/unresolved → grounded=0 → aggregate drops well
    // below threshold, but the mint blockers are what force CONFIRM.
    const r = computeAssurance(
      base({
        criticalBindings: [
          binding('a', { status: 'new_local_proposed', mention: 'a' }),
          binding('b', { status: 'unresolved', mention: 'b' }),
        ],
        materialResolutions: [
          { status: 'new_local_proposed', mention: 'a' },
          { status: 'unresolved', mention: 'b' },
        ],
        deterministicCompleteness: 1,
        quantityCompleteness: 1,
        validationQuality: 1,
      }),
    );
    expect(r.decision).toBe('CONFIRM');
    expect(r.score).toBeLessThan(0.9);
    expect(r.blockers.some((f) => f.code === 'NEW_LOCAL_ENTITY')).toBe(true);
    expect(r.blockers.some((f) => f.code === 'UNRESOLVED_REFERENCE')).toBe(true);
  });
});

describe('threshold override', () => {
  it('flips a marginal case when threshold is lowered', () => {
    const marginal = base({
      criticalBindings: [binding('reagent', resolved('MAT-reagent', 4, 0.7), 0.7)],
      materialResolutions: [resolved('MAT-reagent', 4, 0.7)],
    });
    expect(computeAssurance(marginal).decision).toBe('CONFIRM');
    // With a lower per-slot minimum, the material no longer blocks.
    expect(computeAssurance({ ...marginal, threshold: 0.8, criticalSlotMinimum: 0.6 }).decision).toBe('RESOLVE');
  });
});

describe('bindingConfidence', () => {
  it('maps resolved tiers to confidence', () => {
    expect(bindingConfidence(resolved('a', 1, 1.0))).toBe(1.0);
    expect(bindingConfidence(resolved('b', 4, 0.7))).toBe(0.7);
  });
  it('returns 0 for mint and unresolved', () => {
    expect(bindingConfidence({ status: 'new_local_proposed', mention: 'x' })).toBe(0);
    expect(bindingConfidence({ status: 'unresolved', mention: 'x' })).toBe(0);
  });
});
