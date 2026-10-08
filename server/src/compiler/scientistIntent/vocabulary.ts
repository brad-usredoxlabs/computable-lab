/**
 * vocabulary.ts — the scientist-intent verb vocabulary loader/consumption API.
 *
 * Authority: schema/scientist-intent/scientist-intent-vocabulary.yaml (data),
 * validated against scientist-intent-vocabulary.schema.yaml (Ajv, structural)
 * and policed by scientist-intent-vocabulary.lint.yaml (LintEngine, conditional
 * policy P1-P4). The parser, tool schema, prompt, lifter and the normalizer's
 * pattern-set all consume THIS document — TypeScript keeps no hand-maintained
 * verb list (CLAUDE.md hard boundary / rip-out rule).
 *
 * FAIL LOUD: a missing file, an invalid document, or any lint finding throws
 * an Error naming the path (and the ruleId for lint failures). There is NO
 * default verb set and NO try/catch fallback anywhere — booting with a broken
 * vocabulary must fail, not limp on (spec bait 1).
 *
 * The loader never branches on a verb, class, or domain NAME: it validates
 * (schema), lints (engine), and reads. Policy conditionals live in the lint
 * DSL; policy VALUES live in `policies:` (data).
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { createValidator } from '../../validation/AjvValidator.js';
import { LintEngine } from '../../lint/LintEngine.js';
import type { LintSpec } from '../../lint/types.js';

export const SCIENTIST_INTENT_VOCABULARY_SCHEMA_ID =
  'https://computable-lab.com/schema/scientist-intent/vocabulary.schema.yaml';

/** Triplet file names (co-located in one directory; the data file matches
 *  neither SchemaLoader's *.schema.yaml nor LintSpecLoader's .lint.yaml). */
export const VOCABULARY_DATA_FILE = 'scientist-intent-vocabulary.yaml';
export const VOCABULARY_SCHEMA_FILE = 'scientist-intent-vocabulary.schema.yaml';
export const VOCABULARY_LINT_FILE = 'scientist-intent-vocabulary.lint.yaml';

/** Production location of the shipped triplet (cwd convention: tests and the
 *  server both run with cwd=server; server/schema is the repo schema symlink). */
export function defaultVocabularyDataPath(): string {
  return join(process.cwd(), 'schema', 'scientist-intent', VOCABULARY_DATA_FILE);
}

export type ScientistIntentVerbClass = 'simple' | 'compound' | 'pattern';
export type ScientistIntentArgKind = 'resolvable' | 'scalar' | 'wells' | 'quantity';

/** One per-argument contract declaration (exactOptionalPropertyTypes: optional
 *  members are ABSENT-or-value, built by conditional spread only). */
export interface ScientistIntentArgContract {
  name: string;
  kind: ScientistIntentArgKind;
  required: boolean;
  /** DECLARATION SLOT — where the noun must land (SPINE-3 adapters consume). */
  domain?: string;
  capability?: string;
  hintEligible?: boolean;
}

export interface ScientistIntentVerbEntry {
  name: string;
  class: ScientistIntentVerbClass;
  /** Policy (policies.ruleIds id) governing this verb's argument handling. */
  policyRef?: string;
  args: readonly ScientistIntentArgContract[];
}

export interface ScientistIntentVocabularyPolicies {
  strategyOrder: readonly string[];
  ambiguity: { mode: string; confidenceAccept: { min: number; max: number }; strategyRef: string };
  hintAuthority: { mode: string; strategyRef: string };
  ruleIds: readonly string[];
}

export interface ScientistIntentVocabulary {
  /** Verb names in declaration order (the migration baseline order). */
  verbs(): readonly string[];
  has(verb: string): boolean;
  classOf(verb: string): ScientistIntentVerbClass | undefined;
  argContracts(verb: string): readonly ScientistIntentArgContract[];
  /** Verbs whose declared class is 'pattern' (PATTERN_ACTIONS source). */
  patterns(): ReadonlySet<string>;
  policies(): ScientistIntentVocabularyPolicies;
  /** The ALLOWED ACTIONS block rendered for the system prompt. */
  promptVerbBlock(): string;
  /** The action enum for the emit_scientist_intent tool schema. */
  toolActionEnum(): string[];
}

export interface LoadScientistIntentVocabularyOptions {
  /** Absolute or cwd-relative path to a vocabulary DATA file (fixture injection). */
  path?: string;
}

