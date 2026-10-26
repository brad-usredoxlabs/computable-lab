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
import { fileURLToPath } from 'node:url';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';
import { loadAllLintSpecs } from '../lint/LintSpecLoader.js';
import { createLintEngine } from '../lint/LintEngine.js';
import { createUISpecLoader, loadAllUISpecs } from '../ui/UISpecLoader.js';
import { getReadoutDefinitionRegistry } from '../registry/ReadoutDefinitionRegistry.js';

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

describe('gc-method ui (G5)', () => {
  it('G5: gc-method.ui.yaml loads with zero loader errors (every slot claimed)', async () => {
    const loader = createUISpecLoader();
    const result = await loadAllUISpecs(loader, SCHEMA_DIR);
    const mine = result.errors.filter(e => e.path.includes('gc-method.ui.yaml'));
    expect(mine).toEqual([]);
  });
});
