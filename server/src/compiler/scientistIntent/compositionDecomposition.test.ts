/**
 * SHORTHAND-COMP-3 (Part I tasks 1-4): composition decomposition on the
 * SHORTHAND path.
 *
 * A mixture the scientist names ("50% trypsin-EDTA / 50% DMEM + 10% FBS with
 * 200 HepG2 cells per uL") must reach the compiler as its COMPONENTS — one
 * entry per component in `params.composition` — never as one prose blob:
 * the expander emits one `composition_snapshot` entry per component and the
 * store-write normalization in AddMaterialSupport mints one material record
 * per component plus one `complex_composition` material-spec for the mixture.
 *
 * Deviation from the plan (OQ2, orchestrator-ruled APPROVED): the plan's
 * Task 1 test 2 expected `parseScientistIntent` to THROW on a malformed
 * composition entry (`role: 42`). It does not — `params` is an open slot
 * (`scientist-intent.schema.yaml`: `additionalProperties: true`) and validates
 * nothing inside it (probe P2, re-run in this tree). Entry-level schema
 * validation is Stage B (MANIFEST re-bless). Test 2 is therefore re-scoped:
 * (a) a characterization pin that the malformed entry parses CLEAN, and
 * (b) the DEFENSIVE-DROP pin — the task-3 expander helper drops malformed
 * entries and emits no snapshot when fewer than two valid entries remain.
 */
import { describe, expect, it } from 'vitest';
import type { RecordEnvelope, RecordStore, StoreResult, GetRecordOptions } from '../../store/types.js';
import type { ValidationResult, LintResult } from '../../types/common.js';
import { parseScientistIntent } from './parseScientistIntent.js';
import { normalizeScientistIntent, MIXTURE_BLOB_MATERIAL_REASON } from './normalizeScientistIntent.js';
import { liftScientistIntent } from './liftScientistIntent.js';
import { getExpander } from '../biology/BiologyVerbExpander.js';
import '../biology/verbs/simpleVerbs.js';
import { compileShorthandDeterministically } from '../../ai/shorthandChat.js';
import { normalizeEventGraphMaterialUsage } from '../../materials/AddMaterialSupport.js';

const EVENT_GRAPH_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml';

const MIXTURE = `
intentId: seed-hepg2-composite
actions:
  - action: add_material
    labware: plate
    volumeUl: 50
    targetWells: [A1]
    params:
      composition:
        - { material: "Thermo trypsin-EDTA", role: solvent, fraction: "50%" }
        - { material: "Thermo DMEM", role: buffer_component, fraction: "50%" }
        - { material: "Thermo FBS", role: additive, fraction: "10%" }
        - { material: "HepG2 cells", role: cells, count: 10000, counterDensity: { value: 200, unit: "cells/uL" } }
`;

const COMPONENTS = [
  { material: 'Thermo trypsin-EDTA', role: 'solvent', fraction: '50%' },
  { material: 'Thermo DMEM', role: 'buffer_component', fraction: '50%' },
  { material: 'Thermo FBS', role: 'additive', fraction: '10%' },
  { material: 'HepG2 cells', role: 'cells', count: 10000, counterDensity: { value: 200, unit: 'cells/uL' } },
];

/** MemoryRecordStore — copied verbatim from AddMaterialSupport.test.ts:9-60
 *  (it is file-local there; there is no shared in-memory store module).
 *  Its list() ignores arguments, so assertions filter by payload kind. */
class MemoryRecordStore implements RecordStore {
  readonly records = new Map<string, RecordEnvelope>();
  readonly created: RecordEnvelope[] = [];

  constructor(records: RecordEnvelope[] = []) {
    for (const record of records) this.records.set(record.recordId, structuredClone(record));
  }

  async get(recordId: string): Promise<RecordEnvelope | null> {
    return structuredClone(this.records.get(recordId) ?? null);
  }

  async getByPath(_path: string): Promise<RecordEnvelope | null> {
    throw new Error('not implemented in test store');
  }

