/**
 * MATRES-ELIG — the eligibility POLICY loader (spec §7.1/§7.3, §9).
 *
 * The three-way acceptability verdicts and the purpose-based tier-legality
 * table are DATA (schema/scientist-intent/material-eligibility/). This module
 * loads + validates + lints that triplet and exposes a frozen read API. It
 * holds NO policy branch: no tier literal, no level name, no verdict logic —
 * every value it returns is read from the validated document.
 *
 * PER-CALL LOAD LAW (spec §9, the nounShape precedent — resolutionEngine.ts
 * comment): the eligibility file is loaded per call, NEVER process-cached, so
 * a data edit needs no stack restart and a fixture-injected path gets its own
 * instance. (Counter-example on record: loadScientistIntentVocabulary IS a
 * cached singleton — vocabulary.ts:269-280. ELIG does not read the vocabulary
 * cache; it reads the DECLARED contract slots the caller already carries.)
 *
 * Validation order mirrors the vocabulary loader exactly: Ajv (structural
 * authority) first, then the bound lint spec (conditional well-formedness),
 * then a generic read. A present-but-empty lint spec throws (the boot-skip
 * backstop). Malformed DATA throws naming the path. An ABSENT triplet is a
 * disclosed off-state for the engine (loadMaterialEligibilityIfPresent → null,
 * the nounShape parity rule) — never a silent default policy set.
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { createValidator } from '../../../validation/AjvValidator.js';
import { LintEngine } from '../../../lint/LintEngine.js';
import type { LintSpec } from '../../../lint/types.js';

export const MATERIAL_ELIGIBILITY_SCHEMA_ID =
  'https://computable-lab.com/schema/scientist-intent/material-eligibility.schema.yaml';

/** Triplet file names (co-located; the DATA file matches neither SchemaLoader's
 *  *.schema.yaml nor LintSpecLoader's .lint.yaml consumption pattern — the
 *  loader binds data -> schema -> lint by schemaId, the vocabulary pattern). */
export const ELIGIBILITY_DATA_FILE = 'material-eligibility.yaml';
export const ELIGIBILITY_SCHEMA_FILE = 'material-eligibility.schema.yaml';
export const ELIGIBILITY_LINT_FILE = 'material-eligibility.lint.yaml';

/** Production location of the shipped triplet (cwd convention: tests and the
 *  server run with cwd=server; server/schema is the repo schema symlink). */
export function defaultEligibilityDataPath(): string {
  return join(process.cwd(), 'schema', 'scientist-intent', 'material-eligibility', ELIGIBILITY_DATA_FILE);
}

export interface TierLegalityRow {
  demandedLevel: string;
  mode: string;
  queryTiers: readonly number[];
  displayTiers: readonly number[];
  identityOnlyTiers: readonly number[];
}

export interface LevelSpellingRow {
  canonical: string;
  layerSpellings: readonly string[];
}

/** One eligibility policy as declared (predicate shapes ride the shipped lint
 *  DSL types — zero new ops). */
export interface EligibilityPolicy {
  id: string;
  verdict: string;
  role?: string;
  when?: unknown;
  custodyGuard?: unknown;
  requires: unknown;
  assert: unknown;
}

export interface MaterialEligibilityPolicy {
  /** The five canonical referent levels (data; lint-checked). */
  referentLevels(): readonly string[];
  /** The levels whose PURPOSE is catalog identity (identityPurpose read). */
  identityLevels(): readonly string[];
  /** Canonical five + the undeclared spelling — the values a legality row names. */
  demandedLevelValues(): readonly string[];
  spineTiers(): readonly number[];
  remoteTiers(): readonly number[];
  custodyNeverTiers(): readonly number[];
  identityRole(): string;
  /** The policy ids whose verdict carries the identityRole tag (fix-run 1 D2:
   *  the role value is declared ONCE — the per-policy data carries no role
   *  literal; the loader injects the single-sourced tag by policy id). */
  identityRolePolicies(): readonly string[];
  catalogScopeReason(): string;
  /** The reason code for a band-passing candidate whose bind verdict is not
   *  PASS (§7.4.2 — data-named, never a TS literal). */
  bindIncompleteReason(): string;
  /** The spine's undeclared-level spelling (data, not a TS literal). */
  undeclaredLevelSpelling(): string;
  levelSpellings(): readonly LevelSpellingRow[];
  campaignModes(): readonly string[];
  defaultCampaignMode(): string;
  verdictClasses(): readonly string[];
  /** Compiled catalog-shape patterns (DATA regexes, per call). */
  catalogShape(): readonly RegExp[];
  tierLegality(): readonly TierLegalityRow[];
  policies(): readonly EligibilityPolicy[];
  /** Generic row lookup: (demanded level x mode). No domain knowledge — a
   *  plain data find; an absent row returns undefined (the policies then read
   *  the missing legality as INCOMPLETE, never a default). */
  tierLegalityRow(demandedLevel: string, mode: string): TierLegalityRow | undefined;
}

