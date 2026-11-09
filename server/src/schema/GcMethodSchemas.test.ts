/**
 * GC-2: gc-method schema triplet + gc_fid readout vocabulary contract tests.
 *
 * Harness mirrors ControlledDocumentSchemas.test.ts: the REAL
 * loader/registry/validator/lint/UI pipeline over the real schema/ directory,
 * so this exercises exactly what the store enforces.
 *
 * RED-first record:
 *  - G4 (gcfid registry load) was RED before the ReadoutDefinitionRegistry.ts:22
 *    zod line landed (zod rejection of instrument_type 'gc_fid' at registry load)
 *    — see commit GC-2(C,E).
 *  - G2 (silent-execution block) is RED when schema/lab/gc-method.lint.yaml is
 *    absent: the record without executable_binding lints clean, so the case
 *    fails. Re-shown during development by moving the spec aside.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';
import { loadAllLintSpecs } from '../lint/LintSpecLoader.js';
import { createLintEngine } from '../lint/LintEngine.js';
import { createUISpecLoader, loadAllUISpecs } from '../ui/UISpecLoader.js';
import { getReadoutDefinitionRegistry } from '../registry/ReadoutDefinitionRegistry.js';
import { readFileSync } from 'node:fs';
import yaml from 'yaml';

const SCHEMA_ID = (name: string) =>
  `https://computable-lab.com/schema/computable-lab/${name}`;

const GCM_SCHEMA_ID = SCHEMA_ID('gc-method.schema.yaml');

const SCHEMA_DIR = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../schema',
);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A fully valid gc-method: acquisition + analysis + FAME compound refs + provenance. */
const validGcMethod = {
  kind: 'gc-method',
  id: 'GCM-FAME-STD-INJECTION',
  name: 'FAME standard injection (Wegmans butter)',
  method_name: 'WEGMANS-BUTTER-std',
  method_version: 2,
  acquisition: {
    oven: [
      { step: 1, hold_time_min: 5, ramp_rate_c_per_min: null, target_temp_c: 80 },
      { step: 2, hold_time_min: 0, ramp_rate_c_per_min: 10, target_temp_c: 250 },
      { step: 3, hold_time_min: 5, ramp_rate_c_per_min: null, target_temp_c: 250 },
    ],
    inlet: {
      mode: 'splitless',
      temp_c: 250,
      carrier_gas: 'helium',
    },
    column: {
      length_m: 30,
      id_mm: 0.25,
      film_thickness_um: 0.25,
      stationary_phase: 'HP-1 (5% phenyl methyl siloxane)',
      flow_mode: 'constant_flow',
    },
  },
  analysis: {
    global: {
      baseline_correction: 'tangent_skim',
      skim_ratio: 0.01,
      valley_to_peak_ratio: 0.05,
      peak_width_s: 2,
    },
    timed_events: [
      { at_min: 4, integration: 'on', peak_width_s: 2, area_reject_au: 0 },
      { at_min: 12, integration: 'off' },
      { at_min: 14, integration: 'on', peak_width_s: 2, area_reject_au: 0 },
    ],
    compound_assignments: [
      {
        label: 'methyl hexanoate',
        compound_ref: {
          kind: 'ontology',
          namespace: 'FAME-LOCAL',
          id: 'FAME-LOCAL:methyl-hexanoate-n6',
          label: 'Methyl hexanoate (FAME, 6:0-OMe)',
        },
        expected_rt_min: 6.2,
        rt_window_min: 0.2,
      },
      {
        label: 'methyl octanoate',
        compound_ref: {
          kind: 'ontology',
          namespace: 'FAME-LOCAL',
          id: 'FAME-LOCAL:methyl-octanoate-n8',
          label: 'Methyl octanoate (FAME, 8:0-OMe)',
        },
        expected_rt_min: 8.4,
      },
      {
        label: 'hexanoic acid (FFA)',
        compound_ref: {
          kind: 'ontology',
          namespace: 'FAME-LOCAL',
          id: 'FAME-LOCAL:hexanoic-acid-n6',
          label: 'Hexanoic acid (free fatty acid, 6:0)',
        },
        expected_rt_min: 10.1,
      },
    ],
    calibration: {
      istd_ref: { kind: 'record', type: 'material', id: 'MAT-ISTD-1' },
      istd_amount: { value: 10, unit: 'µg' },
      dilution_factor: 2,
      multiplier: 1,
      calibration_levels: [
        { kind: 'record', type: 'material', id: 'MAT-LEVEL-1' },
        { kind: 'record', type: 'material', id: 'MAT-LEVEL-2' },
      ],
    },
    // Executable-use gate: declared (case 1). Case 2 removes it.
    executable_binding: {
      engine_ref: { kind: 'record', type: 'equipment', id: 'EQP-AGILENT-6890' },
      declared_at: '2026-10-26T01:00:00.000Z',
    },
  },
  provenance_capture: {
    entered_by: { kind: 'record', type: 'person', id: 'PER-BRAD' },
    source_files: [
      {
        file: '20201023-WEGMANS-BUTTER.D',
        role: 'acq_txt',
        key_values: [
          { key: 'MethodName', raw_value: 'WEGMANS-BUTTER-std' },
          { key: 'MethodVersion', raw_value: '2' },
        ],
      },
      { file: 'method.iq1', role: 'iq1_mth' },
    ],
  },
};