  async getWithValidation(_options: GetRecordOptions): Promise<StoreResult> {
    throw new Error('not implemented in test store');
  }

  async list(): Promise<RecordEnvelope[]> {
    return structuredClone([...this.records.values()]);
  }

  async create(options: { envelope: RecordEnvelope }): Promise<StoreResult> {
    this.records.set(options.envelope.recordId, structuredClone(options.envelope));
    this.created.push(structuredClone(options.envelope));
    return { success: true, envelope: structuredClone(options.envelope) };
  }

  async update(options: { envelope: RecordEnvelope }): Promise<StoreResult> {
    this.records.set(options.envelope.recordId, structuredClone(options.envelope));
    return { success: true, envelope: structuredClone(options.envelope) };
  }

  async delete(options: { recordId: string }): Promise<StoreResult> {
    this.records.delete(options.recordId);
    return { success: true };
  }

  async validate(_envelope: RecordEnvelope): Promise<ValidationResult> {
    return { valid: true, errors: [] };
  }

  async lint(_envelope: RecordEnvelope): Promise<LintResult> {
    return { valid: true, violations: [] };
  }

  async exists(recordId: string): Promise<boolean> {
    return this.records.has(recordId);
  }
}

describe('shorthand composition carry (task 1 — characterization pins)', () => {
  it('carries the declared components through lift + parse + normalize onto the candidate event', () => {
    // P6 semantics (post-COMP-2): the lift must NOT drop the open params slot.
    const lifted = liftScientistIntent({
      intentId: 'seed-mixture',
      actions: [{
        action: 'add_material',
        material: 'HepG2 cell suspension',
        volumeUl: 50,
        params: { composition: COMPONENTS },
      }],
    });
    const liftedAction = (lifted.actions as Array<Record<string, unknown>>)[0]!;
    expect(liftedAction.params, 'the lift must carry the open params slot').toBeDefined();
    expect(((liftedAction.params as Record<string, unknown>).composition as unknown[])).toHaveLength(4);

    const doc = parseScientistIntent(MIXTURE);
    const normalized = normalizeScientistIntent(doc);
    const add = normalized.candidateEvents.find((e) => e.verb === 'add_material');
    expect(add).toBeDefined();
    expect(Array.isArray(add!.composition)).toBe(true);
    expect((add!.composition as unknown[]).length).toBe(4);
  });

  it('a malformed composition entry (role: 42) parses CLEAN — params is an open slot (OQ2 deviation pin)', () => {
    // The plan expected a throw here; probe P2 (re-run in this tree) proves
    // `params.additionalProperties: true` validates nothing inside params.
    // Entry-level validation is Stage B. This pin records the REAL door
    // behavior so the deviation is explicit, not silent.
    const bad = MIXTURE.replace('role: solvent, fraction: "50%"', 'role: 42');
    expect(() => parseScientistIntent(bad)).not.toThrow();
    const normalized = normalizeScientistIntent(parseScientistIntent(bad));
    const add = normalized.candidateEvents.find((e) => e.verb === 'add_material');
    expect((add!.composition as unknown[]).length).toBe(4);
  });

  it('the blob bar EXEMPTS a mixture-shaped label that declares components (and bars it when it does not)', () => {
    // Reviewer bait #1: the composition form is the escape hatch COMP-1's
    // interim bar points at. The bar itself is untouched; this proves both
    // legs of its behavior against the shipped cue DATA.
    const blobLabel = '50% Thermo trypsin-EDTA / 50% Thermo DMEM + 10% FBS';
    const withComponents = `
intentId: blob-exempt
actions:
  - action: add_material
    material: "${blobLabel}"
    volumeUl: 50
    targetWells: [A1]
    params:
      composition:
        - { material: "Thermo trypsin-EDTA", role: solvent, fraction: "50%" }
        - { material: "Thermo DMEM", role: buffer_component, fraction: "50%" }
`;
    const withOut = `
intentId: blob-barred
actions:
  - action: add_material
    material: "${blobLabel}"
    volumeUl: 50
    targetWells: [A1]
`;
    const exempt = normalizeScientistIntent(parseScientistIntent(withComponents));
    const exemptReasons = (exempt.clarifications ?? []).map((c) => c.reason);
    expect(exemptReasons).not.toContain(MIXTURE_BLOB_MATERIAL_REASON);

    const barred = normalizeScientistIntent(parseScientistIntent(withOut));
    const barredReasons = (barred.clarifications ?? []).map((c) => c.reason);
    expect(barredReasons).toContain(MIXTURE_BLOB_MATERIAL_REASON);
  });
});

