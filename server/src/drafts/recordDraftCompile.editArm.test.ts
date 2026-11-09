/**
 * FAME-3 W6 (OQ-4 OPT-A, architect ruling 20261101T032x) — the
 * record-drafting adapter's EDIT arm, RED-first.
 *
 * The edit-record operation (config/drafting/adapters.yaml) edits an
 * EXISTING record instead of composing a new one: the server resolves the
 * model's compound noun through the ontology-term registry (never-guess:
 * an exact known term yields its governed CURIE; an unknown/ambiguous
 * noun yields a NAMED refusal, never a guessed CURIE), appends ONE entry
 * at the guard-declared path (config/drafting/record-edit-guards.yaml —
 * the interpreter carries ZERO path/kind literals), runs the REAL
 * store-level validate on the merged payload, and stages ZERO writes
 * (the single governed edit rides the onAccept hook at accept).
 *
 * RED at base (a4454272): buildRecordEditMerge + the edit-record arm do
 * not exist (verified: 0 occurrences at base). The symbol import alone
 * fails collection at base.
 *
 * The target record is a real gc-method record created through the REAL
 * store (schema-validated), and the merged payload is validated by the
 * REAL store validator — the card only ever names a payload the store
 * would accept. The ontology terms are the REAL registry (the
 * schema/registry/ontology-terms/ aggregate), never literals.
 */
import { beforeAll, beforeEach, afterEach, describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';
import { LintEngine } from '../lint/LintEngine.js';
import { loadAllLintSpecs } from '../lint/LintSpecLoader.js';
import { createLocalRepoAdapter } from '../repo/LocalRepoAdapter.js';
import { createRecordStore } from '../store/RecordStoreImpl.js';
import { PolicyBundleService } from '../policy/PolicyBundleService.js';
import type { AppContext } from '../server.js';
import type { RecordEnvelope, RecordStore } from '../store/types.js';
import type { OntologyTerm } from '../registry/OntologyTermRegistry.js';
import { getOntologyTermRegistry } from '../registry/OntologyTermRegistry.js';
import { object } from '../revisions/RecordRevisionService.js';
import { FormDraftService } from './FormDraftService.js';
import {
  buildRecordEditMerge,
  compileRecordDraftIntent,
} from './recordDraftCompile.js';

const schemaRoot = fileURLToPath(new URL('../../../schema', import.meta.url));
const GC_METHOD_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/gc-method.schema.yaml';
const ACTOR = 'USR-W6-EDIT-TEST';

let registry: ReturnType<typeof createSchemaRegistry>;
let validator: ReturnType<typeof createValidator>;
let root: string;
let store: ReturnType<typeof createRecordStore>;

beforeAll(async () => {
  registry = createSchemaRegistry();
  const loaded = await loadAllSchemas({ basePath: schemaRoot, recursive: true });
  expect(loaded.errors).toEqual([]);
  registry.addSchemas(loaded.entries);
  validator = createValidator();
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema as never, id);
  }
}, 60000);

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cl-fame3-w6-edit-'));
  store = createRecordStore(createLocalRepoAdapter({ basePath: root }), validator, new LintEngine());
}, 60000);
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });

/** A real, schema-validated gc-method record with ONE pre-existing
 *  compound_assignments entry (the duplicate-refusal arm needs a prior
 *  entry; the happy arm proves the append lands after it). */
async function seedGcMethod(recordId: string): Promise<RecordEnvelope> {
  const payload: Record<string, unknown> = {
    kind: 'gc-method',
    id: recordId,
    name: 'W6 edit-arm working method',
    method_version: 1,
    analysis: {
      compound_assignments: [
        {
          label: 'pre-existing entry',
          compound_ref: {
            kind: 'ontology',
            namespace: 'FAME-LOCAL',
            id: 'FAME-LOCAL:methyl-octanoate-n8',
            label: 'Methyl octanoate (FAME, 8:0-OMe)',
          },
        },
      ],
    },
  };
  const saved = await store.create({
    envelope: { recordId, schemaId: GC_METHOD_SCHEMA_ID, payload },
    message: 'seed the W6 edit target',
  });
  expect(saved.success, `seed create should succeed: ${saved.error ?? JSON.stringify(saved.validation)}`).toBe(true);
  return { recordId, schemaId: GC_METHOD_SCHEMA_ID, payload };
}

