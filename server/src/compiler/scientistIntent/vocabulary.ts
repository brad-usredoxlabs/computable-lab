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
import type { MaterialLevel } from '../../resolve/types.js';

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
export type ScientistIntentArgKind = 'resolvable' | 'scalar' | 'wells' | 'quantity' | 'wellset';

/** One per-argument contract declaration (exactOptionalPropertyTypes: optional
 *  members are ABSENT-or-value, built by conditional spread only). */
export interface ScientistIntentArgContract {
  name: string;
  kind: ScientistIntentArgKind;
  required: boolean;
  /** DECLARATION SLOT — where the noun must land (SPINE-3 adapters consume).
   *  A single value names one landing zone; an array declares that ANY of the
   *  listed zones is acceptable for this argument. */
  domain?: string | readonly string[];
  capability?: string;
  hintEligible?: boolean;
  /** SPINE-8 DECLARATION SLOT — the MaterialLevel this argument's noun must
   *  land at (vocabulary-declared; the resolve_nouns pass supplies it to the
   *  engine as deps.levelFor). Absent = no level requirement. */
  level?: MaterialLevel;
  /** COMP-4 Stage B DECLARATION SLOT — multiplicity of the
   *  argument. 'many' on a resolvable arg means the wire value is an ARRAY of
   *  entries, each carrying its noun in the property named by itemNounField;
   *  the resolve_nouns doc-door iterates it generically. Absent = 'one'. */
  cardinality?: 'one' | 'many';
  /** For cardinality: many — the entry property carrying the symbolic noun
   *  the resolver binds (vocabulary-declared; lint P5 requires it). */
  itemNounField?: string;
  /** MATRES-ELIG DECLARATION SLOT [memo Q1, RATIFIED 2026-10-20] — the ALLOWED
   *  referent levels for binding this argument (canonical five; lint P7 pins
   *  members against the vocabulary's declared referentLevels). Absent =
   *  unconstrained (today's behavior, backwards-compatible). Read by the
   *  eligibility fact envelope as demanded.allowedLevels; lint P6 pins
   *  preferred ∈ levels. NB the vocabulary loader IS a cached singleton
   *  (vocabulary.ts:269-280) — the eligibility FILE follows the per-call law
   *  (eligibility/policy.ts); these declared slots ride the cached contract. */
  levels?: readonly string[];
  /** MATRES-ELIG DECLARATION SLOT [memo Q1] — the time-phase default hint for
   *  the PANEL's pre-selection (P5). NEVER a filter, never suppression:
   *  binding a non-preferred allowed level is legal without a clarification. */
  preferred?: string;
  /** L2-LABSTATE-CONTENTS-1 FIX RUN 2 (ruling LABSTATE-TOKENSITE-gate-l2t2355
   *  Q1) DECLARATION SLOT — the producer-side teaching for this argument: a
   *  one-line phrase->value contract contractBlock() renders generically under
   *  the verb line (the block the live chat sites embed). The render keys off
   *  the FIELD's presence — no consumer branches on a verb or arg name; a
   *  kind: wellset arg's line additionally composes the wellsetValueTokens
   *  DATA list (token membership stays single-homed; zero token literals in
   *  TS — the B3 discipline resolveWellsetsPass.ts honors). */
  teaching?: string;
  /** L2-CLARIFY-TARGET-1 Change 4a (architect ruling l2t2230, RULING (a))
   *  DECLARATION SLOT — a list of ALTERNATIVE argument names whose presence
   *  satisfies this contract (the §5.2 sweep's present-check: argumentPresent
   *  on the contract's own name OR any of these). Names OTHER declared args of
   *  the SAME verb; no dangling aliases (pinned by test — the lint DSL cannot
   *  express cross-sibling membership). Absent = no alias (today's behavior). */
  satisfiedBy?: readonly string[];
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
  ambiguity: { mode: string; confidenceAccept: { min: number; max: number }; strategyRef: string; identityCollapse?: { key: readonly string[]; survivor: readonly string[] } };
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
  /** The full CONTRACT block: every verb with its declared args, generated
   *  from this YAML. Single source so the model's menu and the Ajv gate cannot
   *  drift (the PB-CH-4b precedent: the model's menu must BE the compiler's
   *  membership check). */
  contractBlock(): string;
  /**
   * WELLSET-RESOLVER-1: the DECLARED contents-derived wellset token VALUES
   * (the vocabulary's wellsetValueTokens DATA list, declaration order). The
   * server-side resolve_wellsets pass reads THIS list to decide which
   * kind:wellset argument values are declared tokens — the token membership is
   * DATA (the B3 boundary: no token string-literal in the pass). Empty when the
   * vocabulary declares no wellsetValueTokens section (the optional slot).
   */
  wellsetValueTokens(): readonly string[];
  /**
   * WELLSET-RESOLVER-1 FIX RUN 1 (advc D8): the DECLARED material-bearing
   * EVENT TYPES (the vocabulary's materialBearingEventTypes DATA list) — the
   * primitive event types that add material to a well. The resolve_wellsets
   * pass reads THIS list to build the pending-draft layer of the contents
   * ledger — no hardcoded taxonomy in TS. Empty when the vocabulary declares
   * no materialBearingEventTypes section (the optional slot): the pending
   * layer then contributes nothing (fail-closed to the committed layer).
   */
  materialBearingEventTypes(): readonly string[];
  /**
   * L2-LABSTATE-CONTENTS-1 (spec §5.2): the DATA-declared labware IDENTITY
   * RESOLUTION ladder (rung `order` + the instance `tokenFields` each rung
   * reads, index-aligned). The lab_state pass reads THIS to thread the
   * never-guess resolution rules into the fold (a symbolic labwareId resolves
   * to a snapshot instance via the declared rungs — the rung ids + fields are
   * DATA, never a TS branch). Absent section => the empty lists (fail-closed:
   * the fold resolves rung R1 ONLY, the raw instanceId path — the pre-existing
   * behavior, so every pre-existing test stays byte-unchanged). D5 (advc
   * fix-run 1): the fold treats an EMPTY `order` the same as absent rules —
   * rung R1 ONLY — so an absent section and a 2-arg fold call are identical;
   * the code, this doc, and the pass comment agree.
   */
  labwareIdentityResolution(): {
    order: readonly string[];
    tokenFields: readonly string[];
  };
  /**
   * L2-LABSTATE-CONTENTS-1 FIX RUN 1 (advc D6): the CONTENT-BEARING EVENT
   * TYPES on the WRITE side — the DATA list of primitive event types whose
   * no-op fold is a never-guess surface the lab_state pass surfaces as a
   * diagnostic (§7). The fold-side twin of `materialBearingEventTypes` (the
   * READ half's ledger taxonomy): one DATA declaration of the
   * content-bearing concept, consumed by both halves — the TS carries no
   * second literal list of event types (the B3 boundary / no-double-
   * vocabulary discipline). Empty when the vocabulary declares no section
   * (the optional slot): fail-closed, no event is content-bearing, so the
   * pass surfaces no diagnostics (over-conservative, never-guess-safe).
   */
  labStateContentBearingEventTypes(): readonly string[];
}

