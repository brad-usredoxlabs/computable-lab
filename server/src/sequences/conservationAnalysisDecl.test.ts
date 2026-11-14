// @vitest-environment node
/**
 * L2-JOURNEY-CONSERVATION-1 (unit condecl) — RED-first.
 *
 * A conservation-analysis DECLARATION is the data a later computation must be
 * read against: it states the human objective decision, the metric
 * denominator, the gap/ambiguity policies, the coverage threshold and the
 * coordinate convention. Ajv alone decides valid vs invalid (house harness:
 * one Ajv2020 strict instance, repo-root-relative read, deliberately no
 * try/catch around compile — a caught compile error would hide the one
 * failure this pin exists for). The eight validation legs pin that a
 * declaration omitting any load-bearing statement, or one that CLAIMS primer
 * suitability, does not validate. Fixtures live in this file only — no
 * shipped default policy under config/.
 */
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import { validateConservationAnalysisDeclaration } from './conservationAnalysisDecl.js';

// Repo-root-relative read (capabilityDescriptor.test.ts:17 idiom):
// fileURLToPath(new URL('.', import.meta.url)) is src/sequences/, so 3 up
// reaches the worktree root — not cwd, not the symlinked server/schema.
const SCHEMA_PATH = join(fileURLToPath(new URL('.', import.meta.url)), '../../../schema/sequence-analysis/conservation-analysis.schema.yaml');
const schema = parseYaml(await readFile(SCHEMA_PATH, 'utf8')) as Record<string, any>;
const ajv = new Ajv2020({ strict: true, allErrors: true });
const validate = ajv.compile(schema);

/** A COMPLETE declaration: every load-bearing statement present. */
const declaration = (): Record<string, any> => ({
  kind: 'conservation-analysis-declaration',
  id: 'CONSERV-DECL-1',
  version: '1.0.0',
  objective: { kind: 'broadly_conserved', decided_by: 'brad', decision_ref: 'journey step L2-JOURNEY-CONSERVATION-1 objective — an explicit human decision, recorded' },
  metric: {
    id: 'conservation-fraction',
    unit: 'per_column',
    numerator: 'columns in which every aligned residue is the identical base',
    denominator: 'non_gap_columns',
    weighting: 'sequence_count',
  },
  gap_policy: { treatment: 'exclude_column', denominator_effect: 'a column containing any gap leaves the denominator entirely' },
  ambiguity_policy: { treatment: 'count_as_partial_match', codes: ['R', 'Y', 'M', 'K', 'S', 'W', 'B', 'D', 'H', 'V'] },
  coverage: { threshold: 0.8, denominator: 'defined_bases', below_threshold: 'unresolved' },
  coordinate_mapping: { source: 'alignment.coordinateMap', strand: 'as_aligned', convention: 'one_based' },
  uncertainty: { method: 'jackknife resampling over sequences per column', reported_per_interval: true },
  primer_suitability: { claimed: false, note: 'a declared column set is never a primer recommendation; primer choice stays a human decision' },
});

/** A fresh copy with exactly ONE field deleted: each omission leg is a
 *  single-defect document (Mutation B — the fixture must fail for no other
 *  reason than the missing field). */
const omit = (doc: Record<string, any>, path: string[]): Record<string, any> => {
  let node: Record<string, any> = doc;
  for (const key of path.slice(0, -1)) node = node[key];
  delete node[path.at(-1)!];
  return doc;
};

describe('conservation-analysis declaration schema (Ajv is the sole authority)', () => {
  it('accepts a complete declaration', () => {
    expect(validate(declaration()), JSON.stringify(validate.errors)).toBe(true);
  });
  it('refuses a declaration that omits the objective (the human decision)', () => {
    expect(validate(omit(declaration(), ['objective']))).toBe(false);
  });
  it('refuses a declaration that omits metric.denominator', () => {
    expect(validate(omit(declaration(), ['metric', 'denominator']))).toBe(false);
  });
  it('refuses a declaration that omits gap_policy', () => {
    expect(validate(omit(declaration(), ['gap_policy']))).toBe(false);
  });
  it('refuses a declaration that omits ambiguity_policy', () => {
    expect(validate(omit(declaration(), ['ambiguity_policy']))).toBe(false);
  });
  it('refuses a declaration that omits coverage.threshold', () => {
    expect(validate(omit(declaration(), ['coverage', 'threshold']))).toBe(false);
  });
  it('refuses a declaration that omits coordinate_mapping.convention', () => {
    expect(validate(omit(declaration(), ['coordinate_mapping', 'convention']))).toBe(false);
  });
  it('refuses a declaration that claims primer suitability', () => {
    const doc = declaration();
    doc.primer_suitability.claimed = true;
    expect(validate(doc), JSON.stringify(validate.errors)).toBe(false);
  });
});

describe('validateConservationAnalysisDeclaration (named refusals, not a bare boolean)', () => {
  it('accepts the complete declaration', async () => {
    expect(await validateConservationAnalysisDeclaration(declaration())).toEqual({ ok: true });
  });
  it('refuses a missing gap_policy with the named rule and the instancePath (AC2)', async () => {
    const r = await validateConservationAnalysisDeclaration(omit(declaration(), ['gap_policy']));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const d = r.diagnostics.find((x) => x.includes('/gap_policy')) ?? '';
    expect(d, JSON.stringify(r.diagnostics)).toContain('conservation_declaration_invalid');
    expect(d).toContain('/gap_policy');
  });
  it('refuses a primer claim with its OWN named rule, distinguishable from a missing-field refusal', async () => {
    const doc = declaration();
    doc.primer_suitability.claimed = true;
    const r = await validateConservationAnalysisDeclaration(doc);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.diagnostics.join(' ')).toContain('conservation_declaration_claims_primer_suitability');
    expect(r.diagnostics.join(' ')).not.toContain('conservation_declaration_invalid');
  });
});