function readYamlFile(path: string, label: string): unknown {
  if (!existsSync(path)) {
    throw new Error(
      `scientist-intent vocabulary ${label} file not found: ${path} — ` +
      `the vocabulary triplet is required; there is no default verb set`,
    );
  }
  try {
    return parseYaml(readFileSync(path, 'utf-8'));
  } catch (error) {
    throw new Error(
      `scientist-intent vocabulary ${label} file is not parseable YAML: ${path} ` +
      `(${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

function buildVocabulary(dataPath: string): ScientistIntentVocabulary {
  const dir = dirname(dataPath);
  const schemaPath = join(dir, VOCABULARY_SCHEMA_FILE);
  const lintPath = join(dir, VOCABULARY_LINT_FILE);

  const doc = readYamlFile(dataPath, 'vocabulary');
  const schemaDoc = readYamlFile(schemaPath, 'schema');
  const lintDoc = readYamlFile(lintPath, 'lint');

  // --- Ajv: structural validation against the vocabulary meta-schema -------
  const validator = createValidator({ strict: false });
  validator.addSchema(
    schemaDoc as Parameters<typeof validator.addSchema>[0],
    SCIENTIST_INTENT_VOCABULARY_SCHEMA_ID,
  );
  const structural = validator.validate(doc, SCIENTIST_INTENT_VOCABULARY_SCHEMA_ID);
  if (!structural.valid) {
    const detail = structural.errors
      .map((e) => `${e.path || '/'} [${e.keyword}]: ${e.message}`)
      .join('; ');
    throw new Error(
      `scientist-intent vocabulary failed schema validation (${dataPath}): ` +
      `${structural.errors.length} error(s): ${detail}`,
    );
  }

  // --- LintEngine: conditional policy (P1-P4) against the vocabulary doc ---
  // Same validity gate LintSpecLoader applies (lintVersion + rules array):
  // an empty-rule spec would be skipped silently at boot (server.ts), so the
  // loader refuses it here — resolver-spec.validation is the backstop.
  const spec = lintDoc as Partial<LintSpec> | null;
  if (!spec || typeof spec.lintVersion !== 'number' || !Array.isArray(spec.rules) || spec.rules.length === 0) {
    throw new Error(
      `scientist-intent vocabulary lint spec invalid (lintVersion + non-empty rules required): ${lintPath}`,
    );
  }
  const engine = new LintEngine();
  engine.addSpec(basename(lintPath), spec as LintSpec);
  const lintResult = engine.lint(doc, SCIENTIST_INTENT_VOCABULARY_SCHEMA_ID);
  if (lintResult.violations.length > 0) {
    const detail = lintResult.violations
      .map((v) => `${v.ruleId}: ${v.message}`)
      .join('; ');
    throw new Error(
      `scientist-intent vocabulary failed lint policy (${lintPath}): ` +
      `${lintResult.violations.length} violation(s): ${detail}`,
    );
  }

  // --- Read the validated document into the frozen consumption API --------
  interface RawArg { name: string; kind: ScientistIntentArgKind; required: boolean; domain?: string; capability?: string; hintEligible?: boolean }
  interface RawVerb { name: string; class: ScientistIntentVerbClass; policyRef?: string; args: RawArg[] }
  interface RawDoc { verbs: RawVerb[]; policies: ScientistIntentVocabularyPolicies }

  const raw = doc as RawDoc;
  const verbs: string[] = [];
  const entries = new Map<string, ScientistIntentVerbEntry>();
  const patterns = new Set<string>();

  for (const verb of raw.verbs) {
    verbs.push(verb.name);
    const args: ScientistIntentArgContract[] = verb.args.map((a) => ({
      name: a.name,
      kind: a.kind,
      required: a.required,
      ...(typeof a.domain === 'string' ? { domain: a.domain } : {}),
      ...(typeof a.capability === 'string' ? { capability: a.capability } : {}),
      ...(typeof a.hintEligible === 'boolean' ? { hintEligible: a.hintEligible } : {}),
    }));
    entries.set(verb.name, {
      name: verb.name,
      class: verb.class,
      ...(typeof verb.policyRef === 'string' ? { policyRef: verb.policyRef } : {}),
      args,
    });
    // Generic read of the DECLARED class field — not a branch on a verb name.
    if (verb.class === 'pattern') patterns.add(verb.name);
  }

  const verbsFrozen: readonly string[] = Object.freeze(verbs);
  const patternsFrozen: ReadonlySet<string> = patterns;
  const policies: ScientistIntentVocabularyPolicies = raw.policies;

  // Deterministic wrap for the prompt block (width-bounded, declaration order;
  // reproduces the historical hand-wrapped block byte-for-byte at width 74).
  const promptVerbBlock = (): string => {
    const lines: string[] = [];
    let current = '';
    for (const verb of verbsFrozen) {
      const candidate = current === '' ? verb : `${current} | ${verb}`;
      if (candidate.length > 74 && current !== '') {
        lines.push(`${current} |`);
        current = verb;
      } else {
        current = candidate;
      }
    }
    if (current !== '') lines.push(current);
    return lines.join('\n');
  };

  return {
    verbs: () => verbsFrozen,
    has: (verb: string) => entries.has(verb),
    classOf: (verb: string) => entries.get(verb)?.class,
    argContracts: (verb: string) => entries.get(verb)?.args ?? [],
    patterns: () => patternsFrozen,
    policies: () => policies,
    promptVerbBlock,
    toolActionEnum: () => [...verbsFrozen],
  };
}

/** Cache per resolved path (mirrors parseScientistIntent's cache discipline);
 *  fixture-vocabulary tests inject a distinct path and get their own instance. */
const vocabularyCache = new Map<string, ScientistIntentVocabulary>();

export function loadScientistIntentVocabulary(
  opts?: LoadScientistIntentVocabularyOptions,
): ScientistIntentVocabulary {
  const resolved = resolve(opts?.path ?? defaultVocabularyDataPath());
  const cached = vocabularyCache.get(resolved);
  if (cached) return cached;
  const vocab = buildVocabulary(resolved);
  vocabularyCache.set(resolved, vocab);
  return vocab;
}

/** The shipped production vocabulary (cached singleton path). */
export function defaultScientistIntentVocabulary(): ScientistIntentVocabulary {
  return loadScientistIntentVocabulary();
}
