/**
 * FAME-3 (W3): gc-method compound-assignment entry — assignment_state +
 * provenance + reporting_basis_ref as DECLARED DATA (the ONLY schema-repo
 * diff for this item).
 *
 * Contract (spec §10 W3, §2 code/data boundary, §18 rulings):
 *  - a compound_assignments entry gains THREE optional declared props:
 *      assignment_state  — string enum, EXACTLY the two task terms (read from
 *                          the schema itself; "unassigned" is FORBIDDEN as a
 *                          stored token — absence = unknown)
 *      provenance        — object, additionalProperties:false, the entry's
 *                          who/when/which-run+peak (entered_by ref,
 *                          recorded_at date-time, source_run_ref record-ref,
 *                          source_peak_label string)
 *      reporting_basis_ref — the ref datatype, optional (§9: basis as data,
 *                          NO enum, absent = unknown)
 *  - the gc-method.ui.yaml compound-assignments slot properties gain the
 *    matching leaf widgets (assignment_state as a select whose options ARE
 *    the schema enum verbatim; the new refs as widget:ref; recorded_at as a
 *    leaf with help) — the FIX-1 D1 doctrine (object-bound leaves never a
 *    scalar widget over an object).
 *
 * RED-first: authored BEFORE the YAML lands. On the pristine triplet the
 * assignment_state / provenance / reporting_basis_ref entries are rejected
 * by the item's additionalProperties:false and the ui slot lacks the new
 * leaves — every assertion in the two describes below fails (RED). After the
 * W3 YAML diff they pass (GREEN). The existing GcMethodSchemas.test.ts
 * (G1/G3/G5) suite is the regression guard: the item keeps its
 * additionalProperties:false + the two required [label, compound_ref].
 *
 * Bait #4: this file carries NO compound term literal and NO hardcoded
 * assignment-state string — the enum is read from the schema YAML at test
 * time (the vocabulary lives ONLY in the schema triplet, per §2).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import yaml from 'yaml';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';
import { createUISpecLoader, loadAllUISpecs } from '../ui/UISpecLoader.js';

const SCHEMA_ID = (name: string) =>
  `https://computable-lab.com/schema/computable-lab/${name}`;

const GCM_SCHEMA_ID = SCHEMA_ID('gc-method.schema.yaml');
const SCHEMA_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '../../../schema');

// ---------------------------------------------------------------------------
// Fixtures — a MINIMAL gc-method (acquisition/analysis optional; only the
// compound_assignments entry under test). No compound term literals: the
// ref carries a neutral CURIE in a test-only namespace; the ref shape (kind +
// namespace + id + label) is what the schema governs.
// ---------------------------------------------------------------------------

type Assignment = Record<string, unknown>;
type GcmFixture = Record<string, unknown>;

/** The two terms the task ratifies for assignment_state (spec §10 W3, §12). */
const RATED_STATE_TERMS = ['verified', 'provisional'] as const;

/** The term the task FORBIDS as a stored token (absence = unknown). */
const FORBIDDEN_STATE_TOKEN = 'unassigned';

/** The FAME-2 standard peak the task names as the one verified entry
 *  (OQ-5): observed RT + a declared window + complete provenance. */
const STANDARD_PEAK_OBSERVED_RT_MIN = 6.2;
const STANDARD_PEAK_RT_WINDOW_MIN = 0.2;

function standardEntry(): Assignment {
  const assignmentState = readAssignmentStateEnum()[0]!;
  return {
    label: 'standard peak n1',
    compound_ref: {
      kind: 'ontology',
      namespace: 'TEST-ONLY',
      id: 'TEST-ONLY:standard-peak-n1',
      label: 'Standard peak n1',
    },
    expected_rt_min: STANDARD_PEAK_OBSERVED_RT_MIN,
    rt_window_min: STANDARD_PEAK_RT_WINDOW_MIN,
    assignment_state: assignmentState,
    provenance: {
      entered_by: { kind: 'record', type: 'person', id: 'PER-TEST' },
      recorded_at: '2026-11-01T00:00:00.000Z',
      source_run_ref: { kind: 'record', type: 'analysis-run', id: 'ANR-000001' },
      source_peak_label: 'peak 1',
    },
  };
}

