/**
 * MATRES-PANEL gate-fix 1 (l2t0310) — AC3 defect: a kind:vendor-product local
 * record must resolve at the vendor-product level.
 *
 * Browser gate-5 measured: the vendor-product candidate VPR-L2T1315-PROBE
 * rendered under "Unspecified level" because providers/records.ts KIND_LEVEL
 * omits 'vendor-product' (the kind IS in DEFAULT_KINDS) ⇒ level 'unknown' ⇒
 * the eligibility fact-builder derives referentLevel 'unknown' ⇒ the panel
 * degrades the candidate to the unspecified arm and the vendor point-of-choice
 * disclosure (ClarificationPanel's vendor-product arm) never renders.
 *
 * This file pins the resolver-home chain the panel consumes:
 *   1. provider leg:   createRecordProvider hit.level === 'vendor-product'
 *   2. spine leg:      createResolveSpine candidate.level === 'vendor-product'
 *   3. referentLevel leg: the ELIG envelope's candidate.referentLevel (the
 *      disclosure source, resolutionEngine verdictFact) === 'vendor-product'
 *      with levelDeclared true — derived through the EXISTING alias table
 *      (materialLayerOf) + the eligibility data's levelSpellings row, exactly
 *      the OQ-1 derivation law; NO tier-as-truth, NO new mapping list.
 *
 * Fixture idiom mirrors providers/terms.test.ts + resolve/shelfLookup.test.ts
 * (in-memory store over seeded envelopes; vendor-product payload mirrors
 * schema/lab/vendor-product.schema.yaml shapes).
 */
import { describe, expect, it } from 'vitest';
import type { RecordEnvelope, RecordFilter, RecordStore, StoreResult } from '../../store/types.js';
import type { ValidationResult, LintResult } from '../../types/common.js';
import { createRecordProvider } from './records.js';
import { createResolveSpine } from '../ResolveSpine.js';
import { loadMaterialEligibility } from '../../compiler/resolution/eligibility/policy.js';
import { buildEligibilityEnvelope } from '../../compiler/resolution/eligibility/facts.js';
import type { ScientistIntentArgContract } from '../../compiler/scientistIntent/vocabulary.js';

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

/** The gate's measured candidate: VPR-L2T1315-PROBE (Trypan Blue probe). */
function fixtureRecords(): RecordEnvelope[] {
  return [
    {
      recordId: 'VPR-L2T1315-PROBE',
      schemaId: SCHEMA('vendor-product'),
      payload: {
        kind: 'vendor-product',
        id: 'VPR-L2T1315-PROBE',
        name: 'Trypan Blue probe',
        vendor: 'Sigma-Aldrich',
        catalog_number: 'TB-PROBE-1',
      },
    },
  ];
}

/** The shipped add_material `material` arg's declared allowed-set
 *  (scientist-intent-vocabulary.yaml:238 — four members ⇒ no single demanded
 *  level; the candidate's OWN level is what the panel arm reads). */
const addMaterialContract: ScientistIntentArgContract = {
  name: 'material',
  kind: 'resolvable',
  required: false,
  domain: 'material',
  levels: ['concept', 'formulation', 'vendor-product', 'instance'],
};

describe('record provider (tier 1) — vendor-product kind carries its level', () => {
  it('a kind:vendor-product record hit carries level vendor-product (not unknown)', async () => {
    const store = new RecordsFixtureStore(fixtureRecords());
    const provider = createRecordProvider(store);
    const hits = await provider('trypan blue', 20, new AbortController().signal);
    expect(hits.length).toBeGreaterThan(0);
    const hit = hits.find((h) => h.curie === 'local:VPR-L2T1315-PROBE');
    expect(hit).toBeDefined();
    expect(hit!.level).toBe('vendor-product');
  });

  it('the spine ranks the vendor-product candidate at level vendor-product', async () => {
    const store = new RecordsFixtureStore(fixtureRecords());
    const spine = createResolveSpine({
      recordProvider: createRecordProvider(store),
    });
    // localOnly: the tier-3 ols4 leg is always registered; the gate's held
    // bundle reached the panel from local tiers, so pin the local leg offline.
    const out = await spine.resolve('trypan blue', { localOnly: true });
    const candidate = out.find((c) => c.curie === 'local:VPR-L2T1315-PROBE');
    expect(candidate).toBeDefined();
    expect(candidate!.tier).toBe(1);
    expect(candidate!.level).toBe('vendor-product');
  });

  it('the ELIG envelope derives candidate.referentLevel vendor-product from the SPINE candidate (the panel disclosure source)', async () => {
    const store = new RecordsFixtureStore(fixtureRecords());
    const spine = createResolveSpine({
      recordProvider: createRecordProvider(store),
    });
    const out = await spine.resolve('trypan blue', { localOnly: true });
    const candidate = out.find((c) => c.curie === 'local:VPR-L2T1315-PROBE');
    expect(candidate).toBeDefined();
    const policy = loadMaterialEligibility();
    const envelope = buildEligibilityEnvelope({
      policy,
      candidate: candidate!,
      contract: addMaterialContract,
    });
    expect(envelope.candidate.referentLevel).toBe('vendor-product');
    expect(envelope.candidate.levelDeclared).toBe(true);
  });
});
