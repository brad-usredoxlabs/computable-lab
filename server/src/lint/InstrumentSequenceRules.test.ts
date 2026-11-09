/**
 * GC-3 — instrument-sequence / instrument-sequence-entry: lint-rule tests
 * (engine-driven over the REAL *.lint.yaml files, per the promoted spec §RED
 * plan and the adversarial-gate defect list).
 *
 * Harness: parse the REAL schema/lab/*.lint.yaml files from disk (the same
 * files the server loads at startup via LintSpecLoader) into a LintEngine and
 * lint sample payloads directly — no HTTP. Same pattern as
 * server/src/lint/studyRunRules.test.ts.
 *
 * Contract pinned here (the gate's rule-by-rule directions, which are
 * binding):
 *  - R1 iseq-entry-refs-declared-unique: FIRES on an empty entryRefs and is
 *    CLEAN on a non-empty one (warning — build-up state is legal, so `valid`
 *    stays true; the rule is still present in violations when it fires).
 *  - R2 iseq-run-link-present: FIRES when a header links to neither a run nor
 *    a study, CLEAN when at least one is present (warning).
 *  - R3 isen-ref-shape-closed: FAILS (valid=false, an ERROR) on a
 *    sampleRef.id shaped 'RUN-000041' (outside the ^SMP- vocabulary) and
 *    PASSES on a well-shaped-but-nonexistent 'SMP-MISSING'. That second arm is
 *    the HONEST BOUNDARY the spec mandates: shape is not existence — ref
 *    TARGET EXISTENCE is resolution-time (the GC-4 resolver), not lint's job,
 *    because the v1 lint DSL cannot open the record store. The test encodes
 *    that boundary by asserting a well-shaped id that names no record is still
 *    legal here.
 *  - R4 isen-multiplier-dilution-sane: FIRES when multiplier=0 AND
 *    dilution=0 (a zero factor is a data-entry error), but PASSES when the
 *    fields are ABSENT (vacuous pass via not(exists)) — the regression guard
 *    for the `$.dilution` fix (an equals-null guard would have fired on
 *    absent rows; not(exists) is the only guard whose branch semantics match
 *    "absent is clean, present must be > 0").
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { LintEngine } from './LintEngine.js';
import type { LintSpec } from './types.js';

function loadSpec(file: string): LintSpec {
  const url = new URL(`../../../schema/lab/${file}`, import.meta.url);
  const parsed = parseYaml(readFileSync(fileURLToPath(url), 'utf-8')) as LintSpec;
  if (typeof parsed.lintVersion !== 'number' || !Array.isArray(parsed.rules)) {
    throw new Error(`Invalid lint spec: ${file}`);
  }
  return parsed;
}

function engineWith(file: string): LintEngine {
  const eng = new LintEngine();
  eng.addSpec(file, loadSpec(file));
  return eng;
}

const SEQUENCE_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/instrument-sequence.schema.yaml';
const ENTRY_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/instrument-sequence-entry.schema.yaml';

describe('instrument-sequence header lint rules', () => {
  const R1 = 'iseq-entry-refs-declared-unique';
  const R2 = 'iseq-run-link-present';
  let engine: LintEngine;

  beforeAll(() => {
    engine = engineWith('instrument-sequence.lint.yaml');
  });

  // -----------------------------------------------------------------------
  // R1 — an empty run-sheet is suspicious, not fatal.
  // -----------------------------------------------------------------------

  it('R1: FIRES (warning) on an empty entryRefs run sheet', () => {
    const r = engine.lint(
      {
        kind: 'instrument-sequence',
        id: 'ISEQ-2026-0041',
        title: 'ChemStation run sheet (empty)',
        entryRefs: [],
        studyRef: { kind: 'record', type: 'study', id: 'STU-000041' },
      },
      SEQUENCE_SCHEMA_ID,
    );
    // Warning severity: the record stays writable, so `valid` stays true.
    expect(r.valid).toBe(true);
    expect(r.summary.warnings).toBeGreaterThanOrEqual(1);
    expect(r.violations.some((v) => v.ruleId === R1)).toBe(true);
  });

  it('R1: is CLEAN on a run sheet that declares at least one entry reference', () => {
    const r = engine.lint(
      {
        kind: 'instrument-sequence',
        id: 'ISEQ-2026-0041',
        title: 'ChemStation run sheet',
        entryRefs: [
          { kind: 'record', type: 'instrument-sequence-entry', id: 'ISEN-2026-0041-001' },
        ],
        studyRef: { kind: 'record', type: 'study', id: 'STU-000041' },
      },
      SEQUENCE_SCHEMA_ID,
    );
    expect(r.valid).toBe(true);
    expect(r.violations.some((v) => v.ruleId === R1)).toBe(false);
  });

  // -----------------------------------------------------------------------
  // R2 — a sequence bound to nothing has no home in the study graph.
  // -----------------------------------------------------------------------

  it('R2: FIRES (warning) on a header linked to neither a run nor a study', () => {
    const r = engine.lint(
      {
        kind: 'instrument-sequence',
        id: 'ISEQ-2026-0041',
        title: 'Unbound run sheet',
        entryRefs: [
          { kind: 'record', type: 'instrument-sequence-entry', id: 'ISEN-2026-0041-001' },
        ],
      },
      SEQUENCE_SCHEMA_ID,
    );
    expect(r.valid).toBe(true); // warning, not fatal
    expect(r.summary.warnings).toBeGreaterThanOrEqual(1);
    expect(r.violations.some((v) => v.ruleId === R2)).toBe(true);
  });

  it('R2: is CLEAN on a header that links to a study or a run', () => {
    const withStudy = engine.lint(
      {
        kind: 'instrument-sequence',
        id: 'ISEQ-2026-0041',
        title: 'Bound run sheet (study)',
        entryRefs: [
          { kind: 'record', type: 'instrument-sequence-entry', id: 'ISEN-2026-0041-001' },
        ],
        studyRef: { kind: 'record', type: 'study', id: 'STU-000041' },
      },
      SEQUENCE_SCHEMA_ID,
    );
    expect(withStudy.valid).toBe(true);
    expect(withStudy.violations.some((v) => v.ruleId === R2)).toBe(false);

    // A run link alone also satisfies R2 (the rule is an any-exists).
    const withRun = engine.lint(
      {
        kind: 'instrument-sequence',
        id: 'ISEQ-2026-0041',
        title: 'Bound run sheet (run)',
        entryRefs: [
          { kind: 'record', type: 'instrument-sequence-entry', id: 'ISEN-2026-0041-001' },
        ],
        runRef: { kind: 'record', type: 'run', id: 'RUN-000041' },
      },
      SEQUENCE_SCHEMA_ID,
    );
    expect(withRun.valid).toBe(true);
    expect(withRun.violations.some((v) => v.ruleId === R2)).toBe(false);
  });
});

describe('instrument-sequence-entry lint rules', () => {
  const R3 = 'isen-ref-shape-closed';
  const R4 = 'isen-multiplier-dilution-sane';
  let engine: LintEngine;

  beforeAll(() => {
    engine = engineWith('instrument-sequence-entry.lint.yaml');
  });

  /** A well-shaped entry (refs carry the target kind's id-prefix vocabulary)
   *  with multiplier/dilution OMITTED so R4 passes vacuously. */
  const baseEntry = (overrides: Record<string, unknown> = {}) => ({
    kind: 'instrument-sequence-entry',
    id: 'ISEN-2026-0041-007',
    position: { vial: '101' },
    runRef: { kind: 'record', type: 'run', id: 'RUN-000041' },
    sampleRef: { kind: 'record', type: 'sample', id: 'SMP-GC3-001' },
    gcMethodRef: { kind: 'record', type: 'gc-method', id: 'GCM-GC3-001' },
    ...overrides,
  });

  // -----------------------------------------------------------------------
  // R3 — ref id-prefix shape closure (ERROR). Shape, not existence.
  // -----------------------------------------------------------------------

  it('R3: FAILS (valid=false, error) on a sampleRef.id outside the ^SMP- vocabulary', () => {
    const r = engine.lint(
      baseEntry({ sampleRef: { kind: 'record', type: 'sample', id: 'RUN-000041' } }),
      ENTRY_SCHEMA_ID,
    );
    // R3 is ERROR severity, so `valid` flips to false.
    expect(r.valid).toBe(false);
    expect(r.summary.errors).toBeGreaterThanOrEqual(1);
    expect(r.violations.some((v) => v.ruleId === R3)).toBe(true);
    // The violation names the offending entry id (message interpolation).
    const v = r.violations.find((x) => x.ruleId === R3);
    expect(v?.message).toContain('ISEN-2026-0041-007');
  });

  it('R3: PASSES on a well-shaped-but-nonexistent sampleRef.id (SMP-MISSING) — the honest boundary', () => {
    // 'SMP-MISSING' carries the ^SMP- prefix (shape is satisfied) but names no
    // record that exists. The v1 lint DSL CANNOT open the store, so lint
    // cannot (and does not) check target EXISTENCE — that is resolution-time
    // (the GC-4 resolver). Shape is not existence: a well-shaped id that
    // names no record is still LEGAL here. The test encodes that boundary.
    const r = engine.lint(
      baseEntry({ sampleRef: { kind: 'record', type: 'sample', id: 'SMP-MISSING' } }),
      ENTRY_SCHEMA_ID,
    );
    expect(r.valid).toBe(true);
    expect(r.summary.errors).toBe(0);
    expect(r.violations.some((v) => v.ruleId === R3)).toBe(false);
  });

  it('R3: also FAILS on a gcMethodRef.id outside the ^GCM- vocabulary', () => {
    const r = engine.lint(
      baseEntry({ gcMethodRef: { kind: 'record', type: 'gc-method', id: 'GCM_WRONG' } }),
      ENTRY_SCHEMA_ID,
    );
    expect(r.valid).toBe(false);
    expect(r.violations.some((v) => v.ruleId === R3)).toBe(true);
  });

  it('R3: is CLEAN on a fully well-shaped entry (both ref prefixes valid)', () => {
    const r = engine.lint(baseEntry(), ENTRY_SCHEMA_ID);
    expect(r.valid).toBe(true);
    expect(r.violations.some((v) => v.ruleId === R3)).toBe(false);
  });

  // -----------------------------------------------------------------------
  // R4 — multiplier/dilution must be > 0 when present (WARNING).
  // -----------------------------------------------------------------------

  it('R4: FIRES (warning) when multiplier=0 AND dilution=0', () => {
    const r = engine.lint(
      baseEntry({ multiplier: 0, dilution: 0 }),
      ENTRY_SCHEMA_ID,
    );
    // Warning severity: `valid` stays true, but the rule is present.
    expect(r.valid).toBe(true);
    expect(r.summary.warnings).toBeGreaterThanOrEqual(1);
    expect(r.violations.some((v) => v.ruleId === R4)).toBe(true);
  });

  it('R4: FIRES (warning) when only the multiplier is a zero factor', () => {
    const r = engine.lint(
      baseEntry({ multiplier: 0, dilution: 1 }),
      ENTRY_SCHEMA_ID,
    );
    expect(r.valid).toBe(true);
    expect(r.violations.some((v) => v.ruleId === R4)).toBe(true);
  });

  it('R4: FIRES (warning) when only the dilution is a zero factor (the $.dilution regression guard)', () => {
    const r = engine.lint(
      baseEntry({ multiplier: 1, dilution: 0 }),
      ENTRY_SCHEMA_ID,
    );
    expect(r.valid).toBe(true);
    expect(r.violations.some((v) => v.ruleId === R4)).toBe(true);
  });

  it('R4: PASSES when multiplier and dilution are both present and > 0', () => {
    const r = engine.lint(
      baseEntry({ multiplier: 1, dilution: 2 }),
      ENTRY_SCHEMA_ID,
    );
    expect(r.valid).toBe(true);
    expect(r.violations.some((v) => v.ruleId === R4)).toBe(false);
  });

  it('R4: PASSES when multiplier and dilution are ABSENT (vacuous pass — the $.dilution fix)', () => {
    // A row may legitimately omit the factor fields entirely. The guard is
    // not(exists): an absent field passes its branch. (An equals-null guard
    // would instead have FIRED on absent rows, because equals-null is true
    // for absent fields — the regression this test pins.)
    const r = engine.lint(baseEntry(), ENTRY_SCHEMA_ID);
    expect(r.valid).toBe(true);
    expect(r.violations.some((v) => v.ruleId === R4)).toBe(false);
  });

  it('R4: PASSES when one factor is absent and the other is > 0', () => {
    const r = engine.lint(
      baseEntry({ multiplier: 1 }), // dilution absent
      ENTRY_SCHEMA_ID,
    );
    expect(r.valid).toBe(true);
    expect(r.violations.some((v) => v.ruleId === R4)).toBe(false);
  });
});
