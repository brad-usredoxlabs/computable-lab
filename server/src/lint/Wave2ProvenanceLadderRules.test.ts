/**
 * W2-4-PROVENANCE-LADDER — T2 lint rule tests (spec §3 T2).
 *
 * Harness (COPY of ProtocolLintRules.test.ts:22-55): parse the REAL YAML lint
 * specs from disk into a LintEngine and lint inline payloads directly — no
 * HTTP. Every firing fixture proves non-vacuity; every clean fixture pins the
 * exact finding SET (bait §8.2: guard silence is asserted as a SET, not
 * "no crash").
 *
 * Arms:
 *  a. vocabulary (doc_id schemaId): clean -> zero findings; mutations fire
 *     R1 (fifth/renamed rung), R2 (stripped lineage), R3 (DERIVED->VENDOR
 *     edge — the DATA-leg no-promotion wall), R4 (attestation_field creep)
 *  b. candidate (exact candidate $id incl. the workflow/ segment — bait §8.3):
 *     clean -> zero prov-vendor findings; missing pageStart fires
 *     prov-vendor-facts-document-anchored (all nine fact arrays covered,
 *     bait §8.7); rung key on provenance fires prov-vendor-no-rung-attestation;
 *     validatedBy on a step fires prov-vendor-specifications-not-step-params
 *  c. protocol: legacy payload -> ZERO prov-* findings; present-but-unanchored
 *     provenance -> prov-derived-conclusions-anchored ERROR; right-type
 *     wrong-id -> prov-derived-never-vendor-carrier ERROR; missing provenance
 *     -> exactly W2-3's R-6 WARNING and zero prov-derived findings (the
 *     warning/error split pinned as a SET); the six prt-seed-* payloads ->
 *     zero prov-* findings
 *  d. local-protocol: clean -> zero ERRORs; matched axis without choices ->
 *     prov-local-choices-recorded ERROR; unmatched axis -> silent;
 *     substitution without rationale -> prov-local-substitution-rationale
 *     WARNING; legacy LPR -> zero findings. Includes the named nonEmpty-object
 *     probe ({} vs absent).
 *  e. existing suites' rule ids stay declared (no W2-3 rule was edited)
 *  f. rule-id global-uniqueness boot proof: addSpec ALL shipped specs into
 *     ONE engine without the Duplicate throw (LintEngine.ts:59-61)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { LintEngine } from './LintEngine.js';
import { evaluatePredicate } from './PredicateEvaluator.js';
import { loadAllLintSpecs } from './LintSpecLoader.js';
import type { LintSpec, Predicate } from './types.js';

const PROTOCOL = 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml';
const CANDIDATE =
  'https://computable-lab.com/schema/computable-lab/workflow/vendor-protocol-candidate.schema.yaml';
const LOCAL_PROTOCOL = 'https://computable-lab.com/schema/computable-lab/local-protocol.schema.yaml';

const VOCAB_DIR = fileURLToPath(new URL('../../../schema/registry/provenance-ladder', import.meta.url));
const PROTOCOL_LINT_PATH = fileURLToPath(new URL('../../../schema/workflow/protocol.lint.yaml', import.meta.url));
const CANDIDATE_LINT_PATH = fileURLToPath(
  new URL('../../../schema/workflow/vendor-protocol-candidate.lint.yaml', import.meta.url),
);
const LOCAL_LINT_PATH = fileURLToPath(new URL('../../../schema/workflow/local-protocol.lint.yaml', import.meta.url));
const SEED_PROTOCOLS_DIR = fileURLToPath(new URL('../../../records/seed/protocols', import.meta.url));

const VOCAB_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/registry/provenance-rung-vocabulary';

function loadSpec(path: string, name: string): LintSpec {
  const parsed = parseYaml(readFileSync(path, 'utf-8')) as LintSpec;
  if (typeof parsed.lintVersion !== 'number' || !Array.isArray(parsed.rules)) {
    throw new Error(`Invalid lint spec: ${name}`);
  }
  return parsed;
}

function vocabSpec(): LintSpec {
  return loadSpec(`${VOCAB_DIR}/rung-vocabulary.lint.yaml`, 'rung-vocabulary');
}
function candidateSpec(): LintSpec {
  return loadSpec(CANDIDATE_LINT_PATH, 'vendor-protocol-candidate');
}
function protocolSpec(): LintSpec {
  return loadSpec(PROTOCOL_LINT_PATH, 'protocol');
}
function localSpec(): LintSpec {
  return loadSpec(LOCAL_LINT_PATH, 'local-protocol');
}

function provFindings(violations: Array<{ ruleId: string }>): string[] {
  return violations.map((v) => v.ruleId).filter((id) => id.startsWith('prov-'));
}

// ---------------------------------------------------------------------------
// shared fixtures
// ---------------------------------------------------------------------------

function cleanVocab(): Record<string, unknown> {
  return parseYaml(readFileSync(`${VOCAB_DIR}/rung-vocabulary.yaml`, 'utf-8')) as Record<string, unknown>;
}

function candidateFixture(): Record<string, unknown> {
  const provenance = { documentId: 'doc-w24-1', pageStart: 1 };
  const extracted = (id: string): Record<string, unknown> => ({
    id,
    label: `Extracted ${id}`,
    sourceText: 'source text',
    provenance: { ...provenance },
    confidence: 0.9,
  });
  return {
    kind: 'vendor-protocol-candidate',
    source: { documentId: 'doc-w24-1', filename: 'w24.pdf', pageCount: 3 },
    title: 'W2-4 candidate lint fixture',
    sections: [{ id: 'sec-spec', kind: 'specifications', title: 'Specifications', provenance: { ...provenance } }],
    materials: [extracted('mat-1')],
    equipment: [extracted('eq-1')],
    labware: [extracted('lw-1')],
    steps: [
      {
        id: 'step-1',
        stepNumber: 1,
        sourceText: 'Add reagent to the plate.',
        actions: [{ actionKind: 'add', sourceText: 'Add reagent', provenance: { ...provenance } }],
        conditions: {},
        materials: ['mat-1'],
        labware: ['lw-1'],
        equipment: [],
        notes: [],
        branches: [],
        provenance: { ...provenance },
        confidence: 0.9,
      },
    ],
    tables: [
      {
        id: 'tbl-1',
        title: 'Reagents',
        headers: ['name'],
        rows: [{ name: 'reagent A' }],
        sourceText: 'table text',
        provenance: { ...provenance },
      },
    ],
    notes: [extracted('note-1')],
    outputs: [extracted('out-1')],
    diagnostics: [],
  };
}

function verbRef(id: string, canonical: string): Record<string, unknown> {
  return { ref: { kind: 'record', type: 'verb-definition', id }, canonical };
}

function intentStep(stepId: string, ordinal: number, kind: string, intent: Record<string, unknown>): Record<string, unknown> {
  return { stepId, label: `Intent ${stepId}`, ordinal, kind, intent };
}

function protocolPayload(recordId: string, steps: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    kind: 'protocol',
    recordId,
    protocolLayer: 'universal',
    title: `W2-4 lint fixture ${recordId}`,
    steps,
  };
}

function legacyProtocolPayload(): Record<string, unknown> {
  return protocolPayload('PRT-w24-legacy', [
    {
      stepId: 'wash-plate',
      label: 'Wash',
      ordinal: 1,
      kind: 'wash',
      target: { labwareRole: 'plate' },
      wells: { kind: 'all' },
      cycles: 3,
    },
  ]);
}

function anchoredIntentPayload(recordId = 'PRT-w24-anchored'): Record<string, unknown> {
  return protocolPayload(recordId, [
    intentStep('inc-batch', 1, 'incubate', {
      semanticVerb: verbRef('VERB-INCUBATE', 'incubate'),
      provenance: [{ kind: 'record', type: 'vendor-protocol-candidate', id: 'CAN-w24-demo', pageStart: 1 }],
    }),
  ]);
}

function lprPayload(branchResolution: Array<Record<string, unknown>> | undefined, overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    kind: 'local-protocol',
    recordId: 'LPR-w24-lint-fixture',
    title: 'W2-4 local protocol lint fixture',
    inherits_from: { kind: 'record', id: 'PRT-w24-family', type: 'protocol' },
    status: 'active',
    ...(branchResolution !== undefined ? { branch_resolution: branchResolution } : {}),
    ...(overrides !== undefined ? { overrides } : {}),
  };
}

// ---------------------------------------------------------------------------
// (a) vocabulary lint: clean silent, mutations fire
// ---------------------------------------------------------------------------

describe('rung-vocabulary lint (prov-vocab-*)', () => {
  let engine: LintEngine;
  beforeAll(() => {
    engine = new LintEngine();
    engine.addSpec('rung-vocabulary', vocabSpec());
  });

  it('the shipped vocabulary produces ZERO findings (clean data)', () => {
    const r = engine.lint(cleanVocab(), VOCAB_SCHEMA_ID);
    expect(r.violations.map((v) => `${v.ruleId}`), JSON.stringify(r.violations)).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('R1 fires on a renamed rung', () => {
    const vocab = cleanVocab();
    const rungs = vocab.rungs as Array<Record<string, unknown>>;
    rungs[1] = { ...rungs[1]!, id: 'CONCLUDED' };
    const r = engine.lint(vocab, VOCAB_SCHEMA_ID);
    const v = r.violations.find((x) => x.ruleId === 'prov-vocab-four-rungs-exact');
    expect(v, 'renamed rung fires R1').toBeDefined();
    expect(v!.severity).toBe('error');
  });

  it('R1 fires on a fifth rung', () => {
    const vocab = cleanVocab();
    const rungs = vocab.rungs as Array<Record<string, unknown>>;
    rungs.push({
      id: 'ATTESTED',
      curie: 'cf:provenance-attested',
      carrier: 'mutation arm',
      lineage_required: 'mutation arm',
    });
    const r = engine.lint(vocab, VOCAB_SCHEMA_ID);
    expect(r.violations.map((x) => x.ruleId)).toContain('prov-vocab-four-rungs-exact');
  });

  it('R2 fires when a rung lineage requirement is stripped', () => {
    const vocab = cleanVocab();
    const rungs = vocab.rungs as Array<Record<string, unknown>>;
    rungs[0] = { ...rungs[0]!, lineage_required: '' };
    const r = engine.lint(vocab, VOCAB_SCHEMA_ID);
    const v = r.violations.find((x) => x.ruleId === 'prov-vocab-lineage-declared');
    expect(v, 'stripped lineage fires R2').toBeDefined();
  });

  it('R3 fires on a declared transition whose target is VENDOR from a non-VENDOR source (the DATA-leg no-promotion wall)', () => {
    const vocab = cleanVocab();
    const policy = vocab.transition_policy as Record<string, unknown>;
    const transitions = policy.transitions as Array<Record<string, unknown>>;
    transitions.push({ source: 'DERIVED', target: 'VENDOR', via: 'mutation arm' });
    const r = engine.lint(vocab, VOCAB_SCHEMA_ID);
    const v = r.violations.find((x) => x.ruleId === 'prov-vocab-no-vendor-promotion-edge');
    expect(v, 'DERIVED->VENDOR edge fires R3').toBeDefined();
    expect(v!.severity).toBe('error');
    // the failure reason names the item index (evaluatePredicate directly)
    const rule = vocabSpec().rules.find((x) => x.id === 'prov-vocab-no-vendor-promotion-edge')!;
    const direct = evaluatePredicate(rule.assert as Predicate, vocab);
    expect(direct.result).toBe(false);
    expect(direct.reason).toMatch(/item \d+/);
  });

  it('R4 fires when an attestation_field creeps into derived_queries', () => {
    const vocab = cleanVocab();
    const queries = vocab.derived_queries as Array<Record<string, unknown>>;
    queries[0] = { ...queries[0]!, attestation_field: 'locallyValidated' };
    const r = engine.lint(vocab, VOCAB_SCHEMA_ID);
    const v = r.violations.find((x) => x.ruleId === 'prov-vocab-locally-validated-is-derived');
    expect(v, 'attestation creep fires R4').toBeDefined();
  });

  it('R4 fires when a derived query claims a rung other than DERIVED', () => {
    const vocab = cleanVocab();
    const queries = vocab.derived_queries as Array<Record<string, unknown>>;
    queries[0] = { ...queries[0]!, rung_effect: 'VENDOR' };
    const r = engine.lint(vocab, VOCAB_SCHEMA_ID);
    expect(r.violations.map((x) => x.ruleId)).toContain('prov-vocab-locally-validated-is-derived');
  });
});

// ---------------------------------------------------------------------------
// (b) candidate lint: VENDOR lineage on every fact array
// ---------------------------------------------------------------------------

describe('vendor-protocol-candidate lint (prov-vendor-*)', () => {
  let engine: LintEngine;
  beforeAll(() => {
    engine = new LintEngine();
    engine.addSpec('vendor-protocol-candidate', candidateSpec());
  });

  it('the clean candidate yields ZERO prov-vendor findings', () => {
    const r = engine.lint(candidateFixture(), CANDIDATE);
    expect(provFindings(r.violations), JSON.stringify(r.violations)).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('a fact missing pageStart fires prov-vendor-facts-document-anchored naming the array + item', () => {
    const payload = candidateFixture();
    const materials = payload.materials as Array<Record<string, unknown>>;
    materials[0] = { ...materials[0]!, provenance: { documentId: 'doc-w24-1' } };
    const r = engine.lint(payload, CANDIDATE);
    const v = r.violations.find((x) => x.ruleId === 'prov-vendor-facts-document-anchored');
    expect(v, 'missing pageStart fires').toBeDefined();
    expect(v!.severity).toBe('error');
    expect(v!.message).toContain('mat-1');
    // the DSL reason names the failing array + item index
    const rule = candidateSpec().rules.find((x) => x.id === 'prov-vendor-facts-document-anchored')!;
    const direct = evaluatePredicate(rule.assert as Predicate, payload);
    expect(direct.result).toBe(false);
    expect(direct.reason).toContain('materials');
    expect(direct.reason).toMatch(/item 0/);
  });

  it('ALL NINE provenance-carrying arrays are covered (bait §8.7): each one fires independently', () => {
    const arrays: Array<{ key: string; id: string }> = [
      { key: 'sections', id: 'sec-spec' },
      { key: 'steps', id: 'step-1' },
      { key: 'tables', id: 'tbl-1' },
      { key: 'materials', id: 'mat-1' },
      { key: 'equipment', id: 'eq-1' },
      { key: 'labware', id: 'lw-1' },
      { key: 'notes', id: 'note-1' },
      { key: 'outputs', id: 'out-1' },
    ];
    for (const { key, id } of arrays) {
      const payload = candidateFixture();
      const arr = payload[key] as Array<Record<string, unknown>>;
      arr[0] = { ...arr[0]!, provenance: { documentId: 'doc-w24-1' } };
      const r = engine.lint(payload, CANDIDATE);
      const v = r.violations.find((x) => x.ruleId === 'prov-vendor-facts-document-anchored');
      expect(v, `array ${key} is covered`).toBeDefined();
      expect(v!.message, `array ${key} names the offender`).toContain(id);
    }
    // the ninth provenance-carrying surface: actions inside steps
    const payload = candidateFixture();
    const steps = payload.steps as Array<Record<string, unknown>>;
    const actions = steps[0]!.actions as Array<Record<string, unknown>>;
    actions[0] = { ...actions[0]!, provenance: { documentId: 'doc-w24-1' } };
    const r = engine.lint(payload, CANDIDATE);
    expect(r.violations.map((x) => x.ruleId)).toContain('prov-vendor-facts-document-anchored');
  });

  it('a rung key on a fact provenance fires prov-vendor-no-rung-attestation (engine-linted payload; the schema-leg REJECT is T1 d)', () => {
    const payload = candidateFixture();
    const steps = payload.steps as Array<Record<string, unknown>>;
    const provenance = { ...(steps[0]!.provenance as Record<string, unknown>), rung: 'DERIVED' };
    steps[0] = { ...steps[0]!, provenance };
    const r = engine.lint(payload, CANDIDATE);
    const v = r.violations.find((x) => x.ruleId === 'prov-vendor-no-rung-attestation');
    expect(v, 'rung key on provenance fires the belt rule').toBeDefined();
    expect(v!.severity).toBe('error');
  });

  it('a validatedBy key on a step fires prov-vendor-specifications-not-step-params', () => {
    const payload = candidateFixture();
    const steps = payload.steps as Array<Record<string, unknown>>;
    steps[0] = { ...steps[0]!, validatedBy: 'vendor QA' };
    const r = engine.lint(payload, CANDIDATE);
    const v = r.violations.find((x) => x.ruleId === 'prov-vendor-specifications-not-step-params');
    expect(v, 'validatedBy on a step fires R3').toBeDefined();
    expect(v!.severity).toBe('error');
  });

  it('the specifications section + labware item pair (the two-step vendor-validated-labware fact) is clean', () => {
    const r = engine.lint(candidateFixture(), CANDIDATE);
    expect(provFindings(r.violations)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (c) protocol lint: DERIVED lineage on intent-step provenance
// ---------------------------------------------------------------------------

describe('protocol lint additions (prov-derived-*)', () => {
  let engine: LintEngine;
  beforeAll(() => {
    engine = new LintEngine();
    engine.addSpec('protocol', protocolSpec());
  });

  it('a legacy protocol (no intent) emits ZERO prov-* findings (when-guard silence, pinned as a SET)', () => {
    const r = engine.lint(legacyProtocolPayload(), PROTOCOL);
    expect(provFindings(r.violations)).toEqual([]);
  });

  it('an anchored intent provenance yields zero prov-derived findings', () => {
    const r = engine.lint(anchoredIntentPayload(), PROTOCOL);
    expect(provFindings(r.violations), JSON.stringify(r.violations)).toEqual([]);
  });

  it('present-but-unanchored provenance fires prov-derived-conclusions-anchored naming the stepId', () => {
    const payload = anchoredIntentPayload('PRT-w24-unanchored');
    const steps = payload.steps as Array<Record<string, unknown>>;
    const intent = { ...(steps[0]!.intent as Record<string, unknown>) };
    intent.provenance = [{ kind: 'record', type: 'vendor-protocol-candidate', id: 'CAN-w24-demo' }];
    steps[0] = { ...steps[0]!, intent };
    const r = engine.lint(payload, PROTOCOL);
    const v = r.violations.find((x) => x.ruleId === 'prov-derived-conclusions-anchored');
    expect(v, 'unanchored provenance fires R-8 (error)').toBeDefined();
    expect(v!.severity).toBe('error');
    expect(v!.message).toContain('inc-batch');
  });

  it('right-type wrong-id provenance fires prov-derived-never-vendor-carrier (the lint leg of no-promotion)', () => {
    const payload = anchoredIntentPayload('PRT-w24-wrongid');
    const steps = payload.steps as Array<Record<string, unknown>>;
    const intent = { ...(steps[0]!.intent as Record<string, unknown>) };
    intent.provenance = [{ kind: 'record', type: 'vendor-protocol-candidate', id: 'RUN-000041', pageStart: 1 }];
    steps[0] = { ...steps[0]!, intent };
    const r = engine.lint(payload, PROTOCOL);
    const v = r.violations.find((x) => x.ruleId === 'prov-derived-never-vendor-carrier');
    expect(v, 'candidate-typed run id fires R-9').toBeDefined();
    expect(v!.severity).toBe('error');
    expect(v!.message).toContain('inc-batch');
  });

  it('missing provenance yields EXACTLY W2-3 R-6 WARNING and zero prov-derived findings (the split, pinned)', () => {
    const payload = anchoredIntentPayload('PRT-w24-noprov');
    const steps = payload.steps as Array<Record<string, unknown>>;
    const intent = { ...(steps[0]!.intent as Record<string, unknown>) };
    delete intent.provenance;
    steps[0] = { ...steps[0]!, intent };
    const r = engine.lint(payload, PROTOCOL);
    expect(r.violations.map((v) => v.ruleId)).toEqual(['intent-step-provenance-visible']);
    expect(r.violations[0]!.severity).toBe('warning');
    expect(provFindings(r.violations)).toEqual([]);
  });

  it('the six prt-seed-* payloads yield zero prov-* findings (read from disk)', () => {
    const files = readdirSync(SEED_PROTOCOLS_DIR).filter((f) => f.endsWith('.yaml')).sort();
    expect(files.length).toBe(6);
    for (const file of files) {
      const payload = parseYaml(readFileSync(`${SEED_PROTOCOLS_DIR}/${file}`, 'utf-8')) as Record<string, unknown>;
      delete payload.$schema;
      const r = engine.lint(payload, PROTOCOL);
      expect(provFindings(r.violations), file).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// (d) local-protocol lint: LOCAL_REALIZATION lineage
// ---------------------------------------------------------------------------

describe('local-protocol lint (prov-local-*)', () => {
  let engine: LintEngine;
  beforeAll(() => {
    engine = new LintEngine();
    engine.addSpec('local-protocol', localSpec());
  });

  it('a realization with recorded choices yields zero ERRORs', () => {
    const payload = lprPayload([
      { axisId: 'sample-type', matched: true, branchIds: ['mammalian'], choices: { sampleType: 'mammalian cell culture' } },
    ]);
    const r = engine.lint(payload, LOCAL_PROTOCOL);
    expect(r.violations.filter((v) => v.severity === 'error'), JSON.stringify(r.violations)).toEqual([]);
  });

  it('a matched axis WITHOUT choices fires prov-local-choices-recorded naming the index', () => {
    const payload = lprPayload([{ axisId: 'sample-type', matched: true, branchIds: ['mammalian'] }]);
    const r = engine.lint(payload, LOCAL_PROTOCOL);
    const v = r.violations.find((x) => x.ruleId === 'prov-local-choices-recorded');
    expect(v, 'matched axis without choices fires').toBeDefined();
    expect(v!.severity).toBe('error');
    const rule = localSpec().rules.find((x) => x.id === 'prov-local-choices-recorded')!;
    const direct = evaluatePredicate(rule.assert as Predicate, payload);
    expect(direct.result).toBe(false);
    expect(direct.reason).toMatch(/item 0/);
  });

  it('an UNMATCHED axis without choices stays silent (honest non-realization)', () => {
    const payload = lprPayload([{ axisId: 'sample-type', matched: false }]);
    const r = engine.lint(payload, LOCAL_PROTOCOL);
    expect(r.violations.map((v) => v.ruleId), JSON.stringify(r.violations)).toEqual([]);
  });

  it('PROBE (spec §2.6 R1): nonEmpty on an OBJECT value — {} counts as EMPTY, absent counts as missing; both fail nonEmpty identically', () => {
    const emptyObject = evaluatePredicate({ op: 'nonEmpty', path: 'choices' }, { choices: {} });
    const absent = evaluatePredicate({ op: 'nonEmpty', path: 'choices' }, { axisId: 'x' });
    const filled = evaluatePredicate({ op: 'nonEmpty', path: 'choices' }, { choices: { sampleType: 'mammalian' } });
    expect(emptyObject.result).toBe(false); // {} is empty for lint purposes (PathResolver.isEmpty)
    expect(absent.result).toBe(false);
    expect(filled.result).toBe(true);
    // consequence: the DSL cannot distinguish {} from absent — recorded honestly;
    // both are treated as "no recorded choices" by prov-local-choices-recorded.
    const payload = lprPayload([{ axisId: 'sample-type', matched: true, choices: {} }]);
    const r = engine.lint(payload, LOCAL_PROTOCOL);
    expect(r.violations.map((v) => v.ruleId)).toContain('prov-local-choices-recorded');
  });

  it('a malformed axisId fires prov-local-axis-declared-shape (in-record arm; the cross-record half is the declared W2-7 gate)', () => {
    const payload = lprPayload([
      { axisId: 'Sample_Type', matched: false },
    ]);
    const r = engine.lint(payload, LOCAL_PROTOCOL);
    const v = r.violations.find((x) => x.ruleId === 'prov-local-axis-declared-shape');
    expect(v, 'malformed axisId fires').toBeDefined();
    expect(v!.severity).toBe('error');
  });

  it('a substitution without rationale fires prov-local-substitution-rationale WARNING (record stays writable)', () => {
    const payload = lprPayload(undefined, {
      substitutions: [
        { role: 'wash_buffer', material_ref: { kind: 'record', id: 'MAT-lab-pbs', type: 'material' } },
      ],
    });
    const r = engine.lint(payload, LOCAL_PROTOCOL);
    const v = r.violations.find((x) => x.ruleId === 'prov-local-substitution-rationale');
    expect(v, 'rationale-less substitution warns').toBeDefined();
    expect(v!.severity).toBe('warning');
    expect(r.valid).toBe(true); // warning severity: writable
  });

  it('a substitution WITH rationale is clean', () => {
    const payload = lprPayload(undefined, {
      substitutions: [
        {
          role: 'wash_buffer',
          material_ref: { kind: 'record', id: 'MAT-lab-pbs', type: 'material' },
          rationale: 'lab stock, same formulation',
        },
      ],
    });
    const r = engine.lint(payload, LOCAL_PROTOCOL);
    expect(r.violations.map((v) => v.ruleId), JSON.stringify(r.violations)).toEqual([]);
  });

  it('a legacy LPR payload (no branch_resolution, no overrides) yields ZERO findings', () => {
    const payload = lprPayload(undefined);
    const r = engine.lint(payload, LOCAL_PROTOCOL);
    expect(r.violations.map((v) => v.ruleId), JSON.stringify(r.violations)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (e) W2-3 rule ids stay declared byte-for-byte (additive-only edit proof)
// ---------------------------------------------------------------------------

describe('protocol.lint.yaml additive-only proof', () => {
  it('all seven merged W2-3/PROTO-AI-4 rule ids remain declared with their severities', () => {
    const spec = protocolSpec();
    const ids = spec.rules.map((r) => r.id);
    for (const required of [
      'step-role-closure',
      'labware-role-identity-bearing',
      'role-id-category-unique',
      'legacy-literal-bounded',
      'legacy-inventory-no-intent-drift',
      'intent-step-provenance-visible',
      'intent-verb-ref-declared',
    ]) {
      expect(ids, `rule ${required} still declared`).toContain(required);
    }
    expect(spec.rules.find((r) => r.id === 'intent-step-provenance-visible')?.severity).toBe('warning');
    // the W2-4 additions are prov-* only
    const added = ids.filter((id) => id.startsWith('prov-'));
    expect(added.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// (f) rule-id global uniqueness: the whole repo loads into ONE engine
// ---------------------------------------------------------------------------

describe('rule-id global uniqueness boot proof', () => {
  it('loadAllLintSpecs + addSpec of EVERY shipped spec throws no Duplicate rule ID', async () => {
    const loaded = await loadAllLintSpecs({ basePath: join(process.cwd(), 'schema'), recursive: true });
    const ours = loaded.specs.filter((s) =>
      ['rung-vocabulary', 'vendor-protocol-candidate', 'protocol', 'local-protocol'].includes(s.name),
    );
    expect(ours.map((s) => s.name).sort()).toEqual([
      'local-protocol',
      'protocol',
      'rung-vocabulary',
      'vendor-protocol-candidate',
    ]);
    const bad = loaded.errors.filter((e) =>
      /provenance-ladder|vendor-protocol-candidate|protocol|local-protocol/.test(e.path),
    );
    expect(bad).toEqual([]);

    const engine = new LintEngine();
    expect(() => {
      for (const { name, spec } of loaded.specs) engine.addSpec(name, spec);
    }).not.toThrow();

    // the vocabulary spec's doc_id schemaId never matches any record schema:
    // linting a protocol payload with the FULL repo engine emits no prov-vocab-* finding
    const r = engine.lint(anchoredIntentPayload('PRT-w24-boot'), PROTOCOL);
    expect(r.violations.map((v) => v.ruleId).filter((id) => id.startsWith('prov-vocab-'))).toEqual([]);
  });
});