const realTerms = (): OntologyTerm[] => getOntologyTermRegistry().list();

/** Resolve a REAL known term from the registry (by exact label — the
 *  never-guess arm: the test never names a CURIE the registry does not
 *  declare). */
function knownTerm(label: string): OntologyTerm {
  const hits = realTerms().filter((t) => t.label === label);
  expect(hits.length, `registry should declare exactly one term labeled "${label}"`).toBe(1);
  return hits[0]!;
}

/** Read the target's compound_assignments list (typed, for assertions). */
function assignments(env: RecordEnvelope | null): Array<Record<string, unknown>> {
  const analysis = object(env?.payload ?? {}).analysis as Record<string, unknown> | undefined;
  return (analysis?.compound_assignments as Array<Record<string, unknown>>) ?? [];
}

describe('record-drafting edit arm (FAME-3 W6, OQ-4 OPT-A)', () => {
  it('a resolved term + declared fields appends ONE schema-valid entry; the card names the term, rt, state, and the entry count', async () => {
    const target = await seedGcMethod('GCM-W6-EDIT-001');
    const term = knownTerm('Methyl hexanoate (FAME, 6:0-OMe)');
    const merged = await buildRecordEditMerge({
      intent: {
        operation: 'edit-record',
        term: term.label,
        fields: {
          label: 'assigned by the chat leg',
          expected_rt_min: 15.750708641554152,
          rt_window_min: 0.1,
        },
      },
      targetId: target.recordId,
      store,
      ontologyTerms: realTerms,
    });
    expect(merged.ok, JSON.stringify(merged)).toBe(true);
    if (!merged.ok) throw new Error('unreachable');

    // The entry: the approved fields VERBATIM + the resolved compound_ref
    // (the registry's own CURIE) + the guard's declared default
    // (assignment_state provisional — rides the guard DATA, not the code).
    const expectedRef: Record<string, unknown> = {
      kind: 'ontology',
      namespace: 'FAME-LOCAL',
      id: term.id,
      label: term.label,
    };
    if (term.definition !== undefined) expectedRef.definition = term.definition;
    expect(merged.entry).toEqual({
      label: 'assigned by the chat leg',
      expected_rt_min: 15.750708641554152,
      rt_window_min: 0.1,
      compound_ref: expectedRef,
      assignment_state: 'provisional',
    });

    // The merge: exactly ONE new entry at the guard path (1 -> 2), the
    // pre-existing entry untouched, and the merged payload passed the REAL
    // store-level validate (buildRecordEditMerge runs it before returning).
    expect(merged.entryCountBefore).toBe(1);
    expect(merged.entryCountAfter).toBe(2);
    const mergedList = assignments({ ...target, payload: merged.mergedPayload as RecordEnvelope['payload'] });
    expect(mergedList).toHaveLength(2);
    expect(mergedList[0]).toEqual(assignments(target)[0]);

    // The card (the OQ-4 receipt shape).
    expect(merged.card).toMatchObject({
      operation: 'edit-record',
      targetRecordId: target.recordId,
      resolvedTerm: { id: term.id, label: term.label },
      expectedRtMin: 15.750708641554152,
      assignmentState: 'provisional',
      entryCountBefore: 1,
      entryCountAfter: 2,
    });
  });

  it('an UNKNOWN noun yields the NAMED EDIT_TERM_UNRESOLVED refusal — the target is untouched and no CURIE is guessed', async () => {
    const target = await seedGcMethod('GCM-W6-EDIT-002');
    // "palmitate" is NOT in fame-local.yaml (the never-guess precondition,
    // spec §3). It must refuse by NAME.
    const merged = await buildRecordEditMerge({
      intent: { operation: 'edit-record', term: 'palmitate', fields: { label: 'nope' } },
      targetId: target.recordId,
      store,
      ontologyTerms: realTerms,
    });
    expect(merged.ok).toBe(false);
    if (merged.ok) throw new Error('unreachable');
    expect(merged.diagnostics[0]!.code).toBe('EDIT_TERM_UNRESOLVED');
    // The target was NOT touched (zero writes before the refusal).
    const after = await store.get(target.recordId);
    expect(after?.payload).toEqual(target.payload);
  });

  it('a missing target yields the NAMED EDIT_TARGET_MISSING refusal', async () => {
    const merged = await buildRecordEditMerge({
      intent: {
        operation: 'edit-record',
        term: knownTerm('Methyl hexanoate (FAME, 6:0-OMe)').label,
        fields: { label: 'x' },
      },
      targetId: 'GCM-DOES-NOT-EXIST',
      store,
      ontologyTerms: realTerms,
    });
    expect(merged.ok).toBe(false);
    if (merged.ok) throw new Error('unreachable');
    expect(merged.diagnostics[0]!.code).toBe('EDIT_TARGET_MISSING');
  });

  it('an ABSENT target yields the NAMED EDIT_TARGET_REQUIRED refusal', async () => {
    const merged = await buildRecordEditMerge({
      intent: {
        operation: 'edit-record',
        term: knownTerm('Methyl hexanoate (FAME, 6:0-OMe)').label,
        fields: { label: 'x' },
      },
      targetId: undefined,
      store,
      ontologyTerms: realTerms,
    });
    expect(merged.ok).toBe(false);
    if (merged.ok) throw new Error('unreachable');
    expect(merged.diagnostics[0]!.code).toBe('EDIT_TARGET_REQUIRED');
  });

  it('an identical entry already present yields the NAMED EDIT_DUPLICATE_ENTRY refusal (a duplicate re-draft is refused by name, never appended twice)', async () => {
    const target = await seedGcMethod('GCM-W6-EDIT-003');
    const term = knownTerm('Methyl octanoate (FAME, 8:0-OMe)');
    const entryFields = { label: 'seed-matching entry' };
    // First draft: the entry is NOT present yet -> the merge appends it.
    const first = await buildRecordEditMerge({
      intent: { operation: 'edit-record', term: term.label, fields: entryFields },
      targetId: target.recordId,
      store,
      ontologyTerms: realTerms,
    });
    expect(first.ok, JSON.stringify(first)).toBe(true);
    if (!first.ok) throw new Error('unreachable');
    // Apply the first edit through the real store (the accept path).
    const saved = await store.update({
      envelope: first.mergedEnvelope,
      message: 'apply the first edit',
    });
    expect(saved.success, JSON.stringify(saved)).toBe(true);
    // Re-draft the SAME proposal: now the identical entry is present.
    const again = await buildRecordEditMerge({
      intent: { operation: 'edit-record', term: term.label, fields: entryFields },
      targetId: target.recordId,
      store,
      ontologyTerms: realTerms,
    });
    expect(again.ok).toBe(false);
    if (again.ok) throw new Error('unreachable');
    expect(again.diagnostics[0]!.code).toBe('EDIT_DUPLICATE_ENTRY');
    // The store still carries exactly TWO entries (the duplicate was
    // refused, not appended).
    const after = await store.get(target.recordId);
    expect(assignments(after)).toHaveLength(2);
  });

  it('a content-identical pre-existing entry stored with REVERSED key order is recognized as a duplicate (canonicalized comparison — a re-draft is refused by name, never appended twice)', async () => {
    const target = await seedGcMethod('GCM-W6-EDIT-005');
    const term = knownTerm('Methyl decanoate (FAME, 10:0-OMe)');
    const entryFields = { label: 'seed-reversed-order entry' };
    // The interpreter's drafted entry is {assignment_state, label,
    // compound_ref} (guard defaults first, fields verbatim, ref last).
    // Seed the target with a CONTENT-IDENTICAL entry whose key order is
    // reversed (label, compound_ref, assignment_state) — the hand-authored
    // / migrated-record shape the stringify comparison must survive.
    const seedRef: Record<string, unknown> = {
      kind: 'ontology',
      namespace: term.id.includes(':') ? term.id.split(':')[0] : '',
      id: term.id,
      label: term.label,
    };
    if (term.definition !== undefined) seedRef.definition = term.definition;
    const saved = await store.update({
      envelope: {
        recordId: target.recordId,
        schemaId: GC_METHOD_SCHEMA_ID,
        payload: {
          ...(target.payload as Record<string, unknown>),
          analysis: {
            compound_assignments: [
              ...assignments(target),
              {
                label: entryFields.label,
                compound_ref: seedRef,
                assignment_state: 'provisional',
              },
            ],
          },
        },
      },
      message: 'seed a content-identical entry with reversed key order',
    });
    expect(saved.success, JSON.stringify(saved)).toBe(true);
    // Re-draft the SAME proposal: the reversed-order entry is
    // content-identical -> NAMED refusal, no append.
    const merged = await buildRecordEditMerge({
      intent: { operation: 'edit-record', term: term.label, fields: entryFields },
      targetId: target.recordId,
      store,
      ontologyTerms: realTerms,
    });
    expect(merged.ok).toBe(false);
    if (merged.ok) throw new Error('unreachable');
    expect(merged.diagnostics[0]!.code).toBe('EDIT_DUPLICATE_ENTRY');
    // Still exactly TWO entries (the reversed-order seed + the pre-
    // existing one) — the re-draft was refused, not appended.
    const after = await store.get(target.recordId);
    expect(assignments(after)).toHaveLength(2);
  });

  it('end-to-end through the REAL service: compile (canAccept:true, ZERO staged writes) -> accept applies EXACTLY ONE governed edit -> the record carries the new entry and the pre-existing entry is untouched', async () => {
    const target = await seedGcMethod('GCM-W6-EDIT-004');
    const term = knownTerm('Methyl decanoate (FAME, 10:0-OMe)');
    const policyBundleService = new PolicyBundleService();
    policyBundleService.loadFromDir(join(schemaRoot, 'core/policy-bundles'));
    // Mirror FormDraftService.test.ts's ctx exactly (the authorization
    // guard is `if (this.ctx.authorizationService && ...)` — omitting it
    // makes the read path skip the authorization check, which is what the
    // canonical drafts harness does).
    const ctx = {
      store,
      validator,
      schemaRegistry: registry,
      policyBundleService,
      workspaceRoot: root,
      recordsDir: root,
    } as unknown as AppContext;
    const service = new FormDraftService(ctx, ACTOR);

    const compiled = await service.compile({
      adapter: 'record-drafting',
      intent: {
        operation: 'edit-record',
        term: term.label,
        fields: { label: 'e2e chat assignment', expected_rt_min: 22.0949971128188 },
      },
      target: { recordId: target.recordId },
    });
    expect(compiled.canAccept, JSON.stringify(compiled.diagnostics)).toBe(true);
    expect(compiled.writes, 'the edit arm stages ZERO writes').toEqual([]);
    expect(object(compiled.result).card).toMatchObject({
      operation: 'edit-record',
      targetRecordId: target.recordId,
      resolvedTerm: { id: term.id },
      entryCountBefore: 1,
      entryCountAfter: 2,
    });

    // Pre-accept proof: the target's GET is what it was (nothing wrote).
    const before = (await store.get(target.recordId))!.payload;

    await service.accept({
      draftId: compiled.draftId,
      revision: compiled.revision,
      reviewHash: compiled.reviewHash,
    });

    const after = (await store.get(target.recordId))!;
    const list = assignments(after);
    expect(list).toHaveLength(2);
    // Exactly ONE new entry: the approved fields + the registry CURIE +
    // the guard default. The pre-existing entry is byte-identical.
    expect(list[0]).toEqual(assignments(target)[0]);
    const newEntry: Record<string, unknown> = {
      label: 'e2e chat assignment',
      expected_rt_min: 22.0949971128188,
      assignment_state: 'provisional',
      compound_ref: { kind: 'ontology', id: term.id, namespace: 'FAME-LOCAL', label: term.label },
    };
    if (term.definition !== undefined) (newEntry.compound_ref as Record<string, unknown>).definition = term.definition;
    expect(list[1]).toEqual(newEntry);
    // The rest of the payload is untouched (only the analysis section's
    // compound_assignments array grew by one).
    const beforeObj = object(before);
    const afterObj = object(after.payload);
    for (const key of Object.keys(beforeObj)) {
      if (key === 'analysis') continue;
      expect(afterObj[key], `payload key "${key}" must be untouched`).toEqual(beforeObj[key]);
    }
    expect(afterObj.analysis).toMatchObject({ compound_assignments: list });
  }, 60000);

  it('the card row + summary name the RESOLVED ONTOLOGY IDENTITY (the registry CURIE) alongside the term label — criterion (b): the user sees WHICH CURIE resolved, not only the label', async () => {
    const target = await seedGcMethod('GCM-W6-EDIT-006');
    const term = knownTerm('Methyl decanoate (FAME, 10:0-OMe)');
    const policyBundleService = new PolicyBundleService();
    policyBundleService.loadFromDir(join(schemaRoot, 'core/policy-bundles'));
    const ctx = {
      store,
      validator,
      schemaRegistry: registry,
      policyBundleService,
      workspaceRoot: root,
      recordsDir: root,
    } as unknown as AppContext;
    const service = new FormDraftService(ctx, ACTOR);

    const compiled = await service.compile({
      adapter: 'record-drafting',
      intent: {
        operation: 'edit-record',
        term: term.label,
        fields: { label: 'card identity leg', expected_rt_min: 22.0949971128188 },
      },
      target: { recordId: target.recordId },
    });
    expect(compiled.canAccept, JSON.stringify(compiled.diagnostics)).toBe(true);
    const result = object(compiled.result) as {
      summary?: string;
      recordFields?: Array<{ label: string; value: string }>;
    };
    // The card row (criterion b: "card shows the resolved ontology term")
    // carries the resolved identity — the registry CURIE the user can see
    // and trust — alongside the human label, not the label alone.
    const termRow = result.recordFields?.find((f) => f.label === 'Compound term');
    expect(termRow?.value).toContain(term.label);
    expect(termRow?.value, 'the Compound term row must name the resolved CURIE').toContain(term.id);
    expect(result.summary, 'the summary must name the resolved CURIE').toContain(term.id);
  }, 60000);
});