function methodFixture(overrides: Assignment = {}): GcmFixture {
  return {
    kind: 'gc-method',
    id: 'GCM-F3-TEST',
    name: 'FAME-3 schema contract method',
    method_version: 1,
    analysis: {
      compound_assignments: [
        {
          label: 'standard peak n1',
          compound_ref: {
            kind: 'ontology',
            namespace: 'TEST-ONLY',
            id: 'TEST-ONLY:standard-peak-n1',
            label: 'Standard peak n1',
          },
          ...overrides,
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Shared pipeline (the same REAL loader/registry/validator as the store —
// mirrors GcMethodSchemas.test.ts; this exercises exactly what the store
// enforces, the honest pre-restart proof per OQ-1).
// ---------------------------------------------------------------------------

let validator: ReturnType<typeof createValidator>;

function readAssignmentStateEnum(): string[] {
  const raw = yaml.parse(
    readFileSync(join(SCHEMA_DIR, 'lab', 'gc-method.schema.yaml'), 'utf8'),
  ) as {
    properties?: {
      analysis?: {
        properties?: {
          compound_assignments?: {
            items?: {
              properties?: {
                assignment_state?: { enum?: unknown };
              };
            };
          };
        };
      };
    };
  };
  const enumDef = raw.properties?.analysis?.properties?.compound_assignments?.items
    ?.properties?.assignment_state?.enum;
  return Array.isArray(enumDef) ? (enumDef as string[]) : [];
}

beforeAll(async () => {
  const loaded = await loadAllSchemas({ basePath: SCHEMA_DIR, recursive: true });
  const registry = createSchemaRegistry();
  registry.addSchemas(loaded.entries);
  validator = createValidator();
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema as never, id);
  }
});

// ---------------------------------------------------------------------------
// 1. Schema — the three new declared props on a compound_assignments entry
// ---------------------------------------------------------------------------

describe('gc-method compound assignment entry (FAME-3 W3)', () => {
  it('declaration: assignment_state is a string enum of EXACTLY the two ratified terms', () => {
    expect(readAssignmentStateEnum()).toEqual([...RATED_STATE_TERMS]);
  });

  it('a fully-provenanced entry (state + provenance + basis ref) validates', () => {
    const basisRef = {
      kind: 'ontology',
      namespace: 'TEST-ONLY',
      id: 'TEST-ONLY:basis-face-n1',
      label: 'Basis face n1',
    };
    const ok = validator.validate(
      methodFixture({ reporting_basis_ref: basisRef }),
      GCM_SCHEMA_ID,
    );
    expect(ok.errors ?? []).toEqual([]);
    expect(ok.valid).toBe(true);
  });

  it.each([...RATED_STATE_TERMS])('accepts assignment_state: %s', (state) => {
    const ok = validator.validate(methodFixture({ assignment_state: state }), GCM_SCHEMA_ID);
    expect(ok.errors ?? []).toEqual([]);
    expect(ok.valid).toBe(true);
  });

  it('rejects a stored unassigned token (absence = unknown, not a value)', () => {
    const ok = validator.validate(
      methodFixture({ assignment_state: FORBIDDEN_STATE_TOKEN }),
      GCM_SCHEMA_ID,
    );
    expect(ok.valid).toBe(false);
    expect(
      (ok.errors ?? []).some((e) => (e.path ?? '').includes('assignment_state')),
    ).toBe(true);
  });

  it('rejects an unknown extra key on the entry (additionalProperties:false intact)', () => {
    const ok = validator.validate(methodFixture({ not_a_key: true }), GCM_SCHEMA_ID);
    expect(ok.valid).toBe(false);
  });

  it('provenance: the four declared who/when/which keys validate; an extra key is rejected', () => {
    // A fully-provenanced entry (the standard peak) validates.
    const ok = validator.validate(methodFixture(standardEntry()), GCM_SCHEMA_ID);
    expect(ok.errors ?? []).toEqual([]);
    expect(ok.valid).toBe(true);

    // An undeclared key inside provenance is rejected (additionalProperties:false).
    const extra = methodFixture(standardEntry());
    const entry = (extra.analysis as { compound_assignments: Assignment[] }).compound_assignments[0]!;
    (entry.provenance as Record<string, unknown>).extra_key = 'nope';
    const bad = validator.validate(extra, GCM_SCHEMA_ID);
    expect(bad.valid).toBe(false);
    expect(
      (bad.errors ?? []).some((e) => (e.path ?? '').includes('provenance')),
    ).toBe(true);
  });

  it('reporting_basis_ref: an absent basis is legal (unknown, never a default)', () => {
    const entry = standardEntry();
    delete entry.reporting_basis_ref;
    const ok = validator.validate(methodFixture(entry), GCM_SCHEMA_ID);
    expect(ok.valid).toBe(true);
  });

  it('reporting_basis_ref: a malformed ref (missing namespace) is rejected by the ref shape', () => {
    const ok = validator.validate(
      methodFixture({
        reporting_basis_ref: {
          kind: 'ontology',
          id: 'TEST-ONLY:basis-face-n1',
          label: 'Basis face n1',
        },
      }),
      GCM_SCHEMA_ID,
    );
    expect(ok.valid).toBe(false);
    expect(
      (ok.errors ?? []).some((e) => (e.path ?? '').includes('reporting_basis_ref')),
    ).toBe(true);
  });

  it('the base entry stays valid: the new props are OPTIONAL (regression guard)', () => {
    const bare = {
      label: 'standard peak n1',
      compound_ref: {
        kind: 'ontology',
        namespace: 'TEST-ONLY',
        id: 'TEST-ONLY:standard-peak-n1',
        label: 'Standard peak n1',
      },
    };
    const ok = validator.validate(methodFixture(bare), GCM_SCHEMA_ID);
    expect(ok.errors ?? []).toEqual([]);
    expect(ok.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. UI — the compound-assignments slot gains the matching leaf widgets
// ---------------------------------------------------------------------------

describe('gc-method ui compound-assignment leaves (FAME-3 W3, W2 C1 items: re-shape)', () => {
  it('the slot declares its item sub-fields via the loader-honored items: dialect (NOT the decorative properties: block) with the three W3 leaves', async () => {
    const loader = createUISpecLoader();
    const result = await loadAllUISpecs(loader, SCHEMA_DIR);
    const mine = result.errors.filter((e) => e.path.includes('gc-method.ui.yaml'));
    expect(mine).toEqual([]);

    const raw = yaml.parse(
      readFileSync(join(SCHEMA_DIR, 'lab', 'gc-method.ui.yaml'), 'utf8'),
    ) as { editor: { slots: Array<Record<string, unknown>> } };
    const slot = raw.editor.slots.find(
      (s) => s.path === '$.analysis.compound_assignments',
    );
    expect(slot, 'compound-assignments slot').toBeDefined();

    // W2 C1 (architect OPT-B ruling, C1 condition): the item sub-fields ride
    // the ALREADY-FORWARDED, ALREADY-CONSUMED `items:` house dialect
    // (EditorProjectionService forwards slot.items → mapper itemHint →
    // ArrayWidget → ObjectWidget). The decorative `properties:` block is
    // REPLACED, never kept side by side (one spelling per slot).
    expect(
      slot!.properties,
      'the decorative properties: block is replaced by the items: declaration',
    ).toBeUndefined();
    const items = slot!.items as Record<string, unknown> | undefined;
    expect(items, 'the slot declares an items: member').toBeDefined();
    expect(items!.widget, 'the item hint is an object widget').toBe('object');
    const fields = items!.fields as Array<Record<string, unknown>>;
    expect(Array.isArray(fields) && fields.length > 0, 'the item hint declares sub-fields').toBe(true);
    const byName = new Map(fields.map((p) => [String(p.path), p]));

    // assignment_state: a select whose options ARE the schema enum verbatim.
    const state = byName.get('assignment_state');
    expect(state, 'assignment_state leaf declared').toBeDefined();
    expect(state!.widget, 'assignment_state is a select').toBe('select');
    const opts = state!.options as Array<{ value: string; label: string }>;
    expect(
      (opts ?? []).map((o) => o.value).sort(),
      'select options are the schema enum verbatim',
    ).toEqual([...RATED_STATE_TERMS].sort());

    // reporting_basis_ref: a ref leaf (the ref datatype, §9 basis-as-data).
    const basis = byName.get('reporting_basis_ref');
    expect(basis, 'reporting_basis_ref leaf declared').toBeDefined();
    expect(basis!.widget, 'reporting_basis_ref is a ref').toBe('ref');

    // provenance: the entry's who/when/which-run+peak as a NESTED object with
    // its four declared sub-fields — a scalar widget over an object is the D1
    // [object Object] defect, so the field binds the object (never
    // text/number/…).
    const provenance = byName.get('provenance');
    expect(provenance, 'provenance leaf declared').toBeDefined();
    expect(
      provenance!.widget,
      'provenance binds the object, never a scalar widget',
    ).toBe('object');
    const provFields = provenance!.fields as Array<Record<string, unknown>>;
    expect(Array.isArray(provFields), 'provenance declares its sub-fields').toBe(true);
    const provByPath = new Map(provFields.map((p) => [String(p.path), p]));
    // The provenance sub-fields mirror the schema's four declared keys
    // exactly (schema gc-method.schema.yaml provenance: entered_by
    // record-ref / recorded_at date-time / source_run_ref record-ref /
    // source_peak_label string).
    expect(provByPath.has('entered_by'), 'entered_by sub-field declared').toBe(true);
    expect(provByPath.get('entered_by')!.widget, 'entered_by is a record ref').toBe('record-ref');
    expect(provByPath.get('entered_by')!.refKind, 'entered_by targets person records').toBe('person');
    expect(provByPath.has('recorded_at'), 'recorded_at sub-field declared').toBe(true);
    expect(provByPath.get('recorded_at')!.widget, 'recorded_at is text').toBe('text');
    expect(provByPath.has('source_run_ref'), 'source_run_ref sub-field declared').toBe(true);
    expect(provByPath.get('source_run_ref')!.widget, 'source_run_ref is a record ref').toBe('record-ref');
    expect(provByPath.get('source_run_ref')!.refKind, 'source_run_ref targets analysis-run records').toBe('analysis-run');
    expect(provByPath.has('source_peak_label'), 'source_peak_label sub-field declared').toBe(true);
    expect(provByPath.get('source_peak_label')!.widget, 'source_peak_label is text').toBe('text');

    // compound_ref: the ontology-ref picker is ENABLED by data (the
    // claim.ui.yaml ontology-ref pattern: the 'ols' source turns on the
    // /resolve spine in RefCombobox, and valueShape ontology-ref commits the
    // canonical ref OBJECT). No namespace literal in the ui.yaml — the
    // namespace rides the runtime resolve result, never the declaration.
    const compound = byName.get('compound_ref');
    expect(compound, 'compound_ref leaf survives').toBeDefined();
    expect(compound!.widget, 'compound_ref is a ref').toBe('ref');
    expect(compound!.required, 'compound_ref stays required').toBe(true);
    const compoundProps = compound!.props as Record<string, unknown>;
    expect(compoundProps, 'compound_ref declares its suggestion props').toBeDefined();
    expect(
      (compoundProps.sources as string[]).includes('ols'),
      'compound_ref searches the ontology spine (ols source)',
    ).toBe(true);
    expect(
      compoundProps.valueShape,
      'compound_ref commits the canonical ontology ref object',
    ).toBe('ontology-ref');

    // The pre-existing leaves survive (regression guard).
    for (const name of ['label', 'expected_rt_min', 'rt_window_min', 'response_factor']) {
      expect(byName.get(name), `${name} leaf survives`).toBeDefined();
    }
  });

  it('the loader exposes the slot with the new leaves for the projection path', async () => {
    const loader = createUISpecLoader();
    await loadAllUISpecs(loader, SCHEMA_DIR);
    const spec = loader.get(GCM_SCHEMA_ID);
    expect(spec).toBeDefined();
  });
});
