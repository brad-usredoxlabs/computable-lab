/**
 * SPINE-2 vocabulary loader tests — resolver-spec.validation + current-verb-parity.
 *
 * resolver-spec.validation: the shipped vocabulary validates (Ajv) AND lints
 * (P1-P4) CLEAN; each named fixture mutation produces a NAMED failure.
 * current-verb-parity: vocabulary verb set+order == fixtures/verb-inventory.yaml
 * == 31, and every acceptance shape SPINE-1 pinned still parses through the
 * REAL parseScientistIntent singleton.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  loadScientistIntentVocabulary,
  defaultScientistIntentVocabulary,
  SCIENTIST_INTENT_VOCABULARY_SCHEMA_ID,
  VOCABULARY_DATA_FILE,
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
    expect(vocab.verbs()).toHaveLength(31);

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
    // spec must carry its four policy rules.
    expect(ours[0]!.spec.rules.map((r) => r.id)).toEqual([
      'vocab-resolvable-args-declare-domain',
      'vocab-policy-refs-declared',
      'vocab-hint-verbs-carry-policy-ref',
      'vocab-pattern-verbs-forbid-required-resolvable',
      'vocab-strategy-refs-declared',
    ]);
  });

  it('the vocabulary schema registers via the recursive schema loader ($id enforced) and the DATA file matches neither loader pattern', async () => {
    const result = await loadAllSchemas({ basePath: VOCAB_DIR, recursive: true });
    expect(result.errors).toEqual([]);
    const ids = result.entries.map((e) => e.schema['$id']);
    expect(ids).toContain(SCIENTIST_INTENT_VOCABULARY_SCHEMA_ID);
    // Only the *.schema.yaml file is schema-registered; the data file is not.
    expect(result.entries).toHaveLength(1);
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

  it('fixture vocabularies cache per resolved path (bait 2: fixture injection gets its own instance)', () => {
    const a = loadScientistIntentVocabulary({ path: join(FIXTURES, 'vocab-minus-pellet', VOCABULARY_DATA_FILE) });
    const b = loadScientistIntentVocabulary({ path: join(FIXTURES, 'vocab-minus-pellet', VOCABULARY_DATA_FILE) });
    const shipped = defaultScientistIntentVocabulary();
    expect(a).toBe(b); // cached per path
    expect(a).not.toBe(shipped);
    expect(a.verbs()).toHaveLength(30);
    expect(shipped.verbs()).toHaveLength(31);
  });
});

describe('current-verb-parity', () => {
  it('vocabulary verb set+order == verb-inventory.yaml == 31 (order-aware, bait 10)', () => {
    const inventory = (parseYaml(readFileSync(INVENTORY_PATH, 'utf-8')) as { verbs: string[] }).verbs;
    const vocab = defaultScientistIntentVocabulary();
    expect(inventory).toHaveLength(31);
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
