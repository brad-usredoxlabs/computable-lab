/**
 * MATRES-CHAIN §5 audit re-verification (committed BEFORE implementation code,
 * RED-first per §9) — answers re-read first-hand at dispatch tip 4d8fec8b:
 *
 * A9 MERGED onAccept shape (server/src/drafts/adapters.ts:30, verbatim):
 *   onAccept?(writes: RecordEnvelope[], acceptNow: string, store: RecordStore): Promise<AcceptOutcome>;
 * AcceptOutcome (adapters.ts:16-19): { writes: RecordEnvelope[]; volatileFields?: Record<string,string[]> }
 * Invoke point (FormDraftService.ts:201-205): after reviewHash re-check + canAccept +
 * pinned-source re-check, BEFORE the prior-scan; acceptNow = this.clock() ONE value per
 * accept; the volatile exemption map comes FROM the hook. Merged code = authority; it
 * matches the ruling shape verbatim. CHAIN rides it; zero FormDraftService lines (bait 1).
 *
 * A2 token() trap CONFIRMED (FormDraftService.ts:1 imports token; MaterialLifecycleHandlers
 * mints via token()) — CHAIN mints ONLY seed-hashes over (draft content, plan coordinate)
 * (AddMaterialSupport :154-164 law), never token(), never randomUUID, never Date.now() (bait 3).
 *
 * A8 chain wall CONFIRMED merged: attestation.lint.yaml `attestation-chain-no-proposed-claims`
 * (when artifactKind==attestation-chain -> everyItem claimStatus in [completed, unknown,
 * reported-by-other]); attestation.schema.yaml AttestedAt def: "ABSENT before accept" (:97-102).
 * CHAIN adds NOTHING to that wall — it rides it (D6: own lint file, own schemaId).
 *
 * A5 consumption record type STILL ABSENT at the merged tip (no plate-event.consume*, no
 * consumption kind) -> OQ-1(a) ruling: born-in-session consumption staged at CREATION
 * (status: consumed on the create); NEVER an update inside the accept loop (bait 12);
 * cross-session consumption is unsupported-by-design, never silently converted.
 *
 * FULFIL merged vocabulary (claim-ready addendum): REQE- family, verbs fulfills /
 * re-evaluates-fulfillment, fulfilledBy receipt|derivation|instance, verdicts
 * compatible|mismatch|incomplete; P8 gate correction: fulfil-evaluations-declared +
 * fulfil-completed-needs-compatible-evaluations gate on NON-EMPTY assertion.evaluations —
 * a completed fulfillment with evaluations: [] is BLOCKED. CHAIN's fulfillment claims carry
 * evaluateCompatibility() verdicts (fulfillment-compatibility.yaml DATA, imported read-only).
 *
 * PRE-EXISTING DEFECT (disclosed, repaired minimally, probe-proven at the dispatch tip):
 * schema/lab/material-derivation.schema.yaml $refs '../core/ref.schema.yaml' — Ajv resolves
 * $ref against the schema $id, and no schema with id .../computable-lab/core/ref.schema.yaml
 * exists (the ref datatype's id is .../computable-lab/datatypes/ref.schema.yaml). An Ajv
 * compile of ANY material-derivation payload THROWS "can't resolve reference" (probe output
 * recorded in the report). FULFIL's own suite dodged it via skipValidation seeds; CHAIN's
 * AC fixture must CREATE a derivation through the staging store (real validate), so the
 * one-line $ref repair ('../core/ref.schema.yaml' -> '../datatypes/ref.schema.yaml') is the
 * minimal justified fix. The file is NOT on the §8 OUT list. Disclosed as a deviation.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';
import { LintEngine } from '../lint/LintEngine.js';
import { loadAllLintSpecs } from '../lint/LintSpecLoader.js';
import { loadChainArithmeticPolicy, evaluateChainArithmetic, defaultChainArithmeticPath } from './chainArithmetic.js';
import { loadChainClaimLabels, loadChainFulfillmentVocabulary, loadChainClaimVerbs } from './ExecuteChainDraft.js';
import { loadFulfillmentCompatibilityPolicy } from '../fulfillment/fulfillmentPolicy.js';

const SCHEMA_DIR = fileURLToPath(new URL('../../../schema', import.meta.url));
const CHAIN_DRAFT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/chain-draft.schema.yaml';
const DERIVATION_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material-derivation.schema.yaml';

let lintEngine: LintEngine;
let validator: ReturnType<typeof createValidator>;

beforeAll(async () => {
  const registry = createSchemaRegistry();
  const loaded = await loadAllSchemas({ basePath: SCHEMA_DIR, recursive: true });
  expect(loaded.errors).toEqual([]);
  registry.addSchemas(loaded.entries);
  validator = createValidator();
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema, id);
  }
  lintEngine = new LintEngine();
  const lintLoad = await loadAllLintSpecs({ basePath: SCHEMA_DIR, recursive: true });
  expect(lintLoad.errors.filter(e => /chain-draft/.test(e.path))).toEqual([]);
  for (const { name, spec } of lintLoad.specs) lintEngine.addSpec(name, spec);
}, 60000);

describe('MATRES-CHAIN §9 first GREEN milestone — schema/lint/arithmetic as DATA, zero chain TS behavior', () => {
  it('the chain-draft schema is registered in the corpus (declared draft shape, not a record kind)', () => {
    const entry = createSchemaRegistry && validator.validate({ operation: 'compose-execute-chain' }, CHAIN_DRAFT_SCHEMA_ID);
    expect(entry).toBeDefined(); // schema resolves (a structural verdict exists)
  });

  it('orphan wall lives at the RECORD level (fix-run 1 D1): the shipped aliquot.schema.yaml anyOf refuses a parentless aliquot payload, and the DRAFT composite refuses a parent ref on an aliquot item (additionalProperties:false) — the wall is Ajv, not a dead draft lint rule', () => {
    // The shipped record-level wall (A4): an aliquot with no spec/parent ref.
    const orphanAliquot = {
      kind: 'aliquot', id: 'ALQ-ORPHAN', name: 'orphan',
      volume: { value: 100, unit: 'uL' }, status: 'available',
    };
    const v = validator.validate(orphanAliquot, 'https://computable-lab.com/schema/computable-lab/aliquot.schema.yaml');
    expect(v.valid).toBe(false);
    // The composite-shape proof: parent_material_instance_ref is NOT a draft
    // aliquot property — Ajv rejects it before any draft lint can see it (the
    // reviewer's probe, pinned here so the wall's location stays declared).
    const compositeWithParentRef = {
      operation: 'compose-execute-chain',
      artifactKind: 'attestation-chain',
      prepared: { name: 'stock', volume: { value: 1, unit: 'mL' } },
      aliquotCount: 2,
      aliquots: [
        { disposition: 'stored', volume: { value: 100, unit: 'uL' }, parent_material_instance_ref: { kind: 'record', type: 'material-instance', id: 'MINST-X' } },
        { disposition: 'consumed', volume: { value: 100, unit: 'uL' } },
      ],
      attested: { claimStatus: 'completed', occurredAtStatus: 'unknown' },
    };
    const cv = validator.validate(compositeWithParentRef, CHAIN_DRAFT_SCHEMA_ID);
    expect(cv.valid).toBe(false);
    expect(cv.errors?.some(e => e.message.includes('parent_material_instance_ref'))).toBe(true);
    // The dead draft-side rule is GONE from the lint file (no unreachable rule).
    expect(lintEngine.getRule('chain-draft-aliquots-need-parent')).toBeUndefined();
  });

  it('chain-draft.lint.yaml: an attestation-chain draft without a declared claimStatus fires chain-draft-attested-chain-needs-declared-claim-status (elicitation wall as data)', () => {
    const composite = {
      operation: 'compose-execute-chain',
      artifactKind: 'attestation-chain',
      prepared: { name: 'stock', volume: { value: 1, unit: 'mL' } },
      aliquotCount: 1,
      aliquots: [{ disposition: 'stored', volume: { value: 100, unit: 'uL' }, parent_material_instance_ref: { kind: 'record', type: 'material-instance', id: 'MINST-X' } }],
      attested: { occurredAtStatus: 'unknown' }, // no claimStatus declared
    };
    const result = lintEngine.lint(composite, CHAIN_DRAFT_SCHEMA_ID);
    expect(result.violations.some(v => v.ruleId === 'chain-draft-attested-chain-needs-declared-claim-status')).toBe(true);
  });

  it('the instructed payload validates as plan-side (artifactKind plan-slot-reference, zero physical writes declared)', () => {
    const instructed = {
      operation: 'compose-execute-chain',
      artifactKind: 'plan-slot-reference',
      prepared: { name: 'planned stock', volume: { value: 1, unit: 'mL' } },
      aliquotCount: 10,
      aliquots: Array.from({ length: 10 }, () => ({ disposition: 'stored', volume: { value: 100, unit: 'uL' } })),
    };
    const v = validator.validate(instructed, CHAIN_DRAFT_SCHEMA_ID);
    expect(v.valid).toBe(true);
    expect(lintEngine.lint(instructed, CHAIN_DRAFT_SCHEMA_ID).violations.filter(x => x.severity === 'error')).toEqual([]);
  });

  it('execute-chain-arithmetic.yaml declares the named rules volume-sum-lte-prepared + aliquot-count-matches-declared (DATA)', () => {
    const policy = loadChainArithmeticPolicy();
    expect(policy).not.toBeNull();
    const ids = policy!.rules().map(r => r.id);
    expect(ids).toContain('volume-sum-lte-prepared');
    expect(ids).toContain('aliquot-count-matches-declared');
  });

  it('arithmetic evaluator rejects sum>prepared naming volume-sum-lte-prepared (11x100uL > 1mL; unit scale is DATA)', () => {
    const policy = loadChainArithmeticPolicy()!;
    const draft = {
      prepared: { volume: { value: 1, unit: 'mL' } },
      aliquotCount: 11,
      aliquots: Array.from({ length: 11 }, () => ({ disposition: 'stored', volume: { value: 100, unit: 'uL' } })),
    };
    const violations = evaluateChainArithmetic(policy, draft);
    expect(violations.some(v => v.ruleId === 'volume-sum-lte-prepared')).toBe(true);
  });

  it('arithmetic evaluator accepts the case-3 shape (10x100uL = 1mL, unit conversion from the YAML scale table)', () => {
    const policy = loadChainArithmeticPolicy()!;
    const draft = {
      prepared: { volume: { value: 1, unit: 'mL' } },
      aliquotCount: 10,
      aliquots: Array.from({ length: 10 }, () => ({ disposition: 'stored', volume: { value: 100, unit: 'uL' } })),
    };
    expect(evaluateChainArithmetic(policy, draft)).toEqual([]);
  });

  it('arithmetic evaluator rejects count mismatch naming aliquot-count-matches-declared', () => {
    const policy = loadChainArithmeticPolicy()!;
    const draft = {
      prepared: { volume: { value: 1, unit: 'mL' } },
      aliquotCount: 10,
      aliquots: Array.from({ length: 9 }, () => ({ disposition: 'stored', volume: { value: 100, unit: 'uL' } })),
    };
    const violations = evaluateChainArithmetic(policy, draft);
    expect(violations.some(v => v.ruleId === 'aliquot-count-matches-declared')).toBe(true);
  });

  it('absent arithmetic file = LOUD off: console.warn names the path, evaluation returns null (never silent)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const missing = defaultChainArithmeticPath() + '.absent-fixture';
    const policy = loadChainArithmeticPolicy(missing);
    expect(policy).toBeNull();
    expect(warn.mock.calls.some(c => String(c[0]).includes(missing))).toBe(true);
    warn.mockRestore();
  });

  it('pre-existing $ref defect repaired: a material-derivation payload now Ajv-compiles (inputs/outputs ride the shared ref datatype)', () => {
    const payload = {
      kind: 'material-derivation',
      id: 'MDER-PROBE',
      name: 'probe prep',
      derivation_type: 'preparation',
      inputs: [{ kind: 'record', type: 'material-spec', id: 'SPEC-1' }],
      outputs: [{ kind: 'record', type: 'material-instance', id: 'MINST-1' }],
    };
    const v = validator.validate(payload, DERIVATION_SCHEMA_ID);
    expect(v.valid).toBe(true);
  });

  it('claim labels + fulfillment verb/fulfilledBy + physical claimVerbs are DECLARED DATA (adapters.yaml chain block, fix-run 1 D2/D3): the loaders read them, and they sit inside the shipped vocabularies', () => {
    const labels = loadChainClaimLabels();
    expect(labels).not.toBeNull();
    // The labels must be members of the attestation claimStatus enum (the
    // shipped vocabulary — the DATA cannot invent a label Ajv would reject).
    const claimStatusEnum = validator.validate({ kind: 'attestation', recordId: 'ATT-LABEL-PROBE', artifactKind: 'attestation-chain', claims: [{ claimStatus: labels!.instructed, assertion: { verb: 'prepared', about: { kind: 'record', type: 'material-instance', id: 'MINST-1' } }, occurredAtStatus: 'unknown' }] }, 'https://computable-lab.com/schema/computable-lab/attestation.schema.yaml');
    expect(claimStatusEnum.valid).toBe(true);
    const vocab = loadChainFulfillmentVocabulary();
    expect(vocab).not.toBeNull();
    const verbs = loadChainClaimVerbs();
    expect(verbs).not.toBeNull();
    // Lock vs FULFIL's declared lint vocabulary (attestation.lint.yaml):
    // fulfil-verb-vocabulary values + fulfil-fulfilledby-vocabulary values.
    const verbRule = lintEngine.getRule('fulfil-verb-vocabulary');
    const fulfilledByRule = lintEngine.getRule('fulfil-fulfilledby-vocabulary');
    expect(verbRule).toBeDefined();
    expect(fulfilledByRule).toBeDefined();
    const verbValues = JSON.parse(JSON.stringify(verbRule!)) as { assert: { assert: { predicates: Array<{ values?: string[] }> } } };
    const fbValues = JSON.parse(JSON.stringify(fulfilledByRule!)) as { assert: { assert: { predicates: Array<{ values?: string[] }> } } };
    expect(verbValues.assert.assert.predicates.some(p => (p.values ?? []).includes(vocab!.verb))).toBe(true);
    expect(fbValues.assert.assert.predicates.some(p => (p.values ?? []).includes(vocab!.fulfilledBy))).toBe(true);
    // Lock vs the compatibility policy: the emitted fulfilledBy selects checks.
    const policy = loadFulfillmentCompatibilityPolicy();
    expect(policy.checksFor(vocab!.fulfilledBy).length).toBeGreaterThan(0);
  });

  it('the satisfied verdict is resolved by NAME via policy.verdictFor("satisfied") (fix-run 1 D4): a verdict-list reorder cannot change the satisfied verdict', () => {
    const policy = loadFulfillmentCompatibilityPolicy();
    const satisfied = policy.verdictFor('satisfied');
    // The declared outcome mapping (not position) names the satisfied verdict.
    expect(satisfied).toBe('compatible');
    // A doctored policy with the verdict list REORDERED still resolves the
    // satisfied verdict to the same name — the compiler's label selection
    // (verdict === verdictFor('satisfied')) is reorder-proof by construction.
    const tmp = join(tmpdir(), 'chain-verdict-reorder-policy.yaml');
    writeFileSync(tmp, [
      'policyVersion: 1',
      'verdicts: [ mismatch, compatible, incomplete ]',
      'outcomes:',
      '  satisfied: compatible',
      '  contradicted: mismatch',
      '  missing-requirement-fact: incomplete',
      '  missing-evidence-fact: incomplete',
      'operators: [ membership, ref-equality ]',
      'checks:',
      '  - id: spec-identity',
      '    requirementSlot: spec-identity',
      '    fulfilledBy: [ derivation ]',
      '    requirementPath: material_spec_ref.id',
      '    evidencePaths: [ "outputs[*].id" ]',
      '    operator: ref-equality',
    ].join('\n'));
    const reordered = loadFulfillmentCompatibilityPolicy(tmp);
    expect(reordered.verdicts()[0]).not.toBe(satisfied); // position 0 CHANGED
    expect(reordered.verdictFor('satisfied')).toBe(satisfied); // name-resolved verdict UNCHANGED
    rmSync(tmp, { force: true });
  });
});
