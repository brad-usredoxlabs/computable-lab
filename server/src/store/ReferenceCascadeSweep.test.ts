// @vitest-environment node
/**
 * L2-RECORD-DELETE-DEPENDENTS-1 UNIT 2 — Dangling-reference sweep tests.
 *
 * Test findDanglingReferences(records) against plain RecordEnvelope arrays.
 * Pin 1: missing target → reported with recordId, kind, pointer, targetId.
 * Pin 2: present target → NOT reported.
 * Pin 3: deep array element → reported with indexed pointer.
 * Pin 4: revisionRef skip → NOT reported even when target is missing.
 * Pin 5: adding the missing record → sweep returns [].
 */

import { describe, it, expect } from 'vitest';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import { findDanglingReferences } from './referenceCascade.js';

function makeEnvelope(recordId: string, payload: Record<string, unknown>): RecordEnvelope {
  return {
    recordId,
    schemaId: 'https://test.com/test.schema.yaml',
    payload: { recordId, $schema: 'https://test.com/test.schema.yaml', ...payload },
  };
}

describe('L2-RECORD-DELETE-DEPENDENTS-1 UNIT 2 — findDanglingReferences', () => {
  it('pin 1: missing target is reported', () => {
    const records: RecordEnvelope[] = [
      makeEnvelope('REC-A', {
        kind: 'experiment',
        title: 'Exp A',
        resourceRef: { kind: 'record', id: 'MISSING-1' },
      }),
    ];

    const dangling = findDanglingReferences(records);

    expect(dangling).toEqual([
      { recordId: 'REC-A', kind: 'experiment', pointer: 'resourceRef', targetId: 'MISSING-1' },
    ]);
  });

  it('pin 2: present target is NOT reported', () => {
    const records: RecordEnvelope[] = [
      makeEnvelope('REC-A', {
        kind: 'study',
        title: 'Study A',
      }),
      makeEnvelope('REC-B', {
        kind: 'experiment',
        title: 'Exp B',
        resourceRef: { kind: 'record', id: 'REC-A' },
      }),
    ];

    const dangling = findDanglingReferences(records);
    expect(dangling).toEqual([]);
  });

  it('pin 3: deep array element referencing missing target is reported with indexed pointer', () => {
    const records: RecordEnvelope[] = [
      makeEnvelope('REC-C', {
        kind: 'protocol',
        title: 'Protocol C',
        items: [
          { ref: { kind: 'record', id: 'MISSING-2' } },
        ],
      }),
    ];

    const dangling = findDanglingReferences(records);

    expect(dangling).toEqual([
      { recordId: 'REC-C', kind: 'protocol', pointer: 'items[0].ref', targetId: 'MISSING-2' },
    ]);
  });

  it('pin 4: revisionRef skip — NOT reported even when target is missing', () => {
    const records: RecordEnvelope[] = [
      makeEnvelope('REC-D', {
        kind: 'experiment',
        title: 'Exp D',
        revisionRef: { kind: 'record', id: 'MISSING-3' },
      }),
    ];

    const dangling = findDanglingReferences(records);
    expect(dangling).toEqual([]);
  });

  it('pin 5: adding the missing record makes sweep return []', () => {
    const records: RecordEnvelope[] = [
      makeEnvelope('REC-A', {
        kind: 'experiment',
        title: 'Exp A',
        resourceRef: { kind: 'record', id: 'MISSING-1' },
      }),
      // Add the previously missing target
      makeEnvelope('MISSING-1', {
        kind: 'study',
        title: 'Study 1',
      }),
    ];

    const dangling = findDanglingReferences(records);
    expect(dangling).toEqual([]);
  });
});