// ---------------------------------------------------------------------------
// Shared pipeline (same pattern as ControlledDocumentSchemas.test.ts)
// ---------------------------------------------------------------------------

let validator: ReturnType<typeof createValidator>;
let registry: ReturnType<typeof createSchemaRegistry>;
let lintEngine: ReturnType<typeof createLintEngine>;

async function lintRecord(data: unknown): Promise<ReturnType<ReturnType<typeof createLintEngine>['lint']>> {
  const engine = createLintEngine();
  const loaded = await loadAllLintSpecs({ basePath: SCHEMA_DIR, recursive: true });
  for (const s of loaded.specs) engine.addSpec(s.name, s.spec);
  return engine.lint(data, GCM_SCHEMA_ID);
}

beforeAll(async () => {
  const loaded = await loadAllSchemas({ basePath: SCHEMA_DIR, recursive: true });
  registry = createSchemaRegistry();
  registry.addSchemas(loaded.entries);
  validator = createValidator();
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema as never, id);
  }

  const lintLoaded = await loadAllLintSpecs({ basePath: SCHEMA_DIR, recursive: true });
  lintEngine = createLintEngine();
  for (const s of lintLoaded.specs) lintEngine.addSpec(s.name, s.spec);
});

// ---------------------------------------------------------------------------
// 1. Schema: valid + rejection shapes
// ---------------------------------------------------------------------------