describe('add_material expander emits a composition snapshot (task 2 — RED)', () => {
  it('writes one entry per component, with the cells count kept as a count', () => {
    const [event] = getExpander('add_material')!.expand({
      verb: 'add_material',
      params: { labware_id: 'plate', wells: ['A1'], volume_uL: 50, composition: COMPONENTS },
    });
    const details = event!.details as Record<string, unknown>;
    const snapshot = details['composition_snapshot'] as Array<Record<string, unknown>>;
    expect(snapshot).toHaveLength(4);
    expect(details['formulation_kind']).toBe('complex_composition');
    expect((snapshot[3]!['component_ref'] as Record<string, unknown>)['label']).toBe('HepG2 cells');
    // The count NEVER collapses into a volume (the HepG2 forcing function).
    expect(details['count']).toBe(10000);
    expect((details['counter_density'] as Record<string, unknown>)['value']).toBe(200);
  });

  it('drops malformed entries defensively and emits no snapshot when fewer than two valid entries remain (OQ2 pin)', () => {
    const expandWith = (composition: unknown[]): Record<string, unknown> => {
      const [event] = getExpander('add_material')!.expand({
        verb: 'add_material',
        params: { labware_id: 'plate', wells: ['A1'], volume_uL: 50, composition },
      });
      return event!.details as Record<string, unknown>;
    };

    // A non-string component label and a non-object entry are SKIPPED; the
    // two valid entries still emit.
    const mixed = expandWith([
      COMPONENTS[0],
      COMPONENTS[1],
      { material: '   ', role: 'additive' },
      'not-an-entry',
    ]);
    expect(mixed['composition_snapshot']).toHaveLength(2);

    // A non-string role becomes 'other' — the role enum lives in
    // composition-entry.schema.yaml, not in a TS table.
    const roleCoerced = expandWith([
      { material: 'Thermo DMEM', role: 42 },
      { material: 'Thermo FBS', role: 'additive' },
    ]);
    const coerced = (roleCoerced['composition_snapshot'] as Array<Record<string, unknown>>)[0]!;
    expect(coerced['role']).toBe('other');

    // Fewer than two valid entries ⇒ no snapshot (a single component is a
    // plain add).
    const oneValid = expandWith([COMPONENTS[1], { material: '' }]);
    expect(oneValid['composition_snapshot']).toBeUndefined();
  });

  it('leaves a plain single-material add untouched', () => {
    const [event] = getExpander('add_material')!.expand({
      verb: 'add_material',
      params: { labware_id: 'plate', wells: ['A1'], volume_uL: 100, material: 'DMEM' },
    });
    expect((event!.details as Record<string, unknown>)['composition_snapshot']).toBeUndefined();
  });

  it('a no-composition expand is byte-identical to the shipped shape (additive-expander honesty)', () => {
    const [event] = getExpander('add_material')!.expand({
      verb: 'add_material',
      params: { labware_id: 'plate', wells: ['A1'], volume_uL: 50, material: 'Thermo DMEM' },
    });
    const details = event!.details as Record<string, unknown>;
    expect(Object.keys(details).sort()).toEqual(['material', 'volume', 'volumeUl', 'well']);
    expect(details).toEqual({
      well: 'A1',
      material: 'Thermo DMEM',
      volumeUl: 50,
      volume: { value: 50, unit: 'uL' },
    });
  });

  it('a one-entry composition is treated as a plain add (no snapshot)', () => {
    const [event] = getExpander('add_material')!.expand({
      verb: 'add_material',
      params: { labware_id: 'plate', wells: ['A1'], volume_uL: 50, composition: [COMPONENTS[1]] },
    });
    expect((event!.details as Record<string, unknown>)['composition_snapshot']).toBeUndefined();
  });
});

