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
