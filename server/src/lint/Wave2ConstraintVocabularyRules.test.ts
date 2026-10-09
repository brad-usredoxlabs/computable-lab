/**
 * W2-2-QUANTITY-CONSTRAINTS — the constraint vocabulary lint rules FIRE on REAL
 * data (spec §2.5/§2.6, §6.5: a shipped spec WITH rules, proven to fire).
 *
 * Harness: ProtocolLintRules.test.ts / studyRunRules.test.ts style — parse the
 * REAL constraint-vocabulary.lint.yaml from disk (the same file the server loads
 * at boot via LintSpecLoader) into a LintEngine and lint inline payloads
 * directly. No HTTP, no :3093/:5193. The lint-v1 meta-schema block checks the
 * shipped spec's shape with Ajv as the structural authority.
 *
 * Fixture shape (documented honestly): the lint DSL has NO cross-document joins
 * (lint-v1 ops are exists/nonEmpty/regex/equals/in/all/any/not/allIn/everyItem/
 * noneIn only — §6.9). So a constraint payload fixture carries the vocabulary's
 * declared closure collections (classIds / overridePolicies / dimensionLaws /
 * policyBindingKeys / requiredClasses) ALONGSIDE its own `constraints` — the
 * vocabulary IS the closure context. Binding these collections to real consuming
 * records (protocol steps, well states) is W2-3's mount work; this item is the
 * contract only. Structural validity of the pure vocabulary doc is proven in
 * Wave2QuantitySchema.test.ts (Ajv), not here — lint fixtures carry the fields
 * the linted paths read, per the ProtocolLintRules fixture convention.
 *
 * Forcing-function fixtures (lint-fixture payloads, not DB records):
 *  - HepG2 aspiration: {count 10000 exact, volume 0 approximately_zero} passes;
 *    the MUTATIONS (count re-typed as volume / count erased) FAIL (non-vacuity,
 *    §6.2).
 *  - bead fixture: 5 beads/well count-per-well ratio + CL:bead_beater
 *    capabilityRequirement passes.
 *  - vendor_default without an override policy -> lint error (R2 vocabulary-side,
 *    R7 payload-side).
 *  - hard_bound vs vendor_default: same bound value, different bindingKind ->
 *    different findings (the strictness seam is DATA, §2.3).
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { LintEngine } from './LintEngine.js';
import { AjvValidator } from '../validation/AjvValidator.js';
import type { LintSpec } from './types.js';

const VOCAB_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/registry/constraint-vocabulary.schema.yaml';
const LINT_META_SCHEMA_ID = 'https://computable-lab.com/schema/lint/lint-v1.schema.yaml';

const VOCAB_DIR = '../../../schema/registry/constraint-vocabulary/';
const VOCAB_LINT_PATH = fileURLToPath(new URL(`${VOCAB_DIR}constraint-vocabulary.lint.yaml`, import.meta.url));
const VOCAB_DOC_PATH = fileURLToPath(new URL(`${VOCAB_DIR}constraint-vocabulary.yaml`, import.meta.url));
const VOCAB_LINT_META_PATH = fileURLToPath(new URL('../../../schema/scientist-intent/scientist-intent-vocabulary.lint.yaml', import.meta.url));
const LINT_META_SCHEMA_PATH = fileURLToPath(new URL('../../../schema/lint/lint-v1.schema.yaml', import.meta.url));

type VocabDoc = Record<string, unknown>;
type ConstraintPayload = VocabDoc & { profile: string; constraints: Array<Record<string, unknown>> };

function loadVocabLintSpec(): LintSpec {
  const parsed = parseYaml(readFileSync(VOCAB_LINT_PATH, 'utf-8')) as LintSpec;
  if (typeof parsed.lintVersion !== 'number' || !Array.isArray(parsed.rules)) {
    throw new Error('Invalid lint spec: constraint-vocabulary.lint.yaml');
  }
  return parsed;
}

function vocabDoc(): VocabDoc {
  return structuredClone(parseYaml(readFileSync(VOCAB_DOC_PATH, 'utf-8'))) as VocabDoc;
}

function engine(): LintEngine {
  const eng = new LintEngine();
  eng.addSpec('constraint-vocabulary.lint.yaml', loadVocabLintSpec());
  return eng;
}

function lintMetaValidator(): AjvValidator {
  const validator = new AjvValidator();
  const meta = parseYaml(readFileSync(LINT_META_SCHEMA_PATH, 'utf-8'));
  validator.addSchema(meta);
  return validator;
}

// --- fixture payloads -------------------------------------------------------

function hepG2Payload(mutate?: 'count-to-volume' | 'count-erased' | 'class-renamed'): ConstraintPayload {
  const constraints: Array<Record<string, unknown>> = [
    {
      class: 'minimum',
      bound: { value: 10000, unit: 'cells', dimension: 'count', qualifier: 'exact' },
      bindingKind: 'hard_bound',
      overridePolicy: 'never-override',
      subject: {
        ref: 'cf:constraint-minimum',
        role: 'cell_count',
        dimensionKey: 'cell_count:count',
        bindingPolicyKey: 'never-override:hard_bound',
      },
    },
    {
      class: 'threshold',
      bound: { value: 0, unit: 'uL', dimension: 'volume', qualifier: 'approximately_zero' },
      bindingKind: 'hard_bound',
      overridePolicy: 'never-override',
      subject: {
        ref: 'cf:constraint-threshold',
        role: 'aspiration_volume',
        dimensionKey: 'aspiration_volume:volume',
        bindingPolicyKey: 'never-override:hard_bound',
      },
    },
  ];
  if (mutate === 'count-to-volume') {
    // The collapse this contract forbids: the 10,000-cell count re-typed as a
    // volume. The payload's composed key follows the re-typed bound.
    const c = constraints[0];
    if (c) {
      c.bound = { value: 10000, unit: 'uL', dimension: 'volume', qualifier: 'exact' };
      c.subject = { ref: 'cf:constraint-minimum', role: 'cell_count', dimensionKey: 'cell_count:volume', bindingPolicyKey: 'never-override:hard_bound' };
    }
  }
  if (mutate === 'count-erased') {
    constraints.splice(0, 1);
  }
  if (mutate === 'class-renamed') {
    const c = constraints[0];
    if (c) c.class = 'class-never-declared';
  }
  return { ...vocabDoc(), profile: 'well_state', constraints };
}

function beadPayload(): ConstraintPayload {
  const constraints: Array<Record<string, unknown>> = [
    {
      class: 'ratio',
      bound: {
        numerator: { value: 5, unit: 'beads', dimension: 'count', qualifier: 'exact' },
        denominator: { value: 1, unit: 'wells', dimension: 'count', qualifier: 'exact' },
      },
      bindingKind: 'vendor_default',
      overridePolicy: 'lab-may-tighten',
      capabilityRequirement: { kind: 'ontology', id: 'CL:bead_beater', namespace: 'CL', label: 'bead beater' },
      subject: {
        ref: 'cf:constraint-ratio',
        role: 'bead_count',
        dimensionKey: 'bead_count:count',
        bindingPolicyKey: 'lab-may-tighten:vendor_default',
      },
    },
    {
      class: 'minimum',
      bound: { value: 5, unit: 'beads', dimension: 'count', qualifier: 'exact' },
      bindingKind: 'hard_bound',
      overridePolicy: 'never-override',
      subject: {
        ref: 'cf:constraint-minimum',
        role: 'bead_count',
        dimensionKey: 'bead_count:count',
        bindingPolicyKey: 'never-override:hard_bound',
      },
    },
    {
      class: 'threshold',
      bound: { value: 1, unit: 'wells', dimension: 'count', qualifier: 'exact' },
      bindingKind: 'hard_bound',
      overridePolicy: 'never-override',
      subject: {
        ref: 'cf:constraint-threshold',
        role: 'well_count',
        dimensionKey: 'well_count:count',
        bindingPolicyKey: 'never-override:hard_bound',
      },
    },
  ];
  return { ...vocabDoc(), profile: 'well_state', constraints };
}

// ============================================================================
// The shipped spec: non-empty, namespaced, meta-schema-valid, collision-free
// ============================================================================

describe('constraint vocabulary lint spec (shipped, non-empty, meta-schema-valid)', () => {
  it('the shipped spec has rules (server.ts:411 silently skips empty specs — §6.5)', () => {
    const spec = loadVocabLintSpec();
    expect(spec.rules.length).toBeGreaterThanOrEqual(3);
    expect(spec.schemaId).toBe(VOCAB_SCHEMA_ID);
  });

  it('every rule id carries the constraint-vocab- prefix (global uniqueness, LintEngine.ts:59-61)', () => {
    for (const rule of loadVocabLintSpec().rules) {
      expect(rule.id.startsWith('constraint-vocab-')).toBe(true);
    }
  });

  it('the shipped spec validates against the lint-v1 meta-schema (Ajv authority; rules projection per ProtocolLintRules precedent)', () => {
    const spec = loadVocabLintSpec();
    const res = lintMetaValidator().validate(
      { lintVersion: spec.lintVersion, rules: spec.rules },
      LINT_META_SCHEMA_ID,
    );
    expect(res.errors.map((e) => `${e.path} ${e.message}`)).toEqual([]);
    expect(res.valid).toBe(true);
  });

  it('adding the vocabulary spec alongside the scientist-intent vocab spec raises no Duplicate rule ID', () => {
    const eng = new LintEngine();
    eng.addSpec(
      'scientist-intent-vocabulary.lint.yaml',
      parseYaml(readFileSync(VOCAB_LINT_META_PATH, 'utf-8')) as LintSpec,
    );
    expect(() => eng.addSpec('constraint-vocabulary.lint.yaml', loadVocabLintSpec())).not.toThrow();
  });
});

// ============================================================================
// Clean vocabulary document: zero findings (the doc has no `constraints`, so
// the payload-closure rules skip it and the vocabulary rules must all pass)
// ============================================================================

describe('clean vocabulary document emits ZERO findings', () => {
  it('the shipped constraint-vocabulary.yaml passes every shipped vocabulary rule', () => {
    const r = engine().lint(vocabDoc(), VOCAB_SCHEMA_ID);
    expect(r.violations.map((v) => `${v.ruleId}: ${v.message}`)).toEqual([]);
    expect(r.valid).toBe(true);
    expect(r.summary?.errors).toBe(0);
  });
});

// ============================================================================
// Vocabulary-side arms (R1-R3): they FIRE, not just load
// ============================================================================

describe('R1 constraint-vocab-class-policy-refs-declared', () => {
  it('a class whose overridePolicy is undeclared produces an error', () => {
    const doc = vocabDoc() as { classes: Array<Record<string, unknown>> };
    const first = doc.classes[0];
    if (first) first.overridePolicy = 'policy-invented-by-nobody';
    const r = engine().lint(doc, VOCAB_SCHEMA_ID);
    const v = r.violations.find((x) => x.ruleId === 'constraint-vocab-class-policy-refs-declared');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('error');
    expect(r.valid).toBe(false);
  });
});

describe('R2 constraint-vocab-vendor-default-carries-policy', () => {
  it('removing the vendor_default class overridePolicy produces an error (undeclared strictness)', () => {
    const doc = vocabDoc() as { classes: Array<Record<string, unknown>> };
    const vendor = doc.classes.find((c) => c.defaultBindingKind === 'vendor_default');
    expect(vendor).toBeDefined();
    delete vendor?.overridePolicy;
    const r = engine().lint(doc, VOCAB_SCHEMA_ID);
    const v = r.violations.find((x) => x.ruleId === 'constraint-vocab-vendor-default-carries-policy');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('error');
  });
});

describe('R3 constraint-vocab-class-ids-unique + applicability closure', () => {
  it('a duplicated class id produces an error (mirror closure catches it)', () => {
    const doc = vocabDoc() as { classes: Array<Record<string, unknown>> };
    const firstId = doc.classes[0]?.id;
    const second = doc.classes[1];
    if (second && firstId !== undefined) second.id = firstId;
    const r = engine().lint(doc, VOCAB_SCHEMA_ID);
    const v = r.violations.find((x) => x.ruleId === 'constraint-vocab-class-ids-unique');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('error');
  });

  it('an empty class id produces an error', () => {
    const doc = vocabDoc() as { classes: Array<Record<string, unknown>> };
    const first = doc.classes[0];
    if (first) first.id = '';
    const r = engine().lint(doc, VOCAB_SCHEMA_ID);
    expect(r.violations.some((x) => x.ruleId === 'constraint-vocab-class-ids-unique')).toBe(true);
  });

  it('applicability naming an undeclared class produces an error', () => {
    const doc = vocabDoc() as { applicability: Array<Record<string, unknown>> };
    const first = doc.applicability[0];
    if (first) first.class = 'class-never-declared';
    const r = engine().lint(doc, VOCAB_SCHEMA_ID);
    const v = r.violations.find((x) => x.ruleId === 'constraint-vocab-applicability-names-declared-class');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('error');
  });
});

// ============================================================================
// Forcing-function fixtures (spec §2.6): the well-state arms
// ============================================================================

describe('forcing-function fixtures (spec §2.6): the well-state arms', () => {
  it('HepG2 aspiration: 10,000-cell count EXACT + volume 0 approximately_zero passes — count survives as dimension count beside volume', () => {
    const r = engine().lint(hepG2Payload(), VOCAB_SCHEMA_ID);
    expect(r.violations.map((v) => `${v.ruleId}: ${v.message}`)).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('MUTATION (non-vacuity, §6.2): re-typing the 10,000 count as a volume FAILS the declared dimension laws', () => {
    const r = engine().lint(hepG2Payload('count-to-volume'), VOCAB_SCHEMA_ID);
    expect(r.valid).toBe(false);
    const v = r.violations.find((x) => x.ruleId === 'constraint-vocab-constraint-dimension-laws');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('error');
  });

  it('MUTATION (non-vacuity, §6.2): erasing the count constraint FAILS the required-class closure', () => {
    const r = engine().lint(hepG2Payload('count-erased'), VOCAB_SCHEMA_ID);
    expect(r.valid).toBe(false);
    const v = r.violations.find((x) => x.ruleId === 'constraint-vocab-required-classes-present-well-state');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('error');
  });

  it('MUTATION: a constraint naming an undeclared class FAILS the class closure', () => {
    const r = engine().lint(hepG2Payload('class-renamed'), VOCAB_SCHEMA_ID);
    expect(r.valid).toBe(false);
    const v = r.violations.find((x) => x.ruleId === 'constraint-vocab-constraint-classes-resolve');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('error');
  });

  it('bead fixture: 5 beads/well count-per-well ratio + CL:bead_beater capabilityRequirement passes', () => {
    const r = engine().lint(beadPayload(), VOCAB_SCHEMA_ID);
    expect(r.violations.map((v) => `${v.ruleId}: ${v.message}`)).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('vendor_default constraint WITHOUT an override policy -> lint error on the payload', () => {
    const fixture = beadPayload();
    delete fixture.constraints[0]?.overridePolicy;
    const r = engine().lint(fixture, VOCAB_SCHEMA_ID);
    expect(r.valid).toBe(false);
    const v = r.violations.find((x) => x.ruleId === 'constraint-vocab-constraint-carries-declared-policy');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('error');
  });

  it('strictness seam: same bound value, bindingKind hard_bound under the RELAXABLE policy -> DIFFERENT finding than the vendor_default arm', () => {
    // Same 5-beads-per-well bound — only the bindingKind and its policy differ.
    // vendor_default under lab-may-tighten passes (proven in the bead fixture);
    // hard_bound under lab-may-relax is NOT a declared pair: relaxing a hard
    // bound is what policy forbids. (hard_bound under lab-may-tighten IS a
    // declared pair — tightening a hard cap keeps it hard; see the
    // class-default guard below and the maximum class's declared defaults.)
    const fixture = beadPayload();
    const c = fixture.constraints[0];
    if (c) {
      c.bindingKind = 'hard_bound';
      c.overridePolicy = 'lab-may-relax';
      c.subject = {
        ref: 'cf:constraint-ratio',
        role: 'bead_count',
        dimensionKey: 'bead_count:count',
        bindingPolicyKey: 'lab-may-relax:hard_bound',
      };
    }
    const r = engine().lint(fixture, VOCAB_SCHEMA_ID);
    expect(r.valid).toBe(false);
    const v = r.violations.find((x) => x.ruleId === 'constraint-vocab-binding-kind-policy-compatible');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('error');
  });
});

// ============================================================================
// Class-default guard (fix cycle 1, D1 net): every class's declared default
// (defaultBindingKind x overridePolicy) pair must be a declared
// policyBindingKey AND be allowed by that policy's allowedBindingKinds.
// DATA-DRIVEN, NO TS POLICY: the composed key is built from each class's OWN
// declared fields in constraint-vocabulary.yaml and checked against the
// policyBindingKeys + overridePolicies read from the SAME shipped doc. A
// future class whose declared default pair is incompatible (exactly the D1
// failure mode: a W2-3 consumer instantiating the class with its own defaults
// rejected by constraint-vocab-binding-kind-policy-compatible) fails loudly
// here.
// ============================================================================

type ClassDefaultDoc = {
  classes: Array<{ id: string; defaultBindingKind: string; overridePolicy?: string }>;
  policyBindingKeys: string[];
  overridePolicies: Array<{ id: string; allowedBindingKinds: string[] }>;
};

function classDefaultPairViolations(doc: ClassDefaultDoc): string[] {
  const declared = new Set(doc.policyBindingKeys);
  const policyKinds = new Map(doc.overridePolicies.map((p) => [p.id, new Set(p.allowedBindingKinds)]));
  const bad: string[] = [];
  for (const cls of doc.classes) {
    if (cls.overridePolicy === undefined) continue; // a class with no policy has no default pair (R2 covers vendor_default classes)
    const key = `${cls.overridePolicy}:${cls.defaultBindingKind}`;
    if (!declared.has(key)) bad.push(`${cls.id}: ${key} is not a declared policyBindingKey`);
    if (!policyKinds.get(cls.overridePolicy)?.has(cls.defaultBindingKind)) {
      bad.push(`${cls.id}: ${cls.defaultBindingKind} is not in ${cls.overridePolicy}.allowedBindingKinds`);
    }
  }
  return bad;
}

describe('class-default x policyBindingKeys guard (D1 net): every class default pair is a declared compatible pair', () => {
  it('all 10 shipped classes: defaultBindingKind x overridePolicy composes to a declared policyBindingKey AND a policy-allowed kind (zero violations)', () => {
    const doc = vocabDoc() as ClassDefaultDoc;
    expect(doc.classes.length).toBe(10);
    expect(doc.classes.every((c) => c.overridePolicy !== undefined)).toBe(true);
    expect(classDefaultPairViolations(doc)).toEqual([]);
  });

  it('NON-VACUITY: a fabricated incompatible default pair (in-memory mutation of a copy — disk untouched) IS caught', () => {
    const doc = vocabDoc() as ClassDefaultDoc;
    const maximum = doc.classes.find((c) => c.id === 'maximum');
    expect(maximum).toBeDefined();
    // Fabrication: let a lab RELAX a hard cap — the loosening the policy
    // forbids. Composed key lab-may-relax:hard_bound is not a declared pair.
    if (maximum) maximum.overridePolicy = 'lab-may-relax';
    const bad = classDefaultPairViolations(doc);
    expect(bad.length).toBe(2); // both declared surfaces flag it
    expect(bad.some((b) => b.includes('maximum') && b.includes('lab-may-relax:hard_bound is not a declared policyBindingKey'))).toBe(true);
    expect(bad.some((b) => b.includes('maximum') && b.includes('hard_bound is not in lab-may-relax.allowedBindingKinds'))).toBe(true);
    // The mutation was in-memory only: the shipped doc re-read from disk is clean.
    expect(classDefaultPairViolations(vocabDoc() as ClassDefaultDoc)).toEqual([]);
  });
});