describe('gc-method schema (G1, G6)', () => {
  it('G1: a valid full gc-method (acquisition + analysis + FAME refs + provenance) validates', () => {
    const ok = validator.validate(validGcMethod, GCM_SCHEMA_ID);
    expect(ok.errors ?? []).toEqual([]);
    expect(ok.valid).toBe(true);
  });

  it('G1b: acquisition and analysis are optional (absent = unknown, never a default)', () => {
    const minimal = {
      kind: 'gc-method',
      id: 'GCM-MINIMAL',
      name: 'Minimal method',
      method_version: 1,
    };
    const ok = validator.validate(minimal, GCM_SCHEMA_ID);
    expect(ok.errors ?? []).toEqual([]);
    expect(ok.valid).toBe(true);
  });

  it('rejects a missing method_version / wrong id pattern', () => {
    const noVersion = { ...validGcMethod };
    delete noVersion.method_version;
    expect(validator.validate(noVersion, GCM_SCHEMA_ID).valid).toBe(false);

    const badId = { ...validGcMethod, id: 'METHOD-1' };
    expect(validator.validate(badId, GCM_SCHEMA_ID).valid).toBe(false);
  });

  it('G6: an oven step with an unknown extra key is rejected (unevaluatedProperties:false)', () => {
    const withExtra = {
      ...validGcMethod,
      acquisition: {
        ...validGcMethod.acquisition,
        oven: [
          { step: 1, hold_time_min: 5, target_temp_c: 80, extra_key: 'nope' },
        ],
      },
    };
    const ok = validator.validate(withExtra, GCM_SCHEMA_ID);
    expect(ok.valid).toBe(false);
    expect(
      (ok.errors ?? []).some(e => (e.path ?? '').includes('oven')),
    ).toBe(true);
  });

  it('G6b: an unknown top-level key is rejected', () => {
    const ok = validator.validate({ ...validGcMethod, sneaky: true }, GCM_SCHEMA_ID);
    expect(ok.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Lint: the silent-execution block
// ---------------------------------------------------------------------------

describe('gc-method lint (G2)', () => {
  it('G2-pre: with executable_binding, the full record lints clean', async () => {
    const result = await lintRecord(validGcMethod);
    expect(result.violations).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('G2: timed_events WITHOUT executable_binding → lint ERROR (schema still valid)', async () => {
    const noBinding = {
      ...validGcMethod,
      analysis: { ...validGcMethod.analysis },
    };
    delete (noBinding.analysis as { executable_binding?: unknown }).executable_binding;

    // The record is still SCHEMA-valid (capture is legal).
    expect(validator.validate(noBinding, GCM_SCHEMA_ID).valid).toBe(true);

    // But lint blocks silent executable use.
    const result = await lintRecord(noBinding);
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBe(1);
    expect(result.violations[0].ruleId).toBe('gcmethod-timed-events-require-executable-binding');
    expect(result.violations[0].severity).toBe('error');
  });

  it('G2b: no timed_events → no violation even without executable_binding', async () => {
    const noEvents = {
      ...validGcMethod,
      analysis: {
        global: validGcMethod.analysis.global,
        compound_assignments: validGcMethod.analysis.compound_assignments,
      },
    };
    const result = await lintRecord(noEvents);
    expect(result.violations).toEqual([]);
  });

  it('the lint spec itself loads with zero load errors for gc-method', async () => {
    const loaded = await loadAllLintSpecs({ basePath: SCHEMA_DIR, recursive: true });
    const bad = loaded.errors.filter(e => e.path.includes('gc-method.lint.yaml'));
    expect(bad).toEqual([]);
    const spec = loaded.specs.find(s => s.spec.schemaId === GCM_SCHEMA_ID);
    expect(spec).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Ref path: dangling / malformed ontology refs (shape-level, per the
//    existing mechanism — ref.schema.yaml's ontology branch requires
//    namespace + id + label; unknown ontology ids have no schema-level
//    existence check, same as MechanismModelSchemas.test.ts:164)
// ---------------------------------------------------------------------------

describe('gc-method compound_ref (G3)', () => {
  it('G3: an ontology compound_ref without namespace is rejected (ref shape)', () => {
    const dangling = {
      ...validGcMethod,
      analysis: {
        ...validGcMethod.analysis,
        compound_assignments: [
          {
            label: 'unknown',
            compound_ref: {
              kind: 'ontology',
              id: 'CHEBI:00000',
              label: 'unknown compound',
            },
          },
        ],
      },
    };
    const ok = validator.validate(dangling, GCM_SCHEMA_ID);
    expect(ok.valid).toBe(false);
    expect(
      (ok.errors ?? []).some(e => (e.path ?? '').includes('compound_ref')),
    ).toBe(true);
  });

  it('G3b: a record compound_ref without type is rejected (ref shape)', () => {
    const dangling = {
      ...validGcMethod,
      analysis: {
        ...validGcMethod.analysis,
        compound_assignments: [
          { label: 'unknown', compound_ref: { kind: 'record', id: 'MAT-X' } },
        ],
      },
    };
    const ok = validator.validate(dangling, GCM_SCHEMA_ID);
    expect(ok.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. gc_fid readout vocabulary
// ---------------------------------------------------------------------------

describe('gc_fid readout vocabulary (G4)', () => {
  it('G4: gcfid-peak-area.yaml loads and the registry includes RDEF-GCFID-PEAK_AREA', () => {
    const reg = getReadoutDefinitionRegistry();
    const entry = reg.get('RDEF-GCFID-PEAK_AREA');
    expect(entry).toBeDefined();
    expect(entry!.name).toBe('GC-FID Peak Area');
    expect(entry!.instrument_type).toBe('gc_fid');
    expect(entry!.mode).toBe('peak_area');
  });

  it('G4b: the readout-definition schema accepts gc_fid instrument_type', () => {
    const payload = {
      kind: 'readout-definition',
      id: 'RDEF-TEST-FID',
      name: 'Test FID readout',
      instrument_type: 'gc_fid',
      mode: 'peak_area',
    };
    const ok = validator.validate(
      payload,
      SCHEMA_ID('readout-definition.schema.yaml'),
    );
    expect(ok.errors ?? []).toEqual([]);
    expect(ok.valid).toBe(true);
  });

  it('G4c: an unknown instrument_type (fid) is still rejected', () => {
    const payload = {
      kind: 'readout-definition',
      id: 'RDEF-TEST-FID-BAD',
      name: 'Test FID readout (bad)',
      instrument_type: 'fid',
      mode: 'peak_area',
    };
    const ok = validator.validate(
      payload,
      SCHEMA_ID('readout-definition.schema.yaml'),
    );
    expect(ok.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. UI spec
// ---------------------------------------------------------------------------

/**
 * FIX-1 renderability assertions (browser gate 2026-10-26T03:50:58, D1+D2):
 * read the RAW ui.yaml so the assertions bind to the declaration itself:
 *  - D1: no slot may bind an OBJECT or ARRAY value with a scalar widget
 *    (WidgetRenderer textarea prints String(object) -> "[object Object]").
 *  - D2: documentMapper.ts:171 renders ONLY kind:'section' blocks; the
 *    kind:repeater blocks never reach the DOM, so array-of-object slots must
 *    be claimed inside section blocks as widget:'array' + properties
 *    (documentMapper.ts:228 builds arraySchema from slot.properties).
 *  - ArrayWidget (app/src/editor/taptab/widgets/ArrayWidget.tsx) formats
 *    object array items as key: value lines — never String(object).
 */

const UI_YAML_PATH = join(SCHEMA_DIR, 'lab', 'gc-method.ui.yaml');

interface RawSlot {
  id: string;
  path: string;
  label: string;
  widget: string;
  properties?: Array<{
    name: string;
    widget: string;
    label: string;
    help?: string;
    required?: boolean;
    options?: Array<{ value: string; label: string }>;
  }>;
  /** W2 C1: the loader-honored item-hint dialect (the projection forwards
   *  slot.items; the decorative `properties:` above is the inert shape).
   *  Mirrors the house FieldHint spelling (path per field). */
  items?: {
    path: string;
    widget: string;
    label?: string;
    fields?: Array<{
      path: string;
      widget: string;
      label?: string;
      help?: string;
      required?: boolean;
      refKind?: string;
      options?: Array<{ value: string; label: string }>;
      props?: Record<string, unknown>;
      fields?: unknown[];
    }>;
  };
  refKind?: string;
}
interface RawBlock {
  id: string;
  kind: string;
  label: string;
  slots?: string[];
}

async function loadRawUi(): Promise<{
  editor: { blocks: RawBlock[]; slots: RawSlot[] };
  schemaId: string;
}> {
  const parsed = yaml.parse(readFileSync(UI_YAML_PATH, 'utf8')) as {
    schemaId: string;
    editor: { blocks: RawBlock[]; slots: RawSlot[] };
  };
  return parsed;
}

/** Widgets whose bound value is a structured object BY DESIGN (rendered via
 *  the ref path, never String(object)) — exempt from the D1 scalar rule. */
const REF_WIDGETS = new Set(['ref', 'reflist', 'record-ref']);

function fixtureValueAt(path: string): unknown {
  return path.replace(/^\$\./, '').split('.').reduce<unknown>(
    (acc, part) =>
      acc !== null && typeof acc === 'object'
        ? (acc as Record<string, unknown>)[part]
        : undefined,
    validGcMethod,
  );
}

describe('gc-method ui (G5)', () => {
  it('G5: gc-method.ui.yaml loads with zero loader errors (every slot claimed)', async () => {
    const loader = createUISpecLoader();
    const result = await loadAllUISpecs(loader, SCHEMA_DIR);
    const mine = result.errors.filter(e => e.path.includes('gc-method.ui.yaml'));
    expect(mine).toEqual([]);
  });

  it('G5a (D1): every scalar-widget slot binds a scalar in the valid fixture; no [object Object]', async () => {
    const { editor } = await loadRawUi();
    const offenders: string[] = [];
    for (const slot of editor.slots) {
      const value = fixtureValueAt(slot.path);
      if (value === undefined || value === null) continue; // optional leaf: empty, not [object Object]
      const isContainer =
        (typeof value === 'object' && !Array.isArray(value)) || Array.isArray(value);
      if (isContainer && slot.widget !== 'array' && !REF_WIDGETS.has(slot.widget)) {
        offenders.push(`${slot.id} (${slot.path}: ${slot.widget})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('G5b (D2): no kind:repeater block — the app render path skips non-section blocks', async () => {
    const { editor } = await loadRawUi();
    const repeaters = editor.blocks.filter(b => b.kind !== 'section');
    expect(repeaters).toEqual([]);
  });

  it('G5c (D2): array-of-object paths are claimed by section blocks as widget:array slots', async () => {
    const { editor } = await loadRawUi();
    const byPath = new Map(editor.slots.map((s) => [s.path, s]));
    for (const p of [
      '$.acquisition.oven',
      '$.analysis.timed_events',
      '$.analysis.compound_assignments',
      '$.provenance_capture.source_files',
      '$.analysis.calibration.calibration_levels',
    ]) {
      const slot = byPath.get(p);
      expect(slot, `slot for ${p}`).toBeDefined();
      expect(slot!.widget, `${p} widget`).toBe('array');
      const block = editor.blocks.find((b) => b.slots?.includes(slot!.id));
      expect(block, `section block claiming ${p}`).toBeDefined();
      expect(block!.kind).toBe('section');
      // The slot is claimed EXACTLY ONCE (loader enforces; assert here too).
      expect(
        editor.blocks.filter((b) => b.slots?.includes(slot!.id)).length,
      ).toBe(1);
    }
  });

  it('G5d (D1/D2): array slots declare the schema-declared sub-field properties (name/widget/label/help/required)', async () => {
    const { editor } = await loadRawUi();
    const byId = new Map(editor.slots.map((s) => [s.id, s]));

    const oven = editor.blocks.find(b => b.id === 'oven-program')!;
    expect(oven.kind).toBe('section');
    expect(oven.slots).toEqual(['oven-steps-slot']);
    const ovenSteps = byId.get('oven-steps-slot')!;
    expect(ovenSteps.path).toBe('$.acquisition.oven');
    expect(ovenSteps.widget).toBe('array');
    expect(
      (ovenSteps.properties ?? []).map((p) => [p.name, p.widget, p.required]),
    ).toEqual([
      ['step', 'number', true],
      ['hold_time_min', 'number', true],
      ['ramp_rate_c_per_min', 'number', false],
      ['target_temp_c', 'number', true],
    ]);

    const timed = editor.blocks.find(b => b.id === 'timed-events')!;
    expect(timed.kind).toBe('section');
    expect(timed.slots).toEqual(['timed-events-slot']);
    const timedSlot = byId.get('timed-events-slot')!;
    expect(timedSlot.path).toBe('$.analysis.timed_events');
    expect(
      (timedSlot.properties ?? []).map((p) => p.name),
    ).toEqual([
      'at_min', 'integration', 'slope_sensitivity',
      'peak_width_s', 'area_reject_au', 'height_reject_au',
    ]);
    expect(timedSlot.properties?.find(p => p.name === 'at_min')?.required).toBe(true);
    expect(timedSlot.properties?.find(p => p.name === 'integration')?.required).toBe(true);
    expect(timedSlot.properties?.find(p => p.name === 'slope_sensitivity')?.required).toBe(false);

    const compound = editor.blocks.find(b => b.id === 'compound-assignments')!;
    expect(compound.kind).toBe('section');
    expect(compound.slots).toEqual(['compound-assignments-slot']);
    const compoundSlot = byId.get('compound-assignments-slot')!;
    expect(compoundSlot.path).toBe('$.analysis.compound_assignments');
    // FAME-3 (W3): the entry gains three OPTIONAL declared leaves —
    // assignment_state (a select whose options are the schema enum verbatim),
    // provenance (an object-bound leaf, FIX-1 D1), and reporting_basis_ref
    // (a ref). The five pre-existing leaves survive in order.
    // W2 C1 (architect OPT-B): the compound slot declares its item
    // sub-fields via the ALREADY-FORWARDED, ALREADY-CONSUMED `items:`
    // house dialect (the projection forwards slot.items; the mapper maps
    // it to the itemHint the ArrayWidget→ObjectWidget path consumes).
    // The earlier decorative `properties:` block is REPLACED — it was
    // inert data (the projection never forwarded that member). The other
    // array slots above keep their `properties:` declarations untouched
    // (UI-DIALECT-1 owns the platform-wide reconciliation).
    expect(compoundSlot.properties, 'properties: block replaced by items:').toBeUndefined();
    const compoundItems = compoundSlot.items as { widget?: string; fields?: Array<{ path: string; widget?: string; required?: boolean }> } | undefined;
    expect(compoundItems, 'the slot declares an items: member').toBeDefined();
    expect(compoundItems!.widget).toBe('object');
    expect(
      compoundItems!.fields!.map((p) => [p.path, p.required]),
    ).toEqual([
      ['label', true],
      ['compound_ref', true],
      ['expected_rt_min', false],
      ['rt_window_min', false],
      ['response_factor', false],
      ['assignment_state', false],
      ['provenance', false],
      ['reporting_basis_ref', false],
    ]);
    // assignment_state is a select whose options ARE the schema enum verbatim
    // (the vocabulary lives ONLY in the schema triplet — the D1 doctrine).
    const stateLeaf = compoundItems!.fields!.find((p) => p.path === 'assignment_state')!;
    expect(stateLeaf.widget).toBe('select');
    const stateOpts = (stateLeaf as { options?: Array<{ value: string }> }).options ?? [];
    expect(stateOpts.map((o) => o.value)).toEqual(['verified', 'provisional']);
    expect(
      compoundItems!.fields!.find((p) => p.path === 'reporting_basis_ref')!.widget,
    ).toBe('ref');

    const provenance = editor.blocks.find(b => b.id === 'provenance')!;
    expect(provenance.slots).toEqual(['entered-by-slot', 'source-files-slot']);
    const sourceFiles = byId.get('source-files-slot')!;
    expect(sourceFiles.path).toBe('$.provenance_capture.source_files');
    expect(
      (sourceFiles.properties ?? []).map((p) => [p.name, p.required]),
    ).toEqual([
      ['file', true],
      ['role', true],
      ['key_values', false],
    ]);

    const calibration = editor.blocks.find(b => b.id === 'calibration')!;
    expect(calibration.kind).toBe('section');
    expect(
      calibration.slots,
    ).toEqual([
      'istd-ref-slot', 'istd-amount-value-slot', 'istd-amount-unit-slot',
      'dilution-factor-slot', 'multiplier-slot', 'calibration-levels-slot',
    ]);
    const levels = byId.get('calibration-levels-slot')!;
    expect(levels.path).toBe('$.analysis.calibration.calibration_levels');
    expect(levels.widget).toBe('array');
    expect(
      (levels.properties ?? []).map((p) => [p.name, p.widget]),
    ).toEqual([
      ['kind', 'text'], ['type', 'text'], ['id', 'text'], ['label', 'text'],
    ]);

    // Every properties entry carries the full shape the mapper consumes.
    for (const slot of editor.slots) {
      for (const p of slot.properties ?? []) {
        expect(typeof p.name, `${slot.id}.properties.name`).toBe('string');
        expect(p.name.length, `${slot.id}.properties.name non-empty`).toBeGreaterThan(0);
        expect(typeof p.widget, `${slot.id}.properties.widget`).toBe('string');
        expect(p.widget.length, `${slot.id}.properties.widget non-empty`).toBeGreaterThan(0);
        expect(typeof p.label, `${slot.id}.properties.label`).toBe('string');
        expect(p.label.length, `${slot.id}.properties.label non-empty`).toBeGreaterThan(0);
        expect(typeof p.required, `${slot.id}.${p.name} required flag is boolean`).toBe('boolean');
      }
    }
  });

  it('G5e: leaf-scalar decomposition covers every structured sub-field of the data schema', async () => {
    const { editor } = await loadRawUi();
    const byPath = new Map(editor.slots.map((s) => [s.path, s]));
    expect(byPath.get('$.acquisition.inlet.mode')?.widget).toBe('select');
    expect(byPath.get('$.acquisition.inlet.temp_c')?.widget).toBe('number');
    expect(byPath.get('$.acquisition.inlet.pressure_psi')?.widget).toBe('number');
    expect(byPath.get('$.acquisition.inlet.split_ratio')?.widget).toBe('number');
    expect(byPath.get('$.acquisition.inlet.carrier_gas')?.widget).toBe('select');
    expect(byPath.get('$.acquisition.diverter.position')?.widget).toBe('text');
    expect(byPath.get('$.acquisition.diverter.description')?.widget).toBe('text');
    expect(byPath.get('$.acquisition.saver.position')?.widget).toBe('text');
    expect(byPath.get('$.acquisition.saver.description')?.widget).toBe('text');
    expect(byPath.get('$.acquisition.column.length_m')?.widget).toBe('number');
    expect(byPath.get('$.acquisition.column.id_mm')?.widget).toBe('number');
    expect(byPath.get('$.acquisition.column.film_thickness_um')?.widget).toBe('number');
    expect(byPath.get('$.acquisition.column.stationary_phase')?.widget).toBe('text');
    expect(byPath.get('$.acquisition.column.flow_mode')?.widget).toBe('select');
    expect(byPath.get('$.analysis.global.baseline_correction')?.widget).toBe('select');
    expect(byPath.get('$.analysis.global.skim_ratio')?.widget).toBe('number');
    expect(byPath.get('$.analysis.global.valley_to_peak_ratio')?.widget).toBe('number');
    expect(byPath.get('$.analysis.global.peak_width_s')?.widget).toBe('number');
    expect(byPath.get('$.analysis.calibration.istd_ref')?.widget).toBe('ref');
    expect(byPath.get('$.analysis.calibration.istd_amount.value')?.widget).toBe('number');
    expect(byPath.get('$.analysis.calibration.istd_amount.unit')?.widget).toBe('text');
    expect(byPath.get('$.analysis.calibration.dilution_factor')?.widget).toBe('number');
    expect(byPath.get('$.analysis.calibration.multiplier')?.widget).toBe('number');
    expect(byPath.get('$.analysis.executable_binding.engine_ref')?.widget).toBe('ref');
    expect(byPath.get('$.analysis.executable_binding.declared_at')?.widget).toBe('datetime');
    expect(byPath.get('$.provenance_capture.entered_by')?.widget).toBe('ref');

    // The decomposition is EXACT: no slot binds a container (non-ref, non-array)
    // object value — that is the D1 invariant restated over the full slot set.
    const containerOffenders = editor.slots
      .filter((s) => {
        if (REF_WIDGETS.has(s.widget) || s.widget === 'array') return false;
        const v = fixtureValueAt(s.path);
        return v !== undefined &&
          v !== null &&
          typeof v === 'object';
      })
      .map((s) => s.id);
    expect(containerOffenders).toEqual([]);
  });

  it('G5f: labels are full-word — no dotted-path labels, no unit abbreviations', async () => {
    const { editor } = await loadRawUi();
    const bad: string[] = [];
    for (const slot of editor.slots) {
      if (slot.label.includes('.')) bad.push(`${slot.id}: ${slot.label}`);
      // Dotted data paths must never leak into the label.
      if (/^[a-z][a-z_0-9]+(\.[a-z_0-9]+)+$/i.test(slot.label)) bad.push(`${slot.id}: ${slot.label}`);
      for (const p of slot.properties ?? []) {
        if (p.label.includes('.')) bad.push(`${slot.id}.${p.name}: ${p.label}`);
      }
    }
    expect(bad).toEqual([]);

    // Enum slots expose the schema enums verbatim as options.
    const byPath = new Map(editor.slots.map((s) => [s.path, s]));
    const optionValues = (p: string): string[] => {
      const opts = (byPath.get(p) as { options?: Array<{ value: string }> } | undefined)?.options ?? [];
      return opts.map((o) => o.value);
    };
    expect(optionValues('$.acquisition.inlet.mode')).toEqual(['split', 'splitless', 'on_column']);
    expect(optionValues('$.acquisition.inlet.carrier_gas')).toEqual(['helium', 'nitrogen', 'hydrogen', 'other']);
    expect(optionValues('$.acquisition.column.flow_mode')).toEqual(['constant_flow', 'constant_pressure', 'other']);
    expect(optionValues('$.analysis.global.baseline_correction')).toEqual(['none', 'tangent_skim', 'vertical_drop', 'other']);

    // Ref slots keep their target-kind hint.
    expect(byPath.get('$.provenance_capture.entered_by')?.refKind).toBe('person');
    expect(byPath.get('$.analysis.executable_binding.engine_ref')?.refKind).toBe('equipment');
  });

  it('G5g: state and id remain readonly; every block declares an explicit slot claim', async () => {
    const { editor } = await loadRawUi();
    const byPath = new Map(editor.slots.map((s) => [s.path, s]));
    expect(byPath.get('$.id')?.widget).toBe('readonly');
    expect(byPath.get('$.state')?.widget).toBe('readonly');
    expect(editor.blocks.length).toBeGreaterThan(0);
    for (const b of editor.blocks) {
      expect(Array.isArray(b.slots), `${b.id} declares explicit slots`).toBe(true);
    }
  });
});