/**
 * FAME-3 D2 (OQ-4 W6 step 3): the merge must run the REAL store-level LINT on
 * the MERGED payload, not just the schema validate. The store's own update
 * runs validate AND lint (RecordStoreImpl.update); a merged payload the store
 * would lint-reject at accept must be refused at COMPILE — by name, carrying
 * the lint message — never shown then thrown inside onAccept with no
 * actionable path.
 *
 * The gc-method lint rule (gc-method.lint.yaml, severity error) refuses a
 * record that captures timed integration events (analysis.timed_events
 * nonEmpty) without a declared analysis.executable_binding. executable_binding
 * is schema-OPTIONAL (a lint-only gate), so a gc-method with timed_events and
 * no executable_binding is schema-VALID but LINT-INVALID — the exact D2 case.
 *
 * This describe wires a SEPARATE store with the REAL lint specs loaded
 * (production wiring: loadAllLintSpecs -> engine.addSpec), isolated from the
 * empty-lint store the sibling tests use.
 */
describe('record-drafting edit arm — lint gate (FAME-3 D2, OQ-4 W6 step 3)', () => {
  let lintRoot: string;
  let lintEngine: LintEngine;
  let lintStore: ReturnType<typeof createRecordStore>;

  beforeEach(async () => {
    lintRoot = await mkdtemp(join(tmpdir(), 'cl-fame3-d2-lint-'));
    lintEngine = new LintEngine();
    const lintLoad = await loadAllLintSpecs({ basePath: schemaRoot, recursive: true });
    for (const { name, spec } of lintLoad.specs) lintEngine.addSpec(name, spec);
    expect(
      lintEngine.getRule('gcmethod-timed-events-require-executable-binding'),
      'the gc-method lint rule must be loaded from gc-method.lint.yaml',
    ).toBeDefined();
    lintStore = createRecordStore(createLocalRepoAdapter({ basePath: lintRoot }), validator, lintEngine);
  }, 60000);
  afterEach(async () => { if (lintRoot) await rm(lintRoot, { recursive: true, force: true }); });

  it('a LINT-invalid merged payload (gc-method: timed_events present, no executable_binding) is refused at COMPILE with EDIT_MERGE_REJECTED carrying the lint message — zero writes, the target untouched', async () => {
    const recordId = 'GCM-D2-LINT-001';
    // Schema-valid but lint-invalid: captures timed integration events with no
    // declared executable binding. skipLint so the seed lands (the gate under
    // test is COMPILE, not the seed).
    const payload: Record<string, unknown> = {
      kind: 'gc-method',
      id: recordId,
      name: 'D2 lint-invalid working method',
      method_version: 1,
      analysis: {
        timed_events: [
          { at_min: 19.0, integration: 'on' },
          { at_min: 19.6, integration: 'off' },
        ],
        compound_assignments: [],
      },
    };
    const seeded = await lintStore.create({
      envelope: { recordId, schemaId: GC_METHOD_SCHEMA_ID, payload },
      message: 'seed the D2 lint-invalid target',
      skipLint: true,
    });
    expect(seeded.success, `seed should land (schema-valid, lint skipped): ${seeded.error ?? JSON.stringify(seeded.validation)}`).toBe(true);
    // Proof the seed is schema-valid but LINT-invalid — the pre-condition of the gate.
    expect((await lintStore.validate({ recordId, schemaId: GC_METHOD_SCHEMA_ID, payload })).valid).toBe(true);
    expect(lintEngine.lint(payload, GC_METHOD_SCHEMA_ID).valid, 'the seeded target must be lint-invalid (timed_events, no executable_binding)').toBe(false);

    const term = knownTerm('Methyl hexanoate (FAME, 6:0-OMe)');
    const merged = await buildRecordEditMerge({
      intent: {
        operation: 'edit-record',
        term: term.label,
        fields: { label: 'd2 lint probe', expected_rt_min: 15.7507 },
      },
      targetId: recordId,
      store: lintStore,
      ontologyTerms: realTerms,
    });
    // The gate: refused at COMPILE, by name, with the lint message carried.
    expect(merged.ok).toBe(false);
    if (merged.ok) throw new Error('unreachable — the lint-invalid merge must be refused at compile');
    const diag = merged.diagnostics[0]!;
    expect(diag.code).toBe('EDIT_MERGE_REJECTED');
    expect(diag.message).toContain('gcmethod-timed-events-require-executable-binding');
    expect(diag.message).toContain('executable binding');
    // Zero writes: the target is byte-identical (the edit was never applied).
    const after = await lintStore.get(recordId);
    expect(after?.payload).toEqual(payload);
  });
});
