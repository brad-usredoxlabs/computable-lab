import { describe, expect, it } from 'vitest';
import {
  CLEAR_WINNER_MARGIN,
  hasClearWinner,
  type MaterialCandidate,
  type MaterialResolution,
} from './MaterialResolution.js';

const cand = (over: Partial<MaterialCandidate>): MaterialCandidate => ({
  id: 'x',
  label: 'x',
  ...over,
});

describe('hasClearWinner', () => {
  it('is true when the single best candidate clearly beats the runner-up', () => {
    const candidates = [
      cand({ id: 'CHEBI:5001', score: 1.0 }),
      cand({ id: 'CHEBI:9999', score: 1.0 - CLEAR_WINNER_MARGIN - 0.01 }),
    ];
    expect(hasClearWinner(candidates)).toBe(true);
  });

  it('is false when two candidates are within the margin (ambiguous)', () => {
    const candidates = [
      cand({ id: 'CHEBI:5001', score: 1.0 }),
      cand({ id: 'CHEBI:9999', score: 1.0 - 0.05 }),
    ];
    expect(hasClearWinner(candidates)).toBe(false);
  });

  it('is true for a single candidate (nothing to disambiguate)', () => {
    expect(hasClearWinner([cand({ score: 1.0 })])).toBe(true);
  });

  it('is false for empty candidate list', () => {
    expect(hasClearWinner([])).toBe(false);
  });
});

describe('MaterialResolution union', () => {
  it('models a resolved material with tier + score separately from a mint', () => {
    const resolved: MaterialResolution = {
      status: 'resolved',
      localId: 'MAT-dmso-ykg0',
      tier: 1,
      score: 1.0,
      mention: 'DMSO',
    };
    expect(resolved.status).toBe('resolved');
    expect(resolved.tier).toBe(1);
  });

  it('models a mint as new_local_proposed — NOT a resolved with score 0.4', () => {
    const minted: MaterialResolution = {
      status: 'new_local_proposed',
      mention: 'clofibrate',
      proposalId: 'MAT-clofibrate-ab12',
    };
    // Guard the invariant: a minted term never masquerades as a resolved hit.
    expect(minted.status).toBe('new_local_proposed');
    expect('score' in minted).toBe(false);
    expect('tier' in minted).toBe(false);
  });

  it('models ambiguous and unresolved outcomes', () => {
    const ambiguous: MaterialResolution = {
      status: 'ambiguous',
      candidates: [cand({ id: 'CL:0000000', score: 0.9 }), cand({ id: 'CL:0000001', score: 0.86 })],
    };
    const unresolved: MaterialResolution = { status: 'unresolved', mention: 'unknown reagent' };
    expect(ambiguous.status).toBe('ambiguous');
    expect(ambiguous.candidates.length).toBe(2);
    expect(unresolved.status).toBe('unresolved');
  });
});
