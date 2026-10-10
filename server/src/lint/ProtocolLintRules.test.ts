/**
 * PROTO-AI-4 — role-integrity lint rules declared in DATA
 * (schema/workflow/protocol.lint.yaml):
 *
 *   R1 step-role-closure            (error)   every step labwareRole /
 *                                              instrumentRole reference
 *                                              resolves to a declared role
 *   R2 labware-role-identity-bearing(warning)  every labwareRoles entry has
 *                                              description + expectedLabwareKinds
 *   R3 role-id-category-unique      (warning)  no roleId shared by
 *                                              labwareRoles and instrumentRoles
 *
 * plus the two generic DSL predicates they need: `everyItem` (per-item
 * quantification) and `noneIn` (cross-collection disjointness).
 *
 * Harness: parse the REAL protocol.lint.yaml from disk (the same file the
 * server loads at startup via LintSpecLoader) into a LintEngine and lint
 * inline fixture payloads directly — no HTTP (studyRunRules.test.ts style).
 * The meta-schema block checks the lint-v1 contract for the new ops; Ajv is
 * the structural authority.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { LintEngine } from './LintEngine.js';
import { evaluatePredicate } from './PredicateEvaluator.js';
import { AjvValidator } from '../validation/AjvValidator.js';
import type { EveryItemPredicate, LintSpec, NoneInPredicate, Predicate } from './types.js';

const PROTOCOL = 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml';
const LINT_META_SCHEMA_ID = 'https://computable-lab.com/schema/lint/lint-v1.schema.yaml';

const PROTOCOL_LINT_PATH = fileURLToPath(
  new URL('../../../schema/workflow/protocol.lint.yaml', import.meta.url),
);
const LINT_META_SCHEMA_PATH = fileURLToPath(
  new URL('../../../schema/lint/lint-v1.schema.yaml', import.meta.url),
);

function loadProtocolLintSpec(): LintSpec {
  const parsed = parseYaml(readFileSync(PROTOCOL_LINT_PATH, 'utf-8')) as LintSpec;
  if (typeof parsed.lintVersion !== 'number' || !Array.isArray(parsed.rules)) {
    throw new Error('Invalid lint spec: protocol.lint.yaml');
  }
  return parsed;
}

function protocolEngine(): LintEngine {
  const eng = new LintEngine();
  eng.addSpec('protocol', loadProtocolLintSpec());
  return eng;
}

// --- shared fixture pieces ---------------------------------------------------
//
// These payloads are LINT fixtures: they carry the fields the linted paths
// read, not every field protocol.schema.yaml requires. Structural validity is
// Ajv's job, not the lint engine's.

function identityLabwareRole(roleId: string): Record<string, unknown> {
  return {
    roleId,
    description: 'Identity-bearing fixture role',
    expectedLabwareKinds: ['LBW-plate-96'],
  };
}

function identityInstrumentRole(roleId: string): Record<string, unknown> {
  return {
    roleId,
    description: 'Identity-bearing fixture instrument role',
    allowedInstrumentIds: ['INS-reader'],
  };
}

function baseRoles(): Record<string, unknown> {
  return {
    labwareRoles: [identityLabwareRole('plate')],
    instrumentRoles: [identityInstrumentRole('reader')],
  };
}

// W2-3 fix cycle 1 (defect 1): R-4 legacy-literal-bounded now guards on
// recordId-not-in-the-frozen-allowlist ONLY — no protocolLayer conjunct. Consequence:
// ANY non-allowlisted all-literal protocol trips R-4 (that IS the acceptance
// behaviour). The PROTO-AI-4 role-integrity fixtures below are adjusted honestly:
//   - fixtures that must stay VALID carry either an intent-bearing step (the authored
//     future) or a frozen-inventory recordId (the only place a literal step is legal
//     after W2-3; fixture labels only — no records/ file is touched);
//   - fixtures that assert INVALID keep their non-allowlisted ids and the R-4 co-fire
//     is asserted explicitly, never hidden.
// R1-R3 rule DATA (protocol.lint.yaml) is byte-unchanged; the R1-R3 assertions stay
// byte-identical.
function intentBearingStep(stepId: string, kind: string): Record<string, unknown> {
  return {
    stepId,
    label: `Intent ${stepId}`,
    ordinal: 1,
    kind,
    intent: {
      semanticVerb: { ref: { kind: 'record', type: 'verb-definition', id: 'VERB-WASH' }, canonical: 'wash' },
      provenance: [{ kind: 'record', type: 'vendor-protocol-candidate', id: 'CAN-lint-fixture', pageStart: 1 }],
    },
  };
}

function protocolFixture(
  steps: Array<Record<string, unknown>>,
  roles?: Record<string, unknown>,
  recordId = 'PRT-lint-fixture',
): Record<string, unknown> {
  return {
    kind: 'protocol',
    recordId,
    title: 'Lint fixture protocol',
    steps,
    ...(roles !== undefined ? { roles } : {}),
  };
}

// W2-3 fix cycle 1: the role-integrity rules under test in this file (R1-R3).
// R-4 (legacy-literal-bounded) guards on recordId-not-in-allowlist ONLY, so a
// non-allowlisted ALL-LITERAL fixture trips it by design — the R1-R3 pins below
// scope to these three rule ids and record the R-4 co-fire explicitly.
const ROLE_INTEGRITY_RULE_IDS = [
  'step-role-closure',
  'labware-role-identity-bearing',
  'role-id-category-unique',
];

function roleIntegrityFindings(violations: Array<{ ruleId: string }>): Array<{ ruleId: string }> {
  return violations.filter((v) => ROLE_INTEGRITY_RULE_IDS.includes(v.ruleId));
}
// =============================================================================
// Generic DSL: everyItem
// =============================================================================

describe('everyItem predicate (per-item quantification)', () => {
  const itemAssert: EveryItemPredicate['assert'] = { op: 'nonEmpty', path: 'name' };

  function pred(overrides: Partial<EveryItemPredicate> = {}): EveryItemPredicate {
    return { op: 'everyItem', collectionPath: 'items', assert: itemAssert, ...overrides };
  }

  it('passes when every item satisfies the assert', () => {
    const res = evaluatePredicate(pred(), { items: [{ name: 'a' }, { name: 'b' }] });
    expect(res.result).toBe(true);
  });

  it('is vacuously true on an empty collection', () => {
    const res = evaluatePredicate(pred(), { items: [] });
    expect(res.result).toBe(true);
  });

  it('fails naming the failing item when any item violates the assert', () => {
    const res = evaluatePredicate(pred(), { items: [{ name: 'a' }, { other: 1 }] });
    expect(res.result).toBe(false);
    expect(res.reason).toMatch(/item 1/);
    expect(res.reason).toContain('items');
  });

  it('fails loudly when collectionPath does not resolve', () => {
    const res = evaluatePredicate(pred({ collectionPath: 'noSuchItems' }), { items: [] });
    expect(res.result).toBe(false);
    expect(res.reason).toContain('noSuchItems');
    expect(res.reason).toMatch(/not found|does not resolve|does not exist/i);
  });

  it('fails loudly when collectionPath resolves to a non-array', () => {
    const res = evaluatePredicate(pred(), { items: { name: 'a' } });
    expect(res.result).toBe(false);
    expect(res.reason).toMatch(/array|collection/i);
  });

  it('fails loudly when the predicate omits assert (structural error)', () => {
    const broken = { op: 'everyItem', collectionPath: 'items' } as unknown as Predicate;
    const res = evaluatePredicate(broken, { items: [{ name: 'a' }] });
    expect(res.result).toBe(false);
    expect(res.reason).toContain('assert');
  });

  it('fails loudly when the predicate omits collectionPath (structural error)', () => {
    const broken = { op: 'everyItem', assert: itemAssert } as unknown as Predicate;
    const res = evaluatePredicate(broken, { items: [] });
    expect(res.result).toBe(false);
    expect(res.reason).toContain('collectionPath');
  });

  it('evaluates a nested assert against each item as root data', () => {
    const res = evaluatePredicate(
      {
        op: 'everyItem',
        collectionPath: 'roles',
        assert: {
          op: 'all',
          predicates: [
            { op: 'nonEmpty', path: 'description' },
            { op: 'nonEmpty', path: 'expectedLabwareKinds' },
          ],
        },
      },
      {
        roles: [
          { roleId: 'ok', description: 'd', expectedLabwareKinds: ['k'] },
          { roleId: 'bad', description: 'd' },
        ],
      },
    );
    expect(res.result).toBe(false);
    expect(res.reason).toMatch(/item 1/);
  });
});

// =============================================================================
// Generic DSL: noneIn
// =============================================================================

describe('noneIn predicate (cross-collection disjointness)', () => {
  function pred(overrides: Partial<NoneInPredicate> = {}): NoneInPredicate {
    return {
      op: 'noneIn',
      path: 'labwareIds',
      collectionPath: 'instrumentRoles',
      itemField: 'roleId',
      ...overrides,
    };
  }

  const disjoint = {
    labwareIds: ['plate'],
    instrumentRoles: [{ roleId: 'reader' }],
  };

  it('passes when no selected value is a member of the collection', () => {
    const res = evaluatePredicate(pred(), disjoint);
    expect(res.result).toBe(true);
  });

  it('fails naming the offending shared value on an overlap', () => {
    const res = evaluatePredicate(pred(), {
      labwareIds: ['plate', 'reader'],
      instrumentRoles: [{ roleId: 'reader' }],
    });
    expect(res.result).toBe(false);
    expect(res.reason).toContain('reader');
  });

  it('is vacuously true when the selection at path is empty', () => {
    const res = evaluatePredicate(pred({ path: 'labwareRoles[*].roleId' }), {
      labwareRoles: [],
      instrumentRoles: [{ roleId: 'reader' }],
    });
    expect(res.result).toBe(true);
  });

  it('fails loudly when the path at path does not resolve', () => {
    const res = evaluatePredicate(pred({ path: 'labwareRoles[*].roleId' }), {
      instrumentRoles: [{ roleId: 'reader' }],
    });
    expect(res.result).toBe(false);
    expect(res.reason).toContain('labwareRoles[*].roleId');
    expect(res.reason).toMatch(/not found|does not resolve|does not exist/i);
  });

  it('fails loudly when collectionPath does not resolve', () => {
    const res = evaluatePredicate(pred({ collectionPath: 'noSuchRoles' }), disjoint);
    expect(res.result).toBe(false);
    expect(res.reason).toContain('noSuchRoles');
  });

  it('fails loudly when collectionPath resolves to a non-array', () => {
    const res = evaluatePredicate(pred({ collectionPath: 'single' }), {
      labwareIds: ['a'],
      single: 'a',
    });
    expect(res.result).toBe(false);
    expect(res.reason).toMatch(/array|collection/i);
  });

  it('fails loudly when the predicate omits collectionPath (structural error)', () => {
    const broken = { op: 'noneIn', path: 'a' } as unknown as Predicate;
    const res = evaluatePredicate(broken, { a: 'x' });
    expect(res.result).toBe(false);
    expect(res.reason).toContain('collectionPath');
  });

  it('works without itemField (flat collection)', () => {
    const res = evaluatePredicate(
      pred({ collectionPath: 'blocked', itemField: undefined }),
      { labwareIds: ['a'], blocked: ['b', 'c'] },
    );
    expect(res.result).toBe(true);
    const clash = evaluatePredicate(
      pred({ collectionPath: 'blocked', itemField: undefined }),
      { labwareIds: ['b'], blocked: ['b', 'c'] },
    );
    expect(clash.result).toBe(false);
  });
});

// =============================================================================
// The declared rules, linted through the real file on disk
// =============================================================================

describe('protocol.lint.yaml declares the full declared rule set', () => {
  let spec: LintSpec;

  beforeAll(() => {
    spec = loadProtocolLintSpec();
  });

  it('activates the full declared set: R1-R3 role-integrity + W2-3 rules (extended to the full declared set per spec mandate + orch ratification l2t1955)', () => {
    // The three PROTO-AI-4 role-integrity rules remain declared with their
    // original ids/severities (byte-unchanged). The spec mandates the W2-3
    // intent/legacy-bounds rules live in the SAME protocol.lint.yaml (§2.2), so
    // the old "only the three role-integrity rules activate" pin cannot remain
    // true; the 7-id pin is extended to the full declared set per spec mandate +
    // orchestrator ratification l2t1955.
    // W2-4-PROVENANCE-LADDER (same precedent, same ratification shape): the
    // W2-4 spec mandates the DERIVED-lineage rules live in the SAME file
    // (§2.5 R-8/R-9, additive-only — the seven W2-3 ids above are
    // byte-unchanged), so the 7-id pin extends to the 9-id declared set.
    expect(spec.rules.map((r) => r.id)).toEqual([
      'step-role-closure',
      'labware-role-identity-bearing',
      'role-id-category-unique',
      'legacy-literal-bounded',
      'legacy-inventory-no-intent-drift',
      'intent-step-provenance-visible',
      'intent-verb-ref-declared',
      'prov-derived-conclusions-anchored',
      'prov-derived-never-vendor-carrier',
    ]);
    expect(spec.rules.find((r) => r.id === 'step-role-closure')?.severity).toBe('error');
    expect(spec.rules.find((r) => r.id === 'labware-role-identity-bearing')?.severity).toBe('warning');
    expect(spec.rules.find((r) => r.id === 'role-id-category-unique')?.severity).toBe('warning');
  });
});

describe('R1 step-role-closure (error): one fixture per schema labwareRole location', () => {
  let engine: LintEngine;

  beforeAll(() => {
    engine = protocolEngine();
  });

  // Every step-kind that carries a role reference, per protocol.schema.yaml:
  //   steps[*].target.labwareRole  — StepAddMaterial/StepMix/StepWash/StepIncubate/StepRead
  //                                  and StepTransfer.target
  //   steps[*].source.labwareRole  — StepTransfer.source and StepHarvest
  //   steps[*].instrumentRole      — StepRead
  const locations: Array<{ name: string; step: Record<string, unknown>; dangling: string }> = [
    {
      name: 'add_material steps[*].target.labwareRole',
      step: {
        stepId: 'add-dye', label: 'Add dye', ordinal: 1, kind: 'add_material',
        target: { labwareRole: 'ghost-dye-plate' },
        material: { materialRole: 'dye' }, volume_uL: 10,
      },
      dangling: 'ghost-dye-plate',
    },
    {
      name: 'transfer steps[*].source.labwareRole',
      step: {
        stepId: 'xfer-out', label: 'Transfer out', ordinal: 1, kind: 'transfer',
        source: { labwareRole: 'ghost-src' },
        target: { labwareRole: 'plate' }, volume_uL: 50,
      },
      dangling: 'ghost-src',
    },
    {
      name: 'transfer steps[*].target.labwareRole',
      step: {
        stepId: 'xfer-in', label: 'Transfer in', ordinal: 1, kind: 'transfer',
        source: { labwareRole: 'plate' },
        target: { labwareRole: 'ghost-tgt' }, volume_uL: 50,
      },
      dangling: 'ghost-tgt',
    },
    {
      name: 'mix steps[*].target.labwareRole',
      step: {
        stepId: 'mix-lib', label: 'Mix library', ordinal: 1, kind: 'mix',
        target: { labwareRole: 'ghost-mix' }, cycles: 3,
      },
      dangling: 'ghost-mix',
    },
    {
      name: 'wash steps[*].target.labwareRole',
      step: {
        stepId: 'wash-plate', label: 'Wash plate', ordinal: 1, kind: 'wash',
        target: { labwareRole: 'ghost-wash' }, cycles: 3,
      },
      dangling: 'ghost-wash',
    },
    {
      name: 'incubate steps[*].target.labwareRole',
      step: {
        stepId: 'inc-bind', label: 'Incubate binding', ordinal: 1, kind: 'incubate',
        target: { labwareRole: 'ghost-inc' }, duration_min: 30,
      },
      dangling: 'ghost-inc',
    },
    {
      name: 'read steps[*].target.labwareRole',
      step: {
        stepId: 'read-od', label: 'Read absorbance', ordinal: 1, kind: 'read',
        target: { labwareRole: 'ghost-read' }, modality: 'absorbance',
      },
      dangling: 'ghost-read',
    },
    {
      name: 'harvest steps[*].source.labwareRole',
      step: {
        stepId: 'harvest-cells', label: 'Harvest cells', ordinal: 1, kind: 'harvest',
        source: { labwareRole: 'ghost-harv' },
      },
      dangling: 'ghost-harv',
    },
    {
      name: 'read steps[*].instrumentRole',
      step: {
        stepId: 'read-fl', label: 'Read fluorescence', ordinal: 1, kind: 'read',
        target: { labwareRole: 'plate' }, modality: 'fluorescence',
        instrumentRole: 'ghost-reader',
      },
      dangling: 'ghost-reader',
    },
  ];

  for (const loc of locations) {
    it(`flags a dangling ${loc.name} as an error naming the step id and the ref`, () => {
      // Fix cycle 1 (defect 1): this fixture is a NEW all-literal protocol on a
      // non-allowlisted id, so R-4 legacy-literal-bounded co-fires BY DESIGN (the
      // guard is now exactly recordId-not-in-allowlist). The co-fire is asserted
      // explicitly below; the R1 pin scopes to the role-integrity finding.
      const r = engine.lint(protocolFixture([loc.step], baseRoles(), 'PRT-r1-dangling'), PROTOCOL);
      expect(r.valid).toBe(false);
      const v = r.violations.find((x) => x.ruleId === 'step-role-closure');
      expect(v).toBeDefined();
      expect(v?.severity).toBe('error');
      // Rendered message names the offending step id AND the dangling value
      // via {{path}} interpolation.
      expect(v?.message).toContain(String(loc.step.stepId));
      expect(v?.message).toContain(loc.dangling);
      // Only R1 fires among the role-integrity rules; R-4 co-fires (recorded).
      expect(roleIntegrityFindings(r.violations)).toHaveLength(1);
      expect(r.violations.filter((x) => x.ruleId === 'legacy-literal-bounded')).toHaveLength(1);
    });
  }

  it('a clean protocol referencing only declared roles yields zero findings', () => {
    const steps = [
      {
        stepId: 'add-dye', label: 'Add dye', ordinal: 1, kind: 'add_material',
        target: { labwareRole: 'plate' }, material: { materialRole: 'dye' }, volume_uL: 10,
      },
      {
        stepId: 'wash-plate', label: 'Wash', ordinal: 2, kind: 'wash',
        target: { labwareRole: 'plate' }, cycles: 3,
      },
      {
        stepId: 'xfer', label: 'Transfer', ordinal: 3, kind: 'transfer',
        source: { labwareRole: 'plate' }, target: { labwareRole: 'plate' }, volume_uL: 20,
      },
      {
        stepId: 'read', label: 'Read', ordinal: 4, kind: 'read',
        target: { labwareRole: 'plate' }, modality: 'absorbance', instrumentRole: 'reader',
      },
    ];
    const r = engine.lint(protocolFixture(steps, baseRoles(), 'prt-seed-biological-transfer'), PROTOCOL);
    expect(r.violations).toEqual([]);
    expect(r.valid).toBe(true);
    expect(r.summary.errors).toBe(0);
    expect(r.summary.warnings).toBe(0);
  });

  it('a protocol with no roles and no step role references stays clean', () => {
    const steps = [
      {
        stepId: 'manual-shake', label: 'Shake by hand', ordinal: 1, kind: 'other',
        description: 'No role references anywhere.',
      },
    ];
    // Fix cycle 1: allowlisted (frozen-inventory) label — a literal-only fixture on a
    // non-allowlisted id would trip R-4 by design (asserted in the co-fire test below).
    const r = engine.lint(protocolFixture(steps, undefined, 'prt-seed-buffer-prep-50ml'), PROTOCOL);
    expect(r.violations).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('a step role reference with NO declared roles block at all is an error', () => {
    const steps = [
      {
        stepId: 'wash-plate', label: 'Wash', ordinal: 1, kind: 'wash',
        target: { labwareRole: 'plate' }, cycles: 3,
      },
    ];
    // Fix cycle 1: non-allowlisted id -> R-4 co-fires (all-literal new protocol); the
    // R1 pin below is unchanged and the co-fire is recorded, not hidden.
    const r = engine.lint(protocolFixture(steps, undefined, 'PRT-r1-nodecl'), PROTOCOL);
    expect(r.valid).toBe(false);
    const v = r.violations.find((x) => x.ruleId === 'step-role-closure');
    expect(v).toBeDefined();
    expect(v?.message).toContain('wash-plate');
    expect(v?.message).toContain('plate');
    expect(r.violations.filter((x) => x.ruleId === 'legacy-literal-bounded')).toHaveLength(1);
  });

  it('fix cycle 1: the widened R-4 guard co-fires on non-allowlisted literal fixtures and stays silent on inventory labels', () => {
    // Same literal steps, two labels: the guard is exactly recordId-not-in-allowlist
    // (no protocolLayer conjunct), so the non-allowlisted label trips R-4 and the
    // frozen-inventory label does not.
    const steps = [
      {
        stepId: 'wash-plate', label: 'Wash', ordinal: 1, kind: 'wash',
        target: { labwareRole: 'plate' }, cycles: 3,
      },
    ];
    const outside = engine.lint(protocolFixture(steps, baseRoles(), 'PRT-r4-widened'), PROTOCOL);
    expect(outside.violations.filter((x) => x.ruleId === 'legacy-literal-bounded')).toHaveLength(1);
    const inside = engine.lint(protocolFixture(steps, baseRoles(), 'prt-seed-pbs-wash'), PROTOCOL);
    expect(inside.violations.filter((x) => x.ruleId === 'legacy-literal-bounded')).toEqual([]);
  });
});

describe('R2 labware-role-identity-bearing (warning)', () => {
  let engine: LintEngine;

  beforeAll(() => {
    engine = protocolEngine();
  });

  function r2Fixture(labwareRoles: Array<Record<string, unknown>>): Record<string, unknown> {
    // Fix cycle 1 (defect 1): the step is intent-bearing so this PROTO-AI-4 probe
    // isolates R2 — an all-literal fixture on a non-allowlisted id also trips R-4
    // by design (asserted explicitly in the R1 co-fire tests, never hidden here).
    return protocolFixture(
      [intentBearingStep('wash-plate', 'wash')],
      { labwareRoles },
      'PRT-r2',
    );
  }

  it('warns on a labwareRole with no description; record stays valid', () => {
    const r = engine.lint(r2Fixture([{ roleId: 'plate', expectedLabwareKinds: ['LBW-plate-96'] }]), PROTOCOL);
    expect(r.valid).toBe(true);
    const v = r.violations.find((x) => x.ruleId === 'labware-role-identity-bearing');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    expect(v?.message).toContain('plate');
    expect(r.summary.warnings).toBe(1);
    expect(r.summary.errors).toBe(0);
  });

  it('warns on a labwareRole with no expectedLabwareKinds', () => {
    const r = engine.lint(r2Fixture([{ roleId: 'plate', description: 'the plate' }]), PROTOCOL);
    expect(r.violations.some((x) => x.ruleId === 'labware-role-identity-bearing')).toBe(true);
  });

  it('warns on a labwareRole with neither', () => {
    const r = engine.lint(r2Fixture([{ roleId: 'plate' }]), PROTOCOL);
    const v = r.violations.find((x) => x.ruleId === 'labware-role-identity-bearing');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
  });

  it('a fully identity-bearing labwareRole produces no R2 finding', () => {
    const r = engine.lint(r2Fixture([identityLabwareRole('plate')]), PROTOCOL);
    expect(r.violations).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('a protocol with no labwareRoles block emits no R2 noise', () => {
    const r = engine.lint(
      protocolFixture(
        [intentBearingStep('note', 'other')],
        { materialRoles: [{ roleId: 'dye', description: 'the dye' }] },
        'PRT-r2-noise',
      ),
      PROTOCOL,
    );
    expect(r.violations).toEqual([]);
  });
});

describe('R3 role-id-category-unique (warning)', () => {
  let engine: LintEngine;

  beforeAll(() => {
    engine = protocolEngine();
  });

  it('warns when the same roleId is both a labwareRole and an instrumentRole', () => {
    const r = engine.lint(
      protocolFixture(
        // Fix cycle 1 (defect 1): intent-bearing step so this probe isolates R3 —
        // an all-literal fixture on a non-allowlisted id also trips R-4 by design
        // (asserted explicitly in the R1 co-fire tests, never hidden here).
        [intentBearingStep('wash-plate', 'wash')],
        {
          labwareRoles: [identityLabwareRole('plate')],
          instrumentRoles: [identityInstrumentRole('plate')],
        },
        'PRT-wlj0qm',
      ),
      PROTOCOL,
    );
    // Warning severity keeps the legacy (PRT-wlj0qm defect-class) record writable.
    expect(r.valid).toBe(true);
    const v = r.violations.find((x) => x.ruleId === 'role-id-category-unique');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    expect(v?.message).toContain('plate');
    expect(r.summary.warnings).toBe(1);
    expect(r.summary.errors).toBe(0);
  });

  it('distinct roleIds across categories produce no R3 finding', () => {
    const r = engine.lint(protocolFixture([], baseRoles(), 'PRT-r3-clean'), PROTOCOL);
    expect(r.violations).toEqual([]);
  });

  it('a protocol with only one role category emits no R3 noise', () => {
    const r = engine.lint(
      protocolFixture([], { labwareRoles: [identityLabwareRole('plate')] }, 'PRT-r3-single'),
      PROTOCOL,
    );
    expect(r.violations).toEqual([]);
  });
});

// =============================================================================
// lint-v1 meta-schema contract for the new generic ops
// =============================================================================

function specWith(assert: Record<string, unknown>): Record<string, unknown> {
  return {
    lintVersion: 1,
    rules: [
      {
        id: 'everyitem-check',
        title: 'Generic everyItem usage',
        severity: 'warning',
        scope: 'record',
        assert,
        message: { template: 'generic everyItem check' },
      },
    ],
  };
}

function lintMetaValidator(): AjvValidator {
  const validator = new AjvValidator();
  const meta = parseYaml(readFileSync(LINT_META_SCHEMA_PATH, 'utf-8'));
  validator.addSchema(meta);
  return validator;
}

describe('everyItem / noneIn meta-schema contract (lint-v1)', () => {
  it('accepts everyItem with collectionPath + nested assert', () => {
    const res = lintMetaValidator().validate(
      specWith({
        op: 'everyItem',
        collectionPath: 'roles.labwareRoles',
        assert: { op: 'nonEmpty', path: 'description' },
      }),
      LINT_META_SCHEMA_ID,
    );
    expect(res.errors.map((e) => `${e.path} ${e.message}`)).toEqual([]);
    expect(res.valid).toBe(true);
  });

  it('rejects an everyItem missing assert, with a location', () => {
    const res = lintMetaValidator().validate(
      specWith({ op: 'everyItem', collectionPath: 'roles' }),
      LINT_META_SCHEMA_ID,
    );
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.path.includes('/rules/0/assert'))).toBe(true);
  });

  it('accepts noneIn with path + collectionPath + itemField', () => {
    const res = lintMetaValidator().validate(
      specWith({
        op: 'noneIn',
        path: 'roles.labwareRoles[*].roleId',
        collectionPath: 'roles.instrumentRoles',
        itemField: 'roleId',
      }),
      LINT_META_SCHEMA_ID,
    );
    expect(res.errors.map((e) => `${e.path} ${e.message}`)).toEqual([]);
    expect(res.valid).toBe(true);
  });

  it('rejects a noneIn missing collectionPath, with a location', () => {
    const res = lintMetaValidator().validate(
      specWith({ op: 'noneIn', path: 'roles.labwareRoles[*].roleId' }),
      LINT_META_SCHEMA_ID,
    );
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.path.includes('/rules/0/assert'))).toBe(true);
  });

  it('the REAL protocol.lint.yaml rules validate against the meta-schema', () => {
    // NB: loadAllLintSpecs does NOT validate specs against lint-v1 (known
    // separate flag), and the meta-schema's root additionalProperties:false
    // predates the file-level `schemaId` convention — so validate the rules
    // projection, which is what the new ops actually exercise.
    const spec = loadProtocolLintSpec();
    const res = lintMetaValidator().validate(
      { lintVersion: spec.lintVersion, rules: spec.rules },
      LINT_META_SCHEMA_ID,
    );
    expect(res.errors.map((e) => `${e.path} ${e.message}`)).toEqual([]);
    expect(res.valid).toBe(true);
  });
});