/**
 * Normalise a declaration domain slot into a lowercase array.
 *
 * `string` → single-element array; `readonly string[]` → element-wise trimmed + lowercased;
 * blank/whitespace-only values yield the empty array (fail-closed parity).
 * `undefined` / empty → empty array.
 *
 * Return type is `readonly string[]` — never `undefined` (satisfies exactOptionalPropertyTypes).
 */
export function declaredDomains(
  arg?: string | readonly string[] | undefined,
): readonly string[] {
  if (arg === undefined) return [];
  if (typeof arg === 'string') { const t = arg.trim().toLowerCase(); return t.length > 0 ? [t] : []; }
  return arg.map((d) => d.trim().toLowerCase()).filter((d) => d.length > 0);
}

/**
 * Render a domain slot as a pipe-separated string (e.g. `labware|material`).
 * Both prompt emitters and the mirror must use this formatter so the slot
 * renders unambiguously — never raw interpolation of `a.domain`.
 */
export function formatArgDomain(
  arg?: string | readonly string[] | undefined,
): string {
  return declaredDomains(arg).join('|');
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
  interface RawArg { name: string; kind: ScientistIntentArgKind; required: boolean; domain?: string | readonly string[]; capability?: string; hintEligible?: boolean; level?: MaterialLevel; cardinality?: 'one' | 'many'; itemNounField?: string; levels?: readonly string[]; preferred?: string; teaching?: string; satisfiedBy?: string[] }
  interface RawVerb { name: string; class: ScientistIntentVerbClass; policyRef?: string; args: RawArg[] }
  interface RawDoc { verbs: RawVerb[]; policies: ScientistIntentVocabularyPolicies; wellsetValueTokens?: string[]; materialBearingEventTypes?: string[]; labStateContentBearingEventTypes?: string[]; labwareIdentityResolution?: { order?: string[]; tokenFields?: string[] } }

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
      // Domain: accept string or non-empty array (meta-schema is the validation
      // authority; conditional spread for exactOptionalPropertyTypes).
      ...(typeof a.domain === 'string'
        ? { domain: a.domain }
        : Array.isArray(a.domain) && a.domain.length > 0
        ? { domain: a.domain }
        : {}),
      ...(typeof a.capability === 'string' ? { capability: a.capability } : {}),
      ...(typeof a.hintEligible === 'boolean' ? { hintEligible: a.hintEligible } : {}),
      // Generic narrowing of the DECLARED level slot (the meta-schema enum is
      // the validation authority; no per-value branches, no verb knowledge).
      ...(typeof a.level === 'string' ? { level: a.level as MaterialLevel } : {}),
      // COMP-4 Stage B: the DECLARED multiplicity slots (same
      // SPINE-8 idiom — meta-schema enum is the authority, no per-value or
      // per-arg branches; exactOptionalPropertyTypes: conditional spreads).
      ...(typeof a.cardinality === 'string' ? { cardinality: a.cardinality as 'one' | 'many' } : {}),
      ...(typeof a.itemNounField === 'string' ? { itemNounField: a.itemNounField } : {}),
      // MATRES-ELIG [memo Q1, RATIFIED]: the DECLARED allowed-level set +
      // preferred hint (same SPINE-8 idiom — the meta-schema enum is the
      // validation authority; generic read, no per-value or per-arg branches,
      // conditional spreads for exactOptionalPropertyTypes). The eligibility
      // envelope consumes `levels` as demanded.allowedLevels; `preferred` is
      // disclosure only (never a filter, never suppression).
      ...(Array.isArray(a.levels) && a.levels.length > 0 ? { levels: a.levels } : {}),
      ...(typeof a.preferred === 'string' ? { preferred: a.preferred } : {}),
      // FIX RUN 2 [ruling LABSTATE-TOKENSITE-gate-l2t2355 Q1]: the DECLARED
      // teaching slot (same SPINE-8 idiom — generic read, meta-schema is the
      // authority, no per-verb/per-arg branches, conditional spread for
      // exactOptionalPropertyTypes). Only consumed by contractBlock()'s
      // generic render — the resolver/parser never read it (zero behavior).
      ...(typeof a.teaching === 'string' ? { teaching: a.teaching } : {}),
      // L2-CLARIFY-TARGET-1 Change 4a [ruling l2t2230 (a)]: the DECLARED
      // satisfiedBy alias slot (same SPINE-8 idiom — generic read, the
      // meta-schema is the structural authority, no per-verb/per-arg branches,
      // conditional spread for exactOptionalPropertyTypes). The §5.2 sweep
      // consumes it as the alias list whose presence satisfies the contract.
      ...(Array.isArray(a.satisfiedBy) && a.satisfiedBy.length > 0 ? { satisfiedBy: a.satisfiedBy } : {}),
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
  // WELLSET-RESOLVER-1: the DECLARED contents-derived wellset token VALUES
  // (DATA — the meta-schema validates the shape; generic read, no per-value
  // branch, frozen). Absent section ⇒ empty list (the optional slot).
  const wellsetValueTokensFrozen: readonly string[] = Object.freeze(
    Array.isArray(raw.wellsetValueTokens) ? raw.wellsetValueTokens.filter((t) => typeof t === 'string') : [],
  )
  // WELLSET-RESOLVER-1 FIX RUN 1 (advc D8): the material-bearing event-type
  // taxonomy is DATA (the vocabulary's materialBearingEventTypes list) — read
  // per load, same discipline as the token list; absent section => [] (the
  // pending-draft layer contributes nothing, fail-closed).
  const materialBearingEventTypesFrozen: readonly string[] = Object.freeze(
    Array.isArray(raw.materialBearingEventTypes) ? raw.materialBearingEventTypes.filter((t) => typeof t === 'string') : [],
  );
  // L2-LABSTATE-CONTENTS-1 FIX RUN 1 (advc D6): the content-bearing event-type
  // taxonomy on the WRITE side is DATA (the vocabulary's
  // labStateContentBearingEventTypes list) — read per load, same discipline as
  // the token lists above; absent section => [] (fail-closed: the lab_state
  // pass surfaces no diagnostics, over-conservative never-guess). The lab_state
  // pass threads this into isContentBearing at the pass seam — the fold module
  // stays pure and carries no second literal list of event types.
  const labStateContentBearingEventTypesFrozen: readonly string[] = Object.freeze(
    Array.isArray(raw.labStateContentBearingEventTypes) ? raw.labStateContentBearingEventTypes.filter((t) => typeof t === 'string') : [],
  );
  // L2-LABSTATE-CONTENTS-1 (spec §5.2): the DATA-declared labware identity
  // resolution ladder (same fix2 idiom as the two lists above — generic read,
  // meta-schema validates the shape, frozen, fail-closed to the empty lists
  // when the section is absent => the fold resolves rung R1 ONLY, the raw
  // instanceId path — D5, advc fix-run 1: the fold treats an empty `order`
  // exactly as absent rules, so absent-section and 2-arg calls agree). The
  // rung ids + instance fields are DATA — this module
  // carries no rung-id or field-name policy branch.
  const labwareIdentityResolutionOrderFrozen: readonly string[] = Object.freeze(
    Array.isArray(raw.labwareIdentityResolution?.order)
      ? raw.labwareIdentityResolution.order.filter((t) => typeof t === 'string')
      : [],
  );
  const labwareIdentityResolutionTokenFieldsFrozen: readonly string[] = Object.freeze(
    Array.isArray(raw.labwareIdentityResolution?.tokenFields)
      ? raw.labwareIdentityResolution.tokenFields.filter((t) => typeof t === 'string')
      : [],
  );

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

  // The CONTRACT block: one line per verb (declaration order) with its
  // declared args rendered verbatim from the YAML — `name??:kind(domain)`.
  // Generated from verbsFrozen + the entries' arg contracts; NO hand-written
  // verb list (the same authority the Ajv enum injection and the prompt block
  // read), so a future verb addition auto-appears in every disclosure site.
  // FIX RUN 2 (ruling LABSTATE-TOKENSITE-gate-l2t2355 Q1): an arg contract
  // carrying the declared `teaching` slot gets ONE extra indented line under
  // the verb line, keyed off the FIELD's presence (never off a verb or arg
  // NAME). A `kind: wellset` arg's line additionally composes the declared
  // token list from wellsetValueTokens DATA (kind is the declared arg-kind
  // discriminant — the same shape parseScientistIntent/resolveWellsetsPass
  // read; a KIND check, not a name branch). Zero token literals in TS: the
  // B3 boundary.
  const contractBlock = (): string => {
    const lines: string[] = ['ACTIONS (the CLOSED vocabulary — never invent another):'];
    for (const verb of verbsFrozen) {
      const args = entries.get(verb)!.args
        .map((a) => `${a.name}${a.required ? '' : '?'}:${a.kind}${a.domain ? `(${formatArgDomain(a.domain)})` : ''}`)
        .join(', ');
      lines.push(`- ${verb}${args ? ` — ${args}` : ''}`);
      for (const a of entries.get(verb)!.args) {
        if (typeof a.teaching !== 'string') continue; // generic FIELD-presence gate
        const tokenClause = a.kind === 'wellset' && wellsetValueTokensFrozen.length > 0
          ? ` Declared tokens: ${wellsetValueTokensFrozen.join(', ')}.`
          : '';
        lines.push(`  ${a.name}: ${a.teaching}${tokenClause}`);
      }
    }
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
    contractBlock,
    wellsetValueTokens: () => wellsetValueTokensFrozen,
    materialBearingEventTypes: () => materialBearingEventTypesFrozen,
    labStateContentBearingEventTypes: () => labStateContentBearingEventTypesFrozen,
    labwareIdentityResolution: () => ({
      order: labwareIdentityResolutionOrderFrozen,
      tokenFields: labwareIdentityResolutionTokenFieldsFrozen,
    }),
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