describe('the mixture becomes components + a composition spec (task 4 — reuses AddMaterialSupport, zero production change)', () => {
  it('mints one material per component and one complex_composition spec (plan Task 4 shape, stamped mixture ref)', async () => {
    const store = new MemoryRecordStore();
    const [event] = getExpander('add_material')!.expand({
      verb: 'add_material',
      params: { labware_id: 'plate', wells: ['A1'], volume_uL: 50, composition: COMPONENTS },
    });
    const payload = {
      kind: 'event-graph',
      id: 'EG-COMPOSITION-TEST',
      events: [{ ...event, details: { ...(event!.details as Record<string, unknown>),
        material_ref: { kind: 'draft', id: 'mint:HepG2 cell suspension', label: 'HepG2 cell suspension' } } }],
    };
    const out = await normalizeEventGraphMaterialUsage(store, EVENT_GRAPH_SCHEMA_ID, payload) as Record<string, unknown>;
    const details = ((out['events'] as Array<Record<string, unknown>>)[0]!['details']) as Record<string, unknown>;

    const specRef = details['material_spec_ref'] as Record<string, unknown>;
    expect(specRef).toBeDefined();
    const spec = await store.get(String(specRef['id']));
    expect(spec).not.toBeNull();
    expect((spec!.payload as Record<string, unknown>)['formulation_kind']).toBe('complex_composition');
    const composition = ((spec!.payload as Record<string, unknown>)['formulation'] as Record<string, unknown>)['composition'] as Array<Record<string, unknown>>;
    expect(composition).toHaveLength(4);

    // ONE material record per component, all real records in the store.
    // P5's fifth record: the stamped mixture-label `material_ref` grounds to
    // its OWN material too (pre-existing chain behavior at
    // normalizeAddMaterialDetailsMaterialRefs — the mixture ref itself is
    // grounded). Quote the store contents; do not massage the count.
    const all = await store.list();
    const materials = all.filter((env) => (env.payload as Record<string, unknown>)['kind'] === 'material');
    expect(materials.length).toBe(5);
    const mixtureLabelMaterial = materials.find((env) => (env.payload as Record<string, unknown>)['name'] === 'HepG2 cell suspension');
    expect(mixtureLabelMaterial, 'the stamped mixture ref mints its own material (P5)').toBeDefined();
    const components = materials.filter((env) => env.recordId !== mixtureLabelMaterial!.recordId);
    expect(components.length).toBe(4);
    for (const entry of composition) {
      const ref = entry['component_ref'] as Record<string, unknown>;
      expect(ref['kind']).toBe('record');
      expect(await store.get(String(ref['id']))).not.toBeNull();
    }
  });

  it('OQ1(a): the expander-emitted draft material_ref alone is enough — the live accept payload needs NO stamping', async () => {
    // PROBE P7 showed the chain mints NO material-spec without details.material_ref.
    // The OQ1 ruling closes that gap expander-side: addMaterialExpander now emits
    // material_ref {kind:'draft', id:'mint:<label>', label} whenever a snapshot is
    // present (label = the model's mixture name, else the joined component labels).
    const store = new MemoryRecordStore();
    const [event] = getExpander('add_material')!.expand({
      verb: 'add_material',
      params: { labware_id: 'plate', wells: ['A1'], volume_uL: 50, material: 'HepG2 cell suspension', composition: COMPONENTS },
    });
    const details = event!.details as Record<string, unknown>;
    expect(details['material_ref']).toEqual({ kind: 'draft', id: 'mint:HepG2 cell suspension', label: 'HepG2 cell suspension' });

    const out = await normalizeEventGraphMaterialUsage(store, EVENT_GRAPH_SCHEMA_ID, {
      kind: 'event-graph',
      id: 'EG-OQ1-TEST',
      events: [event],
    }) as Record<string, unknown>;
    const grounded = ((out['events'] as Array<Record<string, unknown>>)[0]!['details']) as Record<string, unknown>;
    const specRef = grounded['material_spec_ref'] as Record<string, unknown>;
    expect(specRef, 'the spec must mint from expander output alone').toBeDefined();
    const spec = await store.get(String(specRef['id']));
    expect((spec!.payload as Record<string, unknown>)['formulation_kind']).toBe('complex_composition');

    // Model omitted the mixture name ⇒ the fallback label is the joined
    // component labels (the chain's own naming idiom, not a noun literal).
    const store2 = new MemoryRecordStore();
    const [event2] = getExpander('add_material')!.expand({
      verb: 'add_material',
      params: { labware_id: 'plate', wells: ['A1'], volume_uL: 50, composition: COMPONENTS },
    });
    const ref2 = (event2!.details as Record<string, unknown>)['material_ref'] as Record<string, unknown>;
    expect(ref2['label']).toBe('Thermo trypsin-EDTA + Thermo DMEM + Thermo FBS + HepG2 cells');
    const out2 = await normalizeEventGraphMaterialUsage(store2, EVENT_GRAPH_SCHEMA_ID, {
      kind: 'event-graph',
      id: 'EG-OQ1-FALLBACK',
      events: [event2],
    }) as Record<string, unknown>;
    const specRef2 = (((out2['events'] as Array<Record<string, unknown>>)[0]!['details']) as Record<string, unknown>)['material_spec_ref'] as Record<string, unknown>;
    expect(specRef2).toBeDefined();
    expect((await store2.get(String(specRef2['id'])))).not.toBeNull();
  });
});

