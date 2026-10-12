/**
 * W2-3-PROTOCOL-SEMANTIC-UPGRADE — T2 lint rule tests.
 *
 * Harness (mirrors ProtocolLintRules.test.ts:22-55): parse the REAL
 * schema/workflow/protocol.lint.yaml from disk into a LintEngine and lint inline
 * payloads — no HTTP. The meta-schema block checks the lint-v1 contract for the
 * new rules (Ajv is the structural authority).
 *
 * Arms (spec §3 T2):
 *  a. a NEW literal protocol (recordId not in the frozen inventory, literal
 *     volume_uL steps, no intent) -> legacy-literal-bounded ERROR naming the
 *     recordId + step ids
 *  b. each of the six inventory payloads -> ZERO findings (unchanged from base)
 *  c. allowlist member + an intent step -> legacy-inventory-no-intent-drift WARNING
 *  d. intent family fixture -> zero ERRORS; the missing-provenance arm -> exactly
 *     the intent-step-provenance-visible WARNING
 *  e. intent step without semanticVerb -> intent-verb-ref-declared ERROR
 *  f. R-1 role-closure regression stays green (intent role closure gap recorded)
 *  g. meta-schema: the REAL protocol.lint.yaml (with the new rules) validates
 *     against lint-v1
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { LintEngine } from './LintEngine.js';
import { AjvValidator } from '../validation/AjvValidator.js';
import { createUISpecLoader } from '../ui/UISpecLoader.js';
import type { LintSpec } from './types.js';

const PROTOCOL = 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml';
const LINT_META_SCHEMA_ID = 'https://computable-lab.com/schema/lint/lint-v1.schema.yaml';

const PROTOCOL_LINT_PATH = fileURLToPath(
  new URL('../../../schema/workflow/protocol.lint.yaml', import.meta.url),
);
const LINT_META_SCHEMA_PATH = fileURLToPath(
  new URL('../../../schema/lint/lint-v1.schema.yaml', import.meta.url),
);
const SEED_PROTOCOLS_DIR = fileURLToPath(
  new URL('../../../records/seed/protocols', import.meta.url),
);
const PROTOCOL_UI_PATH = fileURLToPath(
  new URL('../../../schema/workflow/protocol.ui.yaml', import.meta.url),
);

const INVENTORY = [
  'prt-seed-biological-transfer',
  'prt-seed-buffer-prep-50ml',
  'prt-seed-incubate-plate',
  'prt-seed-pbs-wash',
  'prt-seed-serial-dilution-96',
  'prt-seed-standard-curve-tubes',
];

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

function verbRef(id: string, canonical: string): Record<string, unknown> {
  return { ref: { kind: 'record', type: 'verb-definition', id }, canonical };
}

function intentStep(stepId: string, ordinal: number, kind: string, intent: Record<string, unknown>): Record<string, unknown> {
  return { stepId, label: `Intent ${stepId}`, ordinal, kind, intent };
}

function protocolPayload(recordId: string, steps: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'protocol',
    recordId,
    protocolLayer: 'universal',
    title: `W2-3 lint fixture ${recordId}`,
    steps,
    ...extra,
  };
}

function intentFamilyPayload(recordId = 'PRT-w23-lint-family'): Record<string, unknown> {
  return protocolPayload(recordId, [
    intentStep('inc-batch', 1, 'incubate', {
      semanticVerb: verbRef('VERB-INCUBATE', 'incubate'),
      materialNeeds: [{ need: 'beads', capabilityRequirement: { kind: 'ontology', id: 'CL:bead_beater', namespace: 'CL', label: 'bead beater' } }],
      constraints: [{ class: 'capacity', bindingKind: 'hard_bound', bound: { value: 200, unit: 'uL', dimension: 'volume' } }],
      provenance: [{ kind: 'record', type: 'vendor-protocol-candidate', id: 'CAN-w23-demo', pageStart: 1 }],
    }),
    intentStep('read-od', 2, 'read', {
      semanticVerb: verbRef('VERB-READ', 'read'),
      provenance: [{ kind: 'record', type: 'vendor-protocol-candidate', id: 'CAN-w23-demo', pageStart: 2 }],
    }),
  ], {
    roles: {
      materialRoles: [{ roleId: 'beads', description: 'Bashing beads' }],
      labwareRoles: [{ roleId: 'tube', description: '2 mL tube', expectedLabwareKinds: ['80x2ml-tube-rack'] }],
      instrumentRoles: [],
    },
  });
}

// ---------------------------------------------------------------------------
// (a) NEW literal protocols are refused by the legacy-bounds lint
// ---------------------------------------------------------------------------

describe('legacy-literal-bounded (error): newly authored literal protocols cannot qualify', () => {
  let engine: LintEngine;
  beforeAll(() => { engine = protocolEngine(); });

  it('rejects a new all-literal protocol, naming the recordId and the step ids', () => {
    const payload = protocolPayload('PRT-w23-new-literal', [
      { stepId: 'add-dye', label: 'Add dye', ordinal: 1, kind: 'add_material', target: { labwareRole: 'plate' }, wells: { kind: 'all' }, material: { materialRole: 'dye' }, volume_uL: 10 },
      { stepId: 'wash-plate', label: 'Wash', ordinal: 2, kind: 'wash', target: { labwareRole: 'plate' }, wells: { kind: 'all' }, cycles: 3 },
    ], { roles: { labwareRoles: [{ roleId: 'plate', description: 'plate', expectedLabwareKinds: ['LBW-plate-96'] }], instrumentRoles: [] } });
    const r = engine.lint(payload, PROTOCOL);
    expect(r.valid).toBe(false);
    const v = r.violations.find((x) => x.ruleId === 'legacy-literal-bounded');
    expect(v, 'legacy-literal-bounded fires').toBeDefined();
    expect(v!.severity).toBe('error');
    expect(v!.message).toContain('PRT-w23-new-literal');
    expect(v!.message).toContain('add-dye');
    expect(v!.message).toContain('wash-plate');
  });

  it('rejects a MIXED new protocol (one intent step + one literal step) — strict form (OQ1 accepted)', () => {
    const payload = protocolPayload('PRT-w23-mixed', [
      intentStep('inc-batch', 1, 'incubate', { semanticVerb: verbRef('VERB-INCUBATE', 'incubate') }),
      { stepId: 'wash-plate', label: 'Wash', ordinal: 2, kind: 'wash', target: { labwareRole: 'plate' }, wells: { kind: 'all' }, cycles: 3 },
    ], { roles: { labwareRoles: [{ roleId: 'plate', description: 'plate', expectedLabwareKinds: ['LBW-plate-96'] }], instrumentRoles: [] } });
    const r = engine.lint(payload, PROTOCOL);
    const v = r.violations.find((x) => x.ruleId === 'legacy-literal-bounded');
    expect(v, 'legacy-literal-bounded fires on the mixed protocol').toBeDefined();
    expect(v!.message).toContain('wash-plate');
  });

  it('a fully intent-bearing new protocol passes the legacy-bounds rule', () => {
    const r = engine.lint(intentFamilyPayload('PRT-w23-intent-only'), PROTOCOL);
    expect(r.violations.filter((x) => x.ruleId === 'legacy-literal-bounded')).toEqual([]);
  });

  it('rejects a new all-literal protocol that OMITS protocolLayer (guard has no protocolLayer conjunct)', () => {
    // Fix-cycle defect 1: protocolLayer is NOT in the schema root required list
    // (protocol.schema.yaml:12-16), so a `when` guard on protocolLayer would let a
    // new all-literal protocol that omits the field slip through. The guard is
    // exactly NOT(recordId in the frozen allowlist) (spec §2.2 R-4).
    const payload = protocolPayload('PRT-w23-new-literal-no-layer', [
      { stepId: 'add-dye', label: 'Add dye', ordinal: 1, kind: 'add_material', target: { labwareRole: 'plate' }, wells: { kind: 'all' }, material: { materialRole: 'dye' }, volume_uL: 10 },
      { stepId: 'wash-plate', label: 'Wash', ordinal: 2, kind: 'wash', target: { labwareRole: 'plate' }, wells: { kind: 'all' }, cycles: 3 },
    ], { roles: { labwareRoles: [{ roleId: 'plate', description: 'plate', expectedLabwareKinds: ['LBW-plate-96'] }], instrumentRoles: [] } });
    delete payload.protocolLayer;
    const r = engine.lint(payload, PROTOCOL);
    expect(r.valid).toBe(false);
    const v = r.violations.find((x) => x.ruleId === 'legacy-literal-bounded');
    expect(v, 'legacy-literal-bounded fires without protocolLayer').toBeDefined();
    expect(v!.severity).toBe('error');
    expect(v!.message).toContain('PRT-w23-new-literal-no-layer');
    expect(v!.message).toContain('add-dye');
    expect(v!.message).toContain('wash-plate');
  });
});

// ---------------------------------------------------------------------------
// (b) the frozen inventory stays clean (zero findings, unchanged from base)
// ---------------------------------------------------------------------------

describe('legacy inventory payloads: zero findings from the new rules', () => {
  let engine: LintEngine;
  beforeAll(() => { engine = protocolEngine(); });

  const files = readdirSync(SEED_PROTOCOLS_DIR).filter((f) => f.endsWith('.yaml')).sort();
  expect(files.length).toBe(6);

  for (const file of files) {
    it(`${file} yields zero findings (base outcome preserved)`, () => {
      const payload = parseYaml(readFileSync(`${SEED_PROTOCOLS_DIR}/${file}`, 'utf-8')) as Record<string, unknown>;
      delete payload.$schema;
      const r = engine.lint(payload, PROTOCOL);
      expect(r.violations.map((v) => v.ruleId), file).toEqual([]);
      expect(r.valid, file).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// (c) the frozen inventory must NOT drift toward semantic without the lifecycle
// ---------------------------------------------------------------------------

describe('legacy-inventory-no-intent-drift (warning)', () => {
  let engine: LintEngine;
  beforeAll(() => { engine = protocolEngine(); });

  it('warns when an allowlisted legacy record carries an intent step', () => {
    const payload = protocolPayload('prt-seed-pbs-wash', [
      { stepId: 'step-1', label: 'Add PBS', ordinal: 1, kind: 'add_material', target: { labwareRole: 'plate' }, wells: { kind: 'all' }, material: { materialRole: 'wash_buffer' }, volume_uL: 200 },
      intentStep('step-2', 2, 'incubate', { semanticVerb: verbRef('VERB-INCUBATE', 'incubate') }),
    ], { roles: { labwareRoles: [{ roleId: 'plate', description: 'plate', expectedLabwareKinds: ['LBW-plate-96'] }], instrumentRoles: [] } });
    const r = engine.lint(payload, PROTOCOL);
    const v = r.violations.find((x) => x.ruleId === 'legacy-inventory-no-intent-drift');
    expect(v, 'drift warning fires').toBeDefined();
    expect(v!.severity).toBe('warning');
    expect(v!.message).toContain('prt-seed-pbs-wash');
    // warning severity: the record stays writable
    expect(r.valid).toBe(true);
  });

  it('stays silent on the untouched inventory (no false drift)', () => {
    const payload = protocolPayload('prt-seed-pbs-wash', [
      { stepId: 'step-1', label: 'Add PBS', ordinal: 1, kind: 'add_material', target: { labwareRole: 'plate' }, wells: { kind: 'all' }, material: { materialRole: 'wash_buffer' }, volume_uL: 200 },
    ], { roles: { labwareRoles: [{ roleId: 'plate', description: 'plate', expectedLabwareKinds: ['LBW-plate-96'] }], instrumentRoles: [] } });
    const r = engine.lint(payload, PROTOCOL);
    expect(r.violations.filter((x) => x.ruleId === 'legacy-inventory-no-intent-drift')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (d) intent well-formedness: provenance visibility
// ---------------------------------------------------------------------------

describe('intent-step-provenance-visible (warning)', () => {
  let engine: LintEngine;
  beforeAll(() => { engine = protocolEngine(); });

  it('the intent family fixture yields ZERO ERRORS', () => {
    const r = engine.lint(intentFamilyPayload(), PROTOCOL);
    expect(r.summary.errors, JSON.stringify(r.violations.map((v) => `${v.ruleId}:${v.message}`))).toBe(0);
  });

  it('an intent step WITHOUT provenance yields exactly the provenance warning', () => {
    const payload = intentFamilyPayload('PRT-w23-noprov');
    const steps = payload.steps as Array<Record<string, unknown>>;
    const intent = { ...(steps[0]!.intent as Record<string, unknown>) };
    delete intent.provenance;
    steps[0] = { ...steps[0]!, intent };
    const r = engine.lint(payload, PROTOCOL);
    const prov = r.violations.filter((v) => v.ruleId === 'intent-step-provenance-visible');
    expect(prov).toHaveLength(1);
    expect(prov[0]!.severity).toBe('warning');
    expect(prov[0]!.message).toContain('inc-batch');
    expect(r.summary.errors).toBe(0);
    // and it is the ONLY finding on this payload
    expect(r.violations.map((v) => v.ruleId)).toEqual(['intent-step-provenance-visible']);
  });
});

// ---------------------------------------------------------------------------
// (e) intent verb ref declared (belt-and-braces over the schema required)
// ---------------------------------------------------------------------------

describe('intent-verb-ref-declared (error)', () => {
  let engine: LintEngine;
  beforeAll(() => { engine = protocolEngine(); });

  it('an intent step without semanticVerb fires the exact rule id', () => {
    const payload = intentFamilyPayload('PRT-w23-noverb');
    const steps = payload.steps as Array<Record<string, unknown>>;
    steps[1] = intentStep('read-od', 2, 'read', { intentNotes: 'half-authored draft' });
    const r = engine.lint(payload, PROTOCOL);
    const v = r.violations.find((x) => x.ruleId === 'intent-verb-ref-declared');
    expect(v, 'intent-verb-ref-declared fires').toBeDefined();
    expect(v!.severity).toBe('error');
    expect(v!.message).toContain('read-od');
  });
});

// ---------------------------------------------------------------------------
// (f) R1-R3 regression: role closure still fires exactly as before
// ---------------------------------------------------------------------------

describe('R1 step-role-closure regression (intent era)', () => {
  let engine: LintEngine;
  beforeAll(() => { engine = protocolEngine(); });

  it('a dangling literal role reference still errors via step-role-closure alone', () => {
    const payload = protocolPayload('PRT-w23-r1', [
      { stepId: 'add-dye', label: 'Add dye', ordinal: 1, kind: 'add_material', target: { labwareRole: 'ghost-dye-plate' }, wells: { kind: 'all' }, material: { materialRole: 'dye' }, volume_uL: 10 },
    ], { roles: { labwareRoles: [{ roleId: 'plate', description: 'plate', expectedLabwareKinds: ['LBW-plate-96'] }], instrumentRoles: [] } });
    const r = engine.lint(payload, PROTOCOL);
    const ids = r.violations.map((v) => v.ruleId);
    expect(ids).toContain('step-role-closure');
    // legacy-literal-bounded also fires (this is a new literal protocol) — recorded, not hidden
    expect(ids).toContain('legacy-literal-bounded');
  });

  it('intent materialNeed role closure is NOT mechanically expressible in the current DSL (recorded gap, spec §8.5): an undeclared need does not fire any rule', () => {
    // PathResolver cannot project `steps[*].intent.materialNeeds[*].need` as a flat
    // value list (double wildcard yields a nested array), and everyItem sub-asserts
    // cannot reach the record-level roles collection. So intent-role closure stays a
    // recorded gap for W2-5/W2-6 — asserted here so the gap is visible, not silent.
    const payload = intentFamilyPayload('PRT-w23-ghostrole');
    const steps = payload.steps as Array<Record<string, unknown>>;
    const intent = { ...(steps[0]!.intent as Record<string, unknown>) };
    intent.materialNeeds = [{ need: 'undeclared-ghost-role' }];
    steps[0] = { ...steps[0]!, intent };
    const r = engine.lint(payload, PROTOCOL);
    expect(r.summary.errors).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// (g) meta-schema: the REAL protocol.lint.yaml validates against lint-v1
// ---------------------------------------------------------------------------

describe('protocol.lint.yaml meta-schema contract', () => {
  it('the real spec (with the W2-3 rules) validates against lint-v1', () => {
    // Same projection the frozen ProtocolLintRules.test.ts uses: the meta-schema's
    // root additionalProperties:false predates the file-level `schemaId` convention.
    const meta = parseYaml(readFileSync(LINT_META_SCHEMA_PATH, 'utf-8')) as Record<string, unknown>;
    const spec = loadProtocolLintSpec();
    const ajv = new AjvValidator({ strict: false });
    const compiled = ajv.compile(meta);
    const ok = compiled({ lintVersion: spec.lintVersion, rules: spec.rules });
    expect(ok, JSON.stringify(compiled.errors ?? [])).toBe(true);
  });

  it('the W2-3 rule ids are declared with the mandated prefixes and severities', () => {
    const spec = loadProtocolLintSpec();
    const ids = spec.rules.map((r) => r.id);
    for (const required of [
      'legacy-literal-bounded',
      'legacy-inventory-no-intent-drift',
      'intent-step-provenance-visible',
      'intent-verb-ref-declared',
    ]) {
      expect(ids, `rule ${required} declared`).toContain(required);
    }
    expect(spec.rules.find((r) => r.id === 'legacy-literal-bounded')?.severity).toBe('error');
    expect(spec.rules.find((r) => r.id === 'legacy-inventory-no-intent-drift')?.severity).toBe('warning');
    expect(spec.rules.find((r) => r.id === 'intent-step-provenance-visible')?.severity).toBe('warning');
    expect(spec.rules.find((r) => r.id === 'intent-verb-ref-declared')?.severity).toBe('error');
    // R1-R3 remain declared and untouched
    for (const legacy of ['step-role-closure', 'labware-role-identity-bearing', 'role-id-category-unique']) {
      expect(ids).toContain(legacy);
    }
  });
});

// T3 meta arm (spec §4): the edited UI spec loads through the REAL loader —
// the intent display hints are valid ui-v1 data (schema is data; app untouched).
describe('protocol.ui.yaml (W2-3 intent hints) loads through UISpecLoader', () => {
  it('the edited spec loads with zero validation errors and carries the Intent section', () => {
    const loader = createUISpecLoader();
    const result = loader.load(readFileSync(PROTOCOL_UI_PATH, 'utf-8'), PROTOCOL_UI_PATH);
    expect(result.success, JSON.stringify(result.validationErrors ?? result.error)).toBe(true);
    const sections = (result.spec?.form?.sections ?? []).map((s) => s.title);
    expect(sections).toContain('Intent');
    const intent = (result.spec?.form?.sections ?? []).find((s) => s.title === 'Intent');
    const paths = (intent?.fields ?? []).map((f) => f.path);
    expect(paths).toEqual([
      '$.steps[*].intent.semanticVerb',
      '$.steps[*].intent.materialNeeds',
      '$.steps[*].intent.constraints',
      '$.steps[*].intent.provenance',
    ]);
  });
});