export interface LoadMaterialEligibilityOptions {
  /** Absolute or cwd-relative path to an eligibility DATA file (fixture
   *  injection — the anti-hardcode proof mutates a fixture copy, never the
   *  shipped file). */
  path?: string;
}

function readYamlFile(path: string, label: string): unknown {
  if (!existsSync(path)) {
    throw new Error(
      `material-eligibility ${label} file not found: ${path} — ` +
      `the eligibility triplet is required; there is no default policy set`,
    );
  }
  try {
    return parseYaml(readFileSync(path, 'utf-8'));
  } catch (error) {
    throw new Error(
      `material-eligibility ${label} file unreadable: ${path} (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

export function loadMaterialEligibility(
  options: LoadMaterialEligibilityOptions = {},
): MaterialEligibilityPolicy {
  const dataPath = options.path ?? defaultEligibilityDataPath();
  const dir = dirname(dataPath);
  const schemaPath = join(dir, ELIGIBILITY_SCHEMA_FILE);
  const lintPath = join(dir, ELIGIBILITY_LINT_FILE);

  const doc = readYamlFile(dataPath, 'data');
  const schemaDoc = readYamlFile(schemaPath, 'schema');
  const lintDoc = readYamlFile(lintPath, 'lint');

  // --- Ajv: structural validation against the eligibility meta-schema ------
  // The meta-schema $refs the SHIPPED lint-v1 predicate definition (zero new
  // DSL ops); it must be registered for the $ref to resolve.
  const validator = createValidator({ strict: false });
  const lintMetaPath = join(process.cwd(), 'schema', 'lint', 'lint-v1.schema.yaml');
  const lintMetaDoc = readYamlFile(lintMetaPath, 'lint meta-schema');
  validator.addSchema(
    lintMetaDoc as Parameters<typeof validator.addSchema>[0],
    'https://computable-lab.com/schema/lint/lint-v1.schema.yaml',
  );
  validator.addSchema(
    schemaDoc as Parameters<typeof validator.addSchema>[0],
    MATERIAL_ELIGIBILITY_SCHEMA_ID,
  );
  const structural = validator.validate(doc, MATERIAL_ELIGIBILITY_SCHEMA_ID);
  if (!structural.valid) {
    const detail = structural.errors
      .map((e) => `${e.path || '/'} [${e.keyword}]: ${e.message}`)
      .join('; ');
    throw new Error(
      `material-eligibility failed schema validation (${dataPath}): ` +
      `${structural.errors.length} error(s): ${detail}`,
    );
  }

  // --- LintEngine: conditional well-formedness against the data document ---
  // Same validity gate the vocabulary loader applies: an empty-rule spec would
  // be skipped silently at boot (server.ts), so the loader refuses it here.
  const spec = lintDoc as Partial<LintSpec> | null;
  if (!spec || typeof spec.lintVersion !== 'number' || !Array.isArray(spec.rules) || spec.rules.length === 0) {
    throw new Error(
      `material-eligibility lint spec invalid (lintVersion + non-empty rules required): ${lintPath}`,
    );
  }
  const engine = new LintEngine();
  engine.addSpec(basename(lintPath), spec as LintSpec);
  const lintResult = engine.lint(doc, MATERIAL_ELIGIBILITY_SCHEMA_ID);
  if (lintResult.violations.length > 0) {
    const detail = lintResult.violations
      .map((v) => `${v.ruleId}: ${v.message}`)
      .join('; ');
    throw new Error(
      `material-eligibility failed lint policy (${lintPath}): ` +
      `${lintResult.violations.length} violation(s): ${detail}`,
    );
  }

  // --- Generic read of the validated document ------------------------------
  interface RawDoc {
    referentLevels: string[];
    identityLevels: string[];
    demandedLevelValues: string[];
    spineTiers: number[];
    remoteTiers: number[];
    custodyNeverTiers: number[];
    identityRole: string;
    identityRolePolicies: string[];
    catalogScopeReason: string;
    bindIncompleteReason: string;
    undeclaredLevelSpelling: string;
    levelSpellings: LevelSpellingRow[];
    campaignModes: string[];
    defaultCampaignMode: string;
    verdictClasses: string[];
    catalogShape: string[];
    tierLegality: TierLegalityRow[];
    policies: EligibilityPolicy[];
  }
  const raw = doc as RawDoc;

  const catalog = raw.catalogShape.map((pattern) => {
    try {
      return new RegExp(pattern, 'u');
    } catch (error) {
      throw new Error(
        `material-eligibility data (${dataPath}): invalid catalogShape pattern "${pattern}": ` +
        `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  const tierRows = raw.tierLegality.map((row) => ({
    demandedLevel: row.demandedLevel,
    mode: row.mode,
    queryTiers: Object.freeze([...row.queryTiers]),
    displayTiers: Object.freeze([...row.displayTiers]),
    identityOnlyTiers: Object.freeze([...row.identityOnlyTiers]),
  }));

  return {
    referentLevels: () => Object.freeze([...raw.referentLevels]),
    identityLevels: () => Object.freeze([...raw.identityLevels]),
    demandedLevelValues: () => Object.freeze([...raw.demandedLevelValues]),
    spineTiers: () => Object.freeze([...raw.spineTiers]),
    remoteTiers: () => Object.freeze([...raw.remoteTiers]),
    custodyNeverTiers: () => Object.freeze([...raw.custodyNeverTiers]),
    identityRole: () => raw.identityRole,
    catalogScopeReason: () => raw.catalogScopeReason,
    bindIncompleteReason: () => raw.bindIncompleteReason,
    undeclaredLevelSpelling: () => raw.undeclaredLevelSpelling,
    levelSpellings: () => Object.freeze(raw.levelSpellings.map((r) => ({
      canonical: r.canonical,
      layerSpellings: Object.freeze([...r.layerSpellings]),
    }))),
    campaignModes: () => Object.freeze([...raw.campaignModes]),
    defaultCampaignMode: () => raw.defaultCampaignMode,
    verdictClasses: () => Object.freeze([...raw.verdictClasses]),
    catalogShape: () => Object.freeze([...catalog]),
    tierLegality: () => Object.freeze([...tierRows]),
    policies: () => Object.freeze(raw.policies.map((p) => {
      // FIX-RUN 1 D2 (adversarial review l2t2050): the role tag is
      // SINGLE-SOURCED — identityRole is the one declaration of the value and
      // identityRolePolicies names (by id, lint E11-pinned) the policies whose
      // verdict carries it. The shipped data declares NO per-policy role
      // literal (never two local terms for one value). A per-policy `role`
      // override stays legal for fixture experiments but the shipped triplet
      // uses none.
      const role = p.role ?? (raw.identityRolePolicies.includes(p.id) ? raw.identityRole : undefined);
      return {
        id: p.id,
        verdict: p.verdict,
        ...(role !== undefined ? { role } : {}),
        ...(p.when !== undefined ? { when: p.when } : {}),
        ...(p.custodyGuard !== undefined ? { custodyGuard: p.custodyGuard } : {}),
        requires: p.requires,
        assert: p.assert,
      };
    })),
    identityRolePolicies: () => Object.freeze([...raw.identityRolePolicies]),
    tierLegalityRow: (demandedLevel: string, mode: string) =>
      tierRows.find((r) => r.demandedLevel === demandedLevel && r.mode === mode),
  };
}

/**
 * Engine-facing loader: an ABSENT triplet is a disclosed off-state (null — the
 * nounShape parity rule: absent file/section ⇒ no refusals, never a silent
 * default policy set). A PRESENT-but-malformed triplet throws naming the path
 * (malformed DATA is not an off-state).
 */
export function loadMaterialEligibilityIfPresent(
  options: LoadMaterialEligibilityOptions = {},
): MaterialEligibilityPolicy | null {
  const dataPath = options.path ?? defaultEligibilityDataPath();
  const dir = dirname(dataPath);
  const missing =
    !existsSync(dataPath)
    || !existsSync(join(dir, ELIGIBILITY_SCHEMA_FILE))
    || !existsSync(join(dir, ELIGIBILITY_LINT_FILE));
  if (missing) return null;
  return loadMaterialEligibility(options);
}

/**
 * Review-interaction call options (D2/D4 — the enrichment seam is the EXISTING
 * spine; the caller passes the tier-legality-filtered request). Generic data
 * read: a demanded level whose legal QUERY tiers are disjoint from the data's
 * remoteTiers gets the spine's existing `localOnly` opt (the declared remote
 * clamp); otherwise the option is OMITTED (absent-or-value,
 * exactOptionalPropertyTypes). Zero tier literals, zero level names in TS — the
 * disjointness is computed from the policy rows. AC-2's request-construction
 * half; the candidate-side half is the eligibility predicates.
 */
export function reviewInteractionCallOptions(
  policy: MaterialEligibilityPolicy,
  demandedLevel: string,
  mode?: string,
): { localOnly?: true } {
  const campaignMode = mode ?? policy.defaultCampaignMode();
  const row = policy.tierLegalityRow(demandedLevel, campaignMode);
  if (!row) return {};
  const remoteLegal = row.queryTiers.some((tier) => policy.remoteTiers().includes(tier));
  return remoteLegal ? {} : { localOnly: true };
}
