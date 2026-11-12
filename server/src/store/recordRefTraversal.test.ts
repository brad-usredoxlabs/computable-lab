// @vitest-environment node
/**
 * L2-RECORD-DELETE-DEPENDENTS-1 — characterization pins for the two
 * inverse-reference walkers (unit: d5traversal).
 *
 * These pins exist to make the refactor of the two divergent walkers into one
 * traversal a pure move: the assertions below describe TODAY's observable
 * output of `findRefFields` (GET /records/:id/related) and of the cascade
 * walker (`findReferrers` / dangling sweep), including the three measured
 * divergences:
 *   1. `findRefFields` counts a BARE STRING equal to the id; the cascade
 *      walker only counts `{ kind: 'record', id }` objects.
 *   2. `findRefFields` descends INTO a matched ref object (yielding the extra
 *      `.id` child pointer); the cascade walker stops at the match.
 *   3. the revisionRef policy: `findRefFields` reports revisionRef like any
 *      other field; the cascade walker skips it, but only at the top level —
 *      a nested `parent.revisionRef` is still reported.
 *
 * The pins are the proof: if any of them has to move, the refactor changed
 * behaviour and is wrong.
 */

import { describe, it, expect } from 'vitest';
import { findRefFields } from '../api/handlers/RelatedRecordsHandlers.js';
import { findReferrers } from './referenceCascade.js';
import { collectRefMatches } from './recordRefTraversal.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';

const TARGET = 'REC-TARGET';
const OTHER = 'REC-OTHER';

/**
 * One payload carrying every divergent case at once:
 *  (i) a ref object nested under a key,
 *  (ii) a bare string equal to the target in another field,
 *  (iii) a TOP-LEVEL revisionRef ref and a NESTED parent.revisionRef ref,
 *  (iv) an array of refs (one to the target, one to another record).
 */
const payload = {
  kind: 'experiment',
  title: 'Run 7',
  resource: { kind: 'record', id: TARGET },
  note: TARGET,
  revisionRef: { kind: 'record', id: TARGET },
  parent: { revisionRef: { kind: 'record', id: TARGET } },
  items: [
    { kind: 'record', id: TARGET },
    { kind: 'record', id: OTHER },
  ],
};

function envelope(recordId: string, body: Record<string, unknown>): RecordEnvelope {
  return { recordId, schemaId: 'https://test.com/test.schema.yaml', payload: body };
}

describe('L2-RECORD-DELETE-DEPENDENTS-1 d5traversal — findRefFields characterisation', () => {
  it('pin A: keeps the ref object pointer, the .id child pointer, bare strings, and both revisionRefs', () => {
    expect(findRefFields(payload, TARGET, '')).toEqual([
      'resource',
      'resource.id',
      'note',
      'revisionRef',
      'revisionRef.id',
      'parent.revisionRef',
      'parent.revisionRef.id',
      'items[0]',
      'items[0].id',
    ]);
  });

  it('pin B: non-matching payload yields no pointers', () => {
    expect(findRefFields({ kind: 'study', title: 'x', ref: { kind: 'record', id: OTHER } }, TARGET, '')).toEqual([]);
  });
});

describe('L2-RECORD-DELETE-DEPENDENTS-1 d5traversal — cascade consumer characterisation', () => {
  it('pin C: findReferrers reports ref-object pointers only — no .id child, no bare string, no top-level revisionRef', () => {
    const refs = findReferrers([envelope('REC-A', payload)], TARGET);
    expect(refs.map((r) => r.pointer)).toEqual(['resource', 'parent.revisionRef', 'items[0]']);
    expect(refs.map((r) => r.recordId)).toEqual(['REC-A', 'REC-A', 'REC-A']);
    expect(refs.map((r) => r.kind)).toEqual(['experiment', 'experiment', 'experiment']);
  });

  it('pin D: a bare string equal to the target is NOT a referrer for the cascade walker', () => {
    const records = [envelope('REC-B', { kind: 'note', body: TARGET })];
    expect(findReferrers(records, TARGET)).toEqual([]);
  });
});

// The option sets are the two consumers' policies, spelled out at the call
// sites they replace (RelatedRecordsHandlers / referenceCascade).
const RELATED_OPTIONS = {
  initialPointer: '',
  skipTopLevelKeys: [],
  includeBareStrings: true,
  descendIntoRefObjects: true,
} as const;

const CASCADE_OPTIONS = {
  initialPointer: '',
  skipTopLevelKeys: ['revisionRef'],
  includeBareStrings: false,
  descendIntoRefObjects: false,
} as const;

describe('L2-RECORD-DELETE-DEPENDENTS-1 d5traversal — shared traversal characterisation', () => {
  it('pin E: related-record policy reproduces findRefFields pointers exactly', () => {
    const filtered = collectRefMatches(payload, RELATED_OPTIONS).filter((m) => m.targetId === TARGET);

    expect(filtered.map((m) => m.pointer)).toEqual([
      'resource',
      'resource.id',
      'note',
      'revisionRef',
      'revisionRef.id',
      'parent.revisionRef',
      'parent.revisionRef.id',
      'items[0]',
      'items[0].id',
    ]);
    // Measurements absent from the cascade walker: the `.id` child and the
    // bare-string match, both typed as such.
    expect(filtered.find((m) => m.pointer === 'resource.id')?.via).toBe('bare-string');
    expect(filtered.find((m) => m.pointer === 'note')?.via).toBe('bare-string');
    expect(filtered.find((m) => m.pointer === 'resource')?.via).toBe('ref-object');
    // Parity with the endpoint itself — the pin is not vacuous.
    expect(filtered.map((m) => m.pointer)).toEqual(findRefFields(payload, TARGET, ''));
  });

  it('pin F: cascade policy reproduces the cascade walker matches exactly', () => {
    expect(collectRefMatches(payload, CASCADE_OPTIONS)).toEqual([
      { pointer: 'resource', targetId: TARGET, via: 'ref-object' },
      { pointer: 'parent.revisionRef', targetId: TARGET, via: 'ref-object' },
      { pointer: 'items[0]', targetId: TARGET, via: 'ref-object' },
      { pointer: 'items[1]', targetId: OTHER, via: 'ref-object' },
    ]);

    const pointers = collectRefMatches(payload, CASCADE_OPTIONS).map((m) => m.pointer);
    expect(pointers).not.toContain('revisionRef');
    expect(pointers).toContain('parent.revisionRef');
    expect(pointers).not.toContain('resource.id');
    expect(
      collectRefMatches(payload, CASCADE_OPTIONS).filter((m) => m.targetId === TARGET).map((m) => m.pointer),
    ).toEqual(findReferrers([envelope('REC-A', payload)], TARGET).map((r) => r.pointer));
  });
});
