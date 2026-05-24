/**
 * Phase 6 — `mention_kind_matches` predicate.
 *
 * Asserts the predicate accepts slot-appropriate mentions, rejects
 * slot-inappropriate ones, treats empty/missing payloads as passing
 * (no mentions, no kind to mismatch), and rejects non-string fields
 * outright.
 */

import { describe, expect, it } from 'vitest';
import { evaluatePredicate } from './PredicateEvaluator.js';
import type { MentionKindMatchesPredicate } from './types.js';

function pred(
  overrides: Partial<MentionKindMatchesPredicate> = {},
): MentionKindMatchesPredicate {
  return {
    op: 'mention_kind_matches',
    path: '$.body',
    allowedKinds: ['material', 'material-spec', 'aliquot'],
    ...overrides,
  };
}

describe('mention_kind_matches predicate', () => {
  it('passes when the path is missing (no mentions, no risk)', () => {
    const res = evaluatePredicate(pred(), { other: 'thing' });
    expect(res.result).toBe(true);
  });

  it('passes when the value is an empty string', () => {
    const res = evaluatePredicate(pred(), { body: '' });
    expect(res.result).toBe(true);
  });

  it('passes when the value carries no inline mentions', () => {
    const res = evaluatePredicate(pred(), { body: 'plain text without tokens' });
    expect(res.result).toBe(true);
  });

  it('passes when every mention kind is in allowedKinds', () => {
    const body =
      'Pipette [[material:MAT-1|Tris]] then add [[aliquot:ALQ-9|stock]]';
    const res = evaluatePredicate(pred(), { body });
    expect(res.result).toBe(true);
  });

  it('fails when a mention kind is not in allowedKinds', () => {
    const body = 'Use [[material:MAT-1|Tris]] in [[labware:LBW-96|96 plate]]';
    const res = evaluatePredicate(pred(), { body });
    expect(res.result).toBe(false);
    expect(res.reason).toMatch(/labware/);
  });

  it('uses entityKind when present (material-spec vs material)', () => {
    const body = 'Use [[material-spec:SPEC-9|Buffer A]]';
    const allowSpec = evaluatePredicate(
      pred({ allowedKinds: ['material-spec'] }),
      { body },
    );
    expect(allowSpec.result).toBe(true);

    const onlyMaterial = evaluatePredicate(
      pred({ allowedKinds: ['material'] }),
      { body },
    );
    expect(onlyMaterial.result).toBe(false);
  });

  it('fails when the path resolves to a non-string', () => {
    const res = evaluatePredicate(pred(), { body: 12345 });
    expect(res.result).toBe(false);
    expect(res.reason).toMatch(/not a string/);
  });

  it('walks nested paths', () => {
    const body =
      'Plate read via [[protocol:PROT-1|qPCR]] in [[labware:LBW-96|96]]';
    const res = evaluatePredicate(
      pred({
        path: '$.payload.description',
        allowedKinds: ['protocol', 'graph-component', 'labware'],
      }),
      { payload: { description: body } },
    );
    expect(res.result).toBe(true);
  });

  it('reports the first offending mention by offset', () => {
    const body = 'A [[material:MAT-1|m]] then [[labware:LBW-1|l]]';
    const res = evaluatePredicate(
      pred({ allowedKinds: ['material'] }),
      { body },
    );
    expect(res.result).toBe(false);
    expect(res.reason).toMatch(/offset/);
  });
});