describe('both Brad prompts, headless end-to-end (task 4 acceptance proof)', () => {
  // The two prompts from the plan, authored as canonical `action:` documents
  // with params.composition (what the taught prompt now asks for). Run through
  // the REAL pipeline: parseScientistIntent -> compileShorthandDeterministically
  // (labware arg omitted per PROBE P8 — an empty store bars a `labware: plate`
  // noun with unknown-noun) -> per-event normalizeEventGraphMaterialUsage, the
  // same normalizer RecordHandlers.ts:506/:968 calls at record write.
  const runPrompt = async (doc: string, eventGraphId: string): Promise<{ store: MemoryRecordStore; details: Record<string, unknown> }> => {
    const compiled = await compileShorthandDeterministically(parseScientistIntent(doc), { store: new MemoryRecordStore() });
    expect(compiled, 'compile ran').not.toBeNull();
    expect(compiled!.outcome, JSON.stringify(compiled!.clarifications)).toBe('complete');
    const events = compiled!.terminalArtifacts.events as unknown as Array<Record<string, unknown>>;
    expect(events.length).toBeGreaterThan(0);

    const store = new MemoryRecordStore();
    const out = await normalizeEventGraphMaterialUsage(store, EVENT_GRAPH_SCHEMA_ID, {
      kind: 'event-graph',
      id: eventGraphId,
      events,
    }) as Record<string, unknown>;
    const details = ((out['events'] as Array<Record<string, unknown>>)[0]!['details']) as Record<string, unknown>;
    return { store, details };
  };

  const assertMixtureOutcome = async (store: MemoryRecordStore, details: Record<string, unknown>): Promise<Array<Record<string, unknown>>> => {
    const all = await store.list();
    const materials = all.filter((env) => (env.payload as Record<string, unknown>)['kind'] === 'material');
    const specs = all.filter((env) => (env.payload as Record<string, unknown>)['kind'] === 'material-spec');

    // >=4 material records + exactly 1 composition spec (acceptance criterion).
    expect(materials.length).toBeGreaterThanOrEqual(4);
    expect(specs).toHaveLength(1);
    const specPayload = specs[0]!.payload as Record<string, unknown>;
    expect(specPayload['formulation_kind']).toBe('complex_composition');
    const composition = ((specPayload['formulation'] as Record<string, unknown>)['composition']) as Array<Record<string, unknown>>;
    expect(composition).toHaveLength(4);

    // No blob material — asserted BY STRUCTURE (every component grounded to a
    // real record), never by cue literals in TS.
    for (const entry of composition) {
      const ref = entry['component_ref'] as Record<string, unknown>;
      expect(ref['kind']).toBe('record');
      expect(String(ref['id'])).toMatch(/^MAT-/);
      expect(await store.get(String(ref['id']))).not.toBeNull();
    }
    return composition;
  };

  it('prompt 1 (the ratio sentence) yields four component materials + one complex_composition spec', async () => {
    // Single target well: the existing chain upserts ONE spec per add_material
    // EVENT (implicitMaterialSpecId = MSP-DRAFT-<graphId>_<eventId>,
    // AddMaterialSupport.ts:164-168), so the headless pin of "exactly 1
    // composition spec" runs one event. A multi-well fan-out (Brad's "each
    // well") is the chain's per-event idiom — noted for the live leg.
    const { store, details } = await runPrompt(`
intentId: seed-hepg2-prompt-1
actions:
  - action: add_material
    volumeUl: 50
    targetWells: [A1]
    params:
      composition:
        - { material: "Thermo trypsin-EDTA", role: solvent, fraction: "50%" }
        - { material: "Thermo DMEM", role: buffer_component, fraction: "50%" }
        - { material: "Thermo FBS", role: additive, fraction: "10%" }
        - { material: "HepG2 cells", role: cells, count: 10000, counterDensity: { value: 200, unit: "cells/uL" } }
`, 'EG-PROMPT-1');

    const composition = await assertMixtureOutcome(store, details);
    expect(composition.map((e) => (e['component_ref'] as Record<string, unknown>)['label']).sort())
      .toEqual(['HepG2 cells', 'Thermo DMEM', 'Thermo FBS', 'Thermo trypsin-EDTA']);
    // The count stays a count on the event (acceptance criterion 3).
    expect(details['count']).toBe(10000);
    expect((details['counter_density'] as Record<string, unknown>)['value']).toBe(200);
    expect((details['counter_density'] as Record<string, unknown>)['unit']).toBe('cells/uL');
  });

  it('prompt 2 (the trypsinize/quench narrative, seed 10,000 cells) keeps count 10000 + counter_density, never a count-to-volume conversion', async () => {
    const { store, details } = await runPrompt(`
intentId: seed-hepg2-prompt-2
actions:
  - action: add_material
    volumeUl: 50
    targetWells: [A1]
    params:
      composition:
        - { material: "Thermo trypsin-EDTA", role: solvent }
        - { material: "Thermo DMEM", role: buffer_component }
        - { material: "Thermo FBS", role: additive, fraction: "10%" }
        - { material: "HepG2 cells", role: cells, count: 10000, counterDensity: { value: 200, unit: "cells/uL" } }
`, 'EG-PROMPT-2');

    await assertMixtureOutcome(store, details);
    // count 10000 + counter_density {200 cells/uL} ride the event side by side;
    // the volume stays the stated 50 uL — NO code path derived a volume from
    // the count or the density (acceptance criterion 3, the HepG2 forcing
    // function).
    expect(details['count']).toBe(10000);
    expect((details['counter_density'] as Record<string, unknown>)).toMatchObject({ value: 200, unit: 'cells/uL' });
    expect((details['volume'] as Record<string, unknown>)).toEqual({ value: 50, unit: 'uL' });
    expect(details['volumeUl']).toBe(50);
  });
});
