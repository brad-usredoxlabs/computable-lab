/**
 * L2-P1-AMBIGUITY-TIER-RULE-1 u2wire (advc D1) — the production spine factory
 * builds the tier-1 provider with NO kinds argument, so DEFAULT_KINDS is what
 * production searches; without 'labware-definition' the declared
 * candidatePrecedence rule (termKind [labware, labware-definition]) can never
 * fire. Fixture idiom mirrors providers/records.test.ts.
 */
import { describe, expect, it } from 'vitest';
import type { RecordEnvelope, RecordFilter, RecordStore, StoreResult } from '../../store/types.js';
import type { ValidationResult, LintResult } from '../../types/common.js';
import { createRecordProvider } from './records.js';

const SCHEMA = (name: string): string =>
  `https://computable-lab.com/schema/computable-lab/${name}.schema.yaml`;

/** In-memory store over seeded envelopes. list() honors {kind} filters. */
class RecordsFixtureStore implements RecordStore {
  readonly records: RecordEnvelope[];

  constructor(records: RecordEnvelope[]) {
    this.records = records;
  }

  async get(recordId: string): Promise<RecordEnvelope | null> {
    return this.records.find((r) => r.recordId === recordId) ?? null;
  }
  async getByPath(_path: string): Promise<RecordEnvelope | null> {
    return null;
  }
  async getWithValidation(_options: { recordId?: string; path?: string }): Promise<StoreResult> {
    throw new Error('not used by the record provider');
  }
  async list(filter?: RecordFilter): Promise<RecordEnvelope[]> {
    if (filter?.kind) return this.records.filter((r) => r.payload.kind === filter.kind);
    return [...this.records];
  }
  async create(_options: { envelope: RecordEnvelope; message?: string }): Promise<StoreResult> {
    return { success: true };
  }
  async update(_options: { envelope: RecordEnvelope; message?: string }): Promise<StoreResult> {
    return { success: true };
  }
  async delete(_options: { recordId: string }): Promise<StoreResult> {
    return { success: true };
  }
  async validate(_envelope: RecordEnvelope): Promise<ValidationResult> {
    return { valid: true, errors: [] };
  }
  async lint(_envelope: RecordEnvelope): Promise<LintResult> {
    return { valid: true, violations: [] };
  }
  async exists(recordId: string): Promise<boolean> {
    return this.records.some((r) => r.recordId === recordId);
  }
}

describe('record provider (tier 1) — DEFAULT_KINDS carries labware-definition (u2wire D1)', () => {
  it('the default provider (no kinds argument) surfaces a labware-definition record with its termKind', async () => {
    const store = new RecordsFixtureStore([
      {
        recordId: 'LBW-LEGACY-T2',
        schemaId: SCHEMA('labware'),
        payload: { kind: 'labware', id: 'LBW-LEGACY-T2', name: 'Well Plate A' },
      },
      // Definition records carry display_name and NO name (records.ts:36-37).
      {
        recordId: 'LBW-DEF-T2',
        schemaId: SCHEMA('labware-definition'),
        payload: { kind: 'labware-definition', id: 'LBW-DEF-T2', display_name: 'Well Plate A' },
      },
    ]);
    const provider = createRecordProvider(store); // NO kinds argument — the production shape
    const hits = await provider('well plate', 20, new AbortController().signal);
    const def = hits.find((h) => h.curie === 'local:LBW-DEF-T2');
    expect(def).toBeDefined();
    expect(def!.termKind).toBe('labware-definition');
    // DROPPING is the precedence strategy's job, not the provider's: the legacy hit must still be present.
    expect(hits.find((h) => h.curie === 'local:LBW-LEGACY-T2')).toBeDefined();
  });
});
