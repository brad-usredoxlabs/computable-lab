/**
 * SPINE-2 vocabulary loader tests — resolver-spec.validation + current-verb-parity.
 *
 * resolver-spec.validation: the shipped vocabulary validates (Ajv) AND lints
 * (P1-P4) CLEAN; each named fixture mutation produces a NAMED failure.
 * current-verb-parity: vocabulary verb set+order == fixtures/verb-inventory.yaml
 * == 32, and every acceptance shape SPINE-1 pinned still parses through the
 * REAL parseScientistIntent singleton.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  loadScientistIntentVocabulary,
  defaultScientistIntentVocabulary,
  SCIENTIST_INTENT_VOCABULARY_SCHEMA_ID,
  VOCABULARY_DATA_FILE,
  VOCABULARY_SCHEMA_FILE,
  VOCABULARY_LINT_FILE,
} from './vocabulary.js';
import { parseScientistIntent } from './parseScientistIntent.js';
import { loadAllLintSpecs } from '../../lint/LintSpecLoader.js';
import { loadAllSchemas } from '../../schema/SchemaLoader.js';
import { LintEngine } from '../../lint/LintEngine.js';

const FIXTURES = join(process.cwd(), 'src', 'compiler', 'scientistIntent', 'fixtures');
const VOCAB_DIR = join(process.cwd(), 'schema', 'scientist-intent');
const INVENTORY_PATH = join(FIXTURES, 'verb-inventory.yaml');

const THREE_ACTION = `
intentId: example-001
actions:
  - action: serial_dilution
    source: standards
    target: fresh_plate
    factor: 2
    points: 8
    replicates: 2
  - action: incubate
    duration: 10 min
    temperatureC: 37
  - action: read
    mode: absorbance
    wavelength: 450 nm
`;

const FULL_VOCAB_DOC = `
intentId: broad
actions:
  - { action: seed, source: cells }
  - { action: incubate, duration: 30 min }
  - { action: wash, source: pbs, target: plate }
  - { action: harvest, target: destination }
  - { action: spin, rpm: 300, duration: "5 min" }
  - { action: pellet, rpm: 1000 }
  - { action: freeze, temperatureC: -80 }
  - { action: serial_dilution, factor: 2, points: 4 }
  - { action: media_swap_duplicate_columns, source: media }
`;

describe('resolver-spec.validation', () => {
  it('the shipped vocabulary validates + lints CLEAN (zero findings)', async () => {
    const vocab = defaultScientistIntentVocabulary();
    expect(vocab.verbs()).toHaveLength(32);

    // The lint spec loads through the repo lint loader with zero load errors
    // for our paths, and the shipped document produces zero violations.
    const loaded = await loadAllLintSpecs({ basePath: join(process.cwd(), 'schema'), recursive: true });
    const ours = loaded.specs.filter((s) => s.name === 'scientist-intent-vocabulary');
    expect(ours).toHaveLength(1); // the DATA file is NOT lint-registered
    const bad = loaded.errors.filter((e) => e.path.includes('scientist-intent-vocabulary'));
    expect(bad).toEqual([]);

    const engine = new LintEngine();
    for (const s of loaded.specs) engine.addSpec(s.name, s.spec);
    const doc = parseYaml(readFileSync(join(VOCAB_DIR, VOCABULARY_DATA_FILE), 'utf-8'));
    const result = engine.lint(doc, SCIENTIST_INTENT_VOCABULARY_SCHEMA_ID);
    expect(result.violations).toEqual([]);
    // Backstop (bait 4): server.ts skips empty-rule specs silently — the shipped
    // spec must carry its policy rules.
    // MATRES-ELIG DELIBERATE PIN UPDATE (declared, spec §7.5/§9): P6
    // `vocab-preferred-member-of-levels` is the new well-formedness rule for the
    // arg-contract `preferred`/`levels` DECLARATION SLOTS.
    expect(ours[0]!.spec.rules.map((r) => r.id)).toEqual([
      'vocab-resolvable-args-declare-domain',
      'vocab-policy-refs-declared',
      'vocab-hint-verbs-carry-policy-ref',
      'vocab-pattern-verbs-forbid-required-resolvable',
      'vocab-many-args-declare-item-noun-field',
      'vocab-preferred-member-of-levels',
      'vocab-strategy-refs-declared',
    ]);
  });

  it('the vocabulary schema registers via the recursive schema loader ($id enforced) and the DATA file matches neither loader pattern', async () => {
    const result = await loadAllSchemas({ basePath: VOCAB_DIR, recursive: true });
    expect(result.errors).toEqual([]);
    const ids = result.entries.map((e) => e.schema['$id']);
    expect(ids).toContain(SCIENTIST_INTENT_VOCABULARY_SCHEMA_ID);
    // Only the *.schema.yaml file is schema-registered; the data file is not.
    // MATRES-ELIG DELIBERATE PIN UPDATE (declared, spec §6): the NEW
    // material-eligibility triplet lives under this tree
    // (schema/scientist-intent/material-eligibility/), so the recursive loader
    // now registers TWO schema files — the vocabulary's and the eligibility
    // meta-schema. The eligibility DATA and LINT files match neither loader
    // pattern and stay unregistered (asserted below).
    expect(result.entries).toHaveLength(2);
    expect(ids).toContain('https://computable-lab.com/schema/scientist-intent/material-eligibility.schema.yaml');
    expect(result.entries.map((e) => e.path ?? '')).not.toContain(join(VOCAB_DIR, VOCABULARY_DATA_FILE));
  });

  it('P1 mutation: a resolvable arg without a domain fails with the NAMED rule', () => {
    expect(() =>
      loadScientistIntentVocabulary({ path: join(FIXTURES, 'vocab-mutations', 'p1-missing-domain.yaml') }),
    ).toThrow(/vocab-resolvable-args-declare-domain/);
  });

  it('P2 mutation: an undeclared policyRef fails with the NAMED rule', () => {
    expect(() =>
      loadScientistIntentVocabulary({ path: join(FIXTURES, 'vocab-mutations', 'p2-undeclared-policyref.yaml') }),
    ).toThrow(/vocab-policy-refs-declared/);
  });

  it('P3 mutation: a pattern verb requiring a resolvable arg fails with the NAMED rule', () => {
    expect(() =>
      loadScientistIntentVocabulary({ path: join(FIXTURES, 'vocab-mutations', 'p3-pattern-required-resolvable.yaml') }),
    ).toThrow(/vocab-pattern-verbs-forbid-required-resolvable/);
  });

  it('P4 mutation: a strategyRef absent from strategyOrder fails with the NAMED rule', () => {
    expect(() =>
      loadScientistIntentVocabulary({ path: join(FIXTURES, 'vocab-mutations', 'p4-unknown-strategyref.yaml') }),
    ).toThrow(/vocab-strategy-refs-declared/);
  });

  it('P2-hint mutation: a verb with a hintEligible arg and NO policyRef fails with the NAMED rule', () => {
    expect(() =>
      loadScientistIntentVocabulary({ path: join(FIXTURES, 'vocab-mutations', 'vocab-hint-missing-policyref.yaml') }),
    ).toThrow(/vocab-hint-verbs-carry-policy-ref/);
  });

  it('P2-hint control: a plain verb (no hintEligible arg) with NO policyRef loads CLEAN (no false positive)', () => {
    const vocab = loadScientistIntentVocabulary({ path: join(FIXTURES, 'vocab-mutations', 'vocab-plain-verb-no-policyref.yaml') });
    expect(vocab.verbs()).toHaveLength(31);
    expect(vocab.argContracts('spin').some((a) => a.hintEligible === true)).toBe(false);
    expect(vocab.argContracts('spin').some((a) => a.name === 'labware')).toBe(true);
  });

  it('structurally incomplete contract: an arg without kind fails schema validation', () => {
    expect(() =>
      loadScientistIntentVocabulary({ path: join(FIXTURES, 'vocab-mutations', 'struct-missing-kind.yaml') }),
    ).toThrow(/failed schema validation/);
  });

  it('an emptied vocabulary fails LOUD naming the file (no default verb set, bait 1)', () => {
    expect(() =>
      loadScientistIntentVocabulary({ path: join(FIXTURES, 'vocab-empty', VOCABULARY_DATA_FILE) }),
    ).toThrow(/scientist-intent-vocabulary\.yaml.*minItems|failed schema validation/s);
  });

  it('a missing vocabulary file fails LOUD naming the path', () => {
    expect(() =>
      loadScientistIntentVocabulary({ path: join(FIXTURES, 'vocab-nope', 'scientist-intent-vocabulary.yaml') }),
    ).toThrow(/not found/);
  });

  it('contenderOrder off-state: fixture without the block loads with key ABSENCE', () => {
    const off = loadScientistIntentVocabulary({
      path: join(FIXTURES, 'vocab-contender-order-off', VOCABULARY_DATA_FILE),
    });
    expect('contenderOrder' in off.policies().ambiguity).toBe(false);
    expect(off.policies().ambiguity.mode).toBe('clarify');
    expect(off.policies().ambiguity.strategyRef).toBe('symbolic_label');
  });

  it('fixture vocabularies cache per resolved path (bait 2: fixture injection gets its own instance)', () => {
    const a = loadScientistIntentVocabulary({ path: join(FIXTURES, 'vocab-minus-pellet', VOCABULARY_DATA_FILE) });
    const b = loadScientistIntentVocabulary({ path: join(FIXTURES, 'vocab-minus-pellet', VOCABULARY_DATA_FILE) });
    const shipped = defaultScientistIntentVocabulary();
    expect(a).toBe(b); // cached per path
    expect(a).not.toBe(shipped);
    expect(a.verbs()).toHaveLength(31);
    expect(shipped.verbs()).toHaveLength(32);
  });
});

describe('current-verb-parity', () => {
  it('vocabulary verb set+order == verb-inventory.yaml == 32 (order-aware, bait 10)', () => {
    const inventory = (parseYaml(readFileSync(INVENTORY_PATH, 'utf-8')) as { verbs: string[] }).verbs;
    const vocab = defaultScientistIntentVocabulary();
    expect(inventory).toHaveLength(32);
    expect([...vocab.verbs()]).toEqual(inventory); // order-aware equality
    expect(new Set(vocab.verbs())).toEqual(new Set(inventory)); // set identity both directions
  });

  it('class: pattern is declared on exactly the 4 geometric macros', () => {
    const vocab = defaultScientistIntentVocabulary();
    expect([...vocab.patterns()].sort()).toEqual([
      'media_swap_duplicate_columns',
      'repeat_rows',
      'serial_dilution',
      'source_wells_to_duplicate_target_columns',
    ]);
  });

  it('every acceptance shape SPINE-1 pinned still parses through the REAL parseScientistIntent singleton', () => {
    const doc1 = parseScientistIntent(THREE_ACTION);
    expect(doc1.actions).toHaveLength(3);
    const doc2 = parseScientistIntent(FULL_VOCAB_DOC);
    expect(doc2.actions).toHaveLength(9);
  });

  it('every ACTION_SYNONYMS target is a vocabulary verb (Q2 mirror-honesty pin)', async () => {
    const { ACTION_SYNONYMS } = await import('./liftScientistIntent.js');
    const vocab = defaultScientistIntentVocabulary();
    for (const [alias, target] of Object.entries(ACTION_SYNONYMS)) {
      expect(vocab.has(target), `synonym ${alias} -> ${target}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// L2-LABSTATE-CONTENTS-1 — the labwareIdentityResolution DATA section (§5.2):
// the per-load frozen read + the fail-closed absent arm. The rung ids and
// instance fields are DATA (the meta-schema validates the shape; this test
// pins the per-load read so the data change cannot silently drift).
// ---------------------------------------------------------------------------

describe('L2-LABSTATE-CONTENTS-1 — labwareIdentityResolution DATA (per-load read)', () => {
  it('the shipped vocabulary declares the never-guess ladder (order + tokenFields, declaration order pinned)', () => {
    const vocab = defaultScientistIntentVocabulary();
    const lir = vocab.labwareIdentityResolution();
    // Declaration order pinned (first-hit-wins: R1 raw instanceId, R2 declared
    // identity tokens, R3 unique declared type — the OQ-3 live winner).
    expect([...lir.order]).toEqual([
      'instanceIdentity',
      'declaredIdentityTokens',
      'uniqueLabwareType',
    ]);
    // Index-aligned with `order` (R1->instanceId, R2->identityTokens,
    // R3->labwareType) — the fold's generic field-identity evaluator reads
    // these declared fields; the alignment is data, not a TS branch.
    expect([...lir.tokenFields]).toEqual(['instanceId', 'identityTokens', 'labwareType']);
    // Frozen per load (the fix2 idiom — the wellsetValueTokens /
    // materialBearingEventTypes discipline): the same arrays across two reads.
    const again = vocab.labwareIdentityResolution();
    expect(again.order).toBe(lir.order);
    expect(again.tokenFields).toBe(lir.tokenFields);
    expect(Object.isFrozen(lir.order)).toBe(true);
    expect(Object.isFrozen(lir.tokenFields)).toBe(true);
  });

  it('an ABSENT section fails CLOSED to the empty lists (rung R1 ONLY — the raw path keeps working)', () => {
    // The fixture triplet carries no labwareIdentityResolution section (it
    // predates this item) — the loader must NOT throw (the section is optional
    // in the meta-schema) and must return the empty lists. D5 (advc fix-run
    // 1): the fold treats an empty `order` EXACTLY as absent rules — rung R1
    // ONLY (the raw instanceId path), so an absent section and a 2-arg fold
    // call are identical (the pass-seam test pins the R1-default behavior).
    const vocab = loadScientistIntentVocabulary({
      path: join(FIXTURES, 'vocab-minus-pellet', VOCABULARY_DATA_FILE),
    });
    const lir = vocab.labwareIdentityResolution();
    expect([...lir.order]).toEqual([]);
    expect([...lir.tokenFields]).toEqual([]);
  });

  // D6 (advc fix-run 1): the CONTENT-BEARING event types on the WRITE side
  // are DATA (the labStateContentBearingEventTypes list) — the fold-side
  // twin of materialBearingEventTypes (the read half's taxonomy). Per-load
  // frozen read + fail-closed absent arm (the same discipline as the two
  // lists above): the lab_state pass threads THIS list into the fold's
  // content-bearing test at the pass seam — the TS carries no second
  // literal list of event types (the B3 boundary / no-double-vocabulary).
  it('the shipped vocabulary declares the content-bearing event types (D6 — the fold-side DATA list, per-load frozen)', () => {
    const vocab = defaultScientistIntentVocabulary();
    const cb = [...vocab.labStateContentBearingEventTypes()];
    // The fold's §7 never-guess surface: add_material always; transfer when
    // it carries a labware carrier (the carrier check stays a shape probe —
    // the event-type taxonomy is DATA here).
    expect(cb).toEqual(['add_material', 'transfer']);
    // Frozen per load (the fix2 idiom): the SAME array across two reads.
    expect(vocab.labStateContentBearingEventTypes()).toBe(vocab.labStateContentBearingEventTypes());
    expect(Object.isFrozen(vocab.labStateContentBearingEventTypes())).toBe(true);
  });

  it('an ABSENT content-bearing section fails CLOSED to the empty list (D6 — no event is content-bearing, the pass surfaces no diagnostics)', () => {
    // The fixture triplet predates this section — the loader must NOT throw
    // and must return the empty list (fail-closed: over-conservative,
    // never-guess-safe).
    const vocab = loadScientistIntentVocabulary({
      path: join(FIXTURES, 'vocab-minus-pellet', VOCABULARY_DATA_FILE),
    });
    expect([...vocab.labStateContentBearingEventTypes()]).toEqual([]);
  });

  // D7 (advc fix-run 1): DECLARATION-INTEGRITY pin — `order` and
  // `tokenFields` must be INDEX-ALIGNED (equal length): the fold reads
  // tokenFields[i] for the i-th rung of order, so a length mismatch
  // silently disables the tail rungs (fail-closed, but a declaration
  // integrity hole). The meta-schema cannot express a cross-key length
  // EQUALITY (no such constraint in the DSL/Ajv shape the loader uses), so
  // the consistency is pinned HERE (test authority) — and by the
  // per-load read above, which pins the shipped lengths as equal.
  it('order/tokenFields are index-aligned (equal length) — a length mismatch would silently disable tail rungs (D7)', () => {
    const vocab = defaultScientistIntentVocabulary();
    const lir = vocab.labwareIdentityResolution();
    expect(lir.order.length).toBe(lir.tokenFields.length);
    expect(lir.order.length).toBeGreaterThanOrEqual(1);
  });

  it('the PRE-CHANGE meta-schema REJECTS a data file carrying the section (the §5.2 RED pin — the meta-schema change is load-bearing)', () => {
    // The vocab-minus-pellet schema is the pre-change meta-schema (it carries
    // no labwareIdentityResolution declaration, and its root is
    // additionalProperties:false + unevaluatedProperties:false). A data file
    // that DOES carry the section must be REJECTED by it — proving the
    // meta-schema change (not just the data) is what admits the section.
    const dir = mkdtempSync(join(tmpdir(), 'vocab-lir-red-'));
    try {
      for (const f of [VOCABULARY_SCHEMA_FILE, VOCABULARY_LINT_FILE]) {
        copyFileSync(join(FIXTURES, 'vocab-minus-pellet', f), join(dir, f));
      }
      // The shipped DATA (carries the labwareIdentityResolution section) under
      // the PRE-CHANGE schema: the root additionalProperties:false rejects it.
      copyFileSync(join(VOCAB_DIR, VOCABULARY_DATA_FILE), join(dir, VOCABULARY_DATA_FILE));
      expect(() =>
        loadScientistIntentVocabulary({ path: join(dir, VOCABULARY_DATA_FILE) }),
      ).toThrow(/failed schema validation/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
