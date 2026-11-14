// @vitest-environment node
/**
 * L2-JOURNEY-CONSERVATION-1 (unit concompute) — RED-first.
 *
 * computeConservationIntervals is the LATER COMPUTATION the conservation-analysis
 * declaration is the contract for: it reads the declared metric denominator,
 * gap/ambiguity policies, weighting, coverage threshold and coordinate convention
 * from the declaration (never a default), and reads each row's per-sequence
 * source mapping from the row's OWN shipped coordinateMap (never re-derived by
 * index arithmetic). Below the declared coverage threshold the metricValue is
 * the string 'unresolved' — never a number, never null.
 *
 * Fixtures are inline in this file ONLY: no files under config/, no shipped
 * example declaration. Leg 8 compiles the interval schema with the house
 * harness (one Ajv2020 strict instance, repo-root-relative read via
 * fileURLToPath(new URL('.', import.meta.url)) + '../../../schema/...' — never
 * cwd) and validates the returned interval against it.
 */
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import { computeConservationIntervals, type AlignmentRow } from './conservationCompute.js';

// Repo-root-relative read (capabilityDescriptor.test.ts / conservationAnalysisDecl.test.ts
// idiom): fileURLToPath(new URL('.', import.meta.url)) is src/sequences/, so 3 up
// reaches the worktree root — not cwd, not the symlinked server/schema.
const INTERVAL_SCHEMA_PATH = join(fileURLToPath(new URL('.', import.meta.url)), '../../../schema/sequence-analysis/conservation-interval.schema.yaml');
const intervalSchema = parseYaml(await readFile(INTERVAL_SCHEMA_PATH, 'utf8')) as Record<string, any>;
const intervalAjv = new Ajv2020({ strict: true, allErrors: true });
const validateInterval = intervalAjv.compile(intervalSchema);

/** A COMPLETE declaration: every load-bearing statement present (mirrors the
 *  declaration fixture in conservationAnalysisDecl.test.ts:40-55). The version
 *  and objective decision are the ones the mutation test of the item pins. */
const declaration = (overrides: Record<string, any> = {}): Record<string, any> => ({
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
  ...overrides,
});

/** Three rows of equal length, all gapped at column 1 (a leading gap, as
 *  MAFFT emits for the shorter sequences); literal coordinateMap arrays — the
 *  per-sequence mapping the compute must COPY, never recompute (MAFFT rows
 *  ship it from server/src/sequences/sequenceRuntime.ts:137, where a null
 *  entry is exactly a gap '-' in aligned). Because of the leading gap the
 *  first non-null coordinateMap value (1) sits at column 2 — copying the
 *  coordinateMap and index arithmetic over columns DIVERGE (1 vs 2), so
 *  leg 4's assertions distinguish the two mechanisms. */
const rows = (): AlignmentRow[] => [
  { sequenceId: 'seq-1', revisionId: 'rev-1', aligned: '-ATGCG-TGCATG', coordinateMap: [null, 1, 2, 3, 4, 5, null, 6, 7, 8, 9, 10, 11] },
  { sequenceId: 'seq-2', revisionId: 'rev-2', aligned: '-ATGCGG-GATGC', coordinateMap: [null, 1, 2, 3, 4, 5, 6, null, 7, 8, 9, 10, 11] },
  { sequenceId: 'seq-3', revisionId: 'rev-3', aligned: '-ATGCRGGGCGCT', coordinateMap: [null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
];

describe('computeConservationIntervals (declaration is the contract; no defaults anywhere)', () => {
  it('leg 1 — a complete declaration over three equal-length rows gives one interval; metricValue equals the hand-computed fraction and declarationVersion is copied', () => {
    const r = computeConservationIntervals(declaration(), rows(), { start: 1, end: 13 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.intervals).toHaveLength(1);
    const iv = r.intervals[0]!;
    // hand-computed (region 1..13, gap_policy.exclude_column, ambiguity.count_as_partial_match,
    // weighting.sequence_count, coverage.denominator.defined_bases): column 1 (all-gapped
    // leading gap), column 7 (gap in row 1) and column 8 (gap in row 2) are dropped by
    // the declared gap treatment; column 5 (R in row 3) stays and partial-matches.
    // The 10 counted columns (2-6, 9-13):
    // c2 A,A,A -> 3; c3 T,T,T -> 3; c4 G,G,G -> 3; c5 C,C,C -> 3; c6 G,G,R -> 3 (R intersects);
    // c9 G,G,G -> 3; c10 C,A,C -> 2 (modal C); c11 A,T,G -> 1 (modal A, first-row tie);
    // c12 T,G,C -> 1 (modal T, first-row tie); c13 G,C,T -> 1 (modal G, first-row tie)
    // -> 23 weighted matches / 30 weighted denominator.
    expect(iv.metricValue).toBeCloseTo(23 / 30);
    expect(iv.declarationVersion).toBe('1.0.0');
    expect(iv.declarationId).toBe('CONSERV-DECL-1');
    expect(iv.regionStart).toBe(1);
    expect(iv.regionEnd).toBe(13);
    // the declared metric statement is recorded verbatim, not restated
    expect(iv.metricDenominator).toBe('non_gap_columns');
    expect(iv.uncertaintyMethod).toBe('jackknife resampling over sequences per column');
    // coverage: 10 counted columns / 12 defined region columns (c2-c13 carry defined bases)
    expect(iv.coverage).toBeCloseTo(10 / 12);
    expect(iv.uncertainty).toBeCloseTo(Math.sqrt((23 / 30) * (1 - 23 / 30) / 30));
  });

  it('leg 2 — an invalid declaration (metric.denominator deleted) refuses with the reader OWN diagnostics and NO intervals', () => {
    const doc = declaration();
    delete doc.metric.denominator;
    const r = computeConservationIntervals(doc, rows(), { start: 1, end: 13 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const d = r.diagnostics.find((x) => x.includes('/metric/denominator')) ?? '';
    expect(d, JSON.stringify(r.diagnostics)).toContain('conservation_declaration_invalid');
    expect(d).toContain('/metric/denominator');
  });

  it('leg 3 — the item mutation test: the SAME rows under gap_policy.treatment exclude_column vs count_as_mismatch give DIFFERENT metricValue AND coverage', () => {
    const base = declaration();
    const a = computeConservationIntervals({ ...base, gap_policy: { ...base.gap_policy, treatment: 'exclude_column' } }, rows(), { start: 1, end: 13 });
    const b = computeConservationIntervals({ ...base, gap_policy: { ...base.gap_policy, treatment: 'count_as_mismatch' } }, rows(), { start: 1, end: 13 });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    const [ia, ib] = [a.intervals[0]!, b.intervals[0]!];
    // exclude_column: columns 1, 7 and 8 leave the numerator AND denominator
    // -> 23/30 with coverage 10/12. count_as_mismatch counts them in the
    // denominator (gapped rows never match): c1 0; c7 -,G,G -> modal G -> +2;
    // c8 T,-,G -> modal T (first-row tie) -> +1; c9 3; c10 2; c11 1; c12 1;
    // c13 1 -> 26/39 with coverage 13/12 clamped to 1 (counted/defined).
    expect(ia.metricValue).not.toEqual(ib.metricValue);
    expect(ia.coverage).not.toEqual(ib.coverage);
    expect(ia.metricValue).toBeCloseTo(23 / 30);
    expect(ib.metricValue).toBeCloseTo(26 / 39);
    expect(ia.coverage).toBeCloseTo(10 / 12);
    expect(ib.coverage).toBeCloseTo(1);
  });

  it('leg 4 — mapping provenance: perSequence start/end are the first/last non-null coordinateMap values in the region (asserted against the fixture LITERAL arrays), strand/convention copied verbatim, source reported as alignment.coordinateMap', () => {
    const r = computeConservationIntervals(declaration(), rows(), { start: 1, end: 13 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const iv = r.intervals[0]!;
    // literal coordinateMap arrays from the fixture rows (region 1..13):
    // seq-1: [null,1,2,3,4,5,null,6..11] -> first 1, last 11
    // seq-2: [null,1..6,null,7..11]      -> first 1, last 11
    // seq-3: [null,1..12]                -> first 1, last 12
    // A column-INDEX reading would report start 2 (the first column whose
    // entry is non-null) instead of the mapped coordinate 1.
    expect(iv.perSequence).toEqual([
      { sequenceId: 'seq-1', revisionId: 'rev-1', start: 1, end: 11, strand: 'as_aligned', convention: 'one_based' },
      { sequenceId: 'seq-2', revisionId: 'rev-2', start: 1, end: 11, strand: 'as_aligned', convention: 'one_based' },
      { sequenceId: 'seq-3', revisionId: 'rev-3', start: 1, end: 12, strand: 'as_aligned', convention: 'one_based' },
    ]);
    // strand/convention verbatim from coordinate_mapping (a different declaration value must flow through)
    const alt = declaration({ coordinate_mapping: { source: 'alignment.coordinateMap', strand: 'reverse_complement', convention: 'zero_based' } });
    const r2 = computeConservationIntervals(alt, rows(), { start: 1, end: 13 });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.intervals[0]!.perSequence.every((ps) => ps.strand === 'reverse_complement' && ps.convention === 'zero_based')).toBe(true);
    // source is the alignment artifact field name, reported
    expect(iv.source).toBe('alignment.coordinateMap');
  });

  it('leg 5 — ambiguity: a column containing R is dropped under exclude_column and counted under count_as_partial_match; the two metricValues differ', () => {
    // column 6 of the rows is ambiguous in row 3 (G vs R); the other rows agree on G
    const base = declaration();
    // threshold 0.5 (declared in this leg) keeps BOTH sides reported as
    // numbers — 9/12 = 0.75 and 10/12 = 0.8333 both satisfy it — so the leg
    // isolates the ambiguity treatment itself, not the coverage threshold.
    const thresholded = { ...base, coverage: { ...base.coverage, threshold: 0.5 } };
    const a = computeConservationIntervals({ ...thresholded, ambiguity_policy: { ...base.ambiguity_policy, treatment: 'exclude_column' } }, rows(), { start: 1, end: 13 });
    const b = computeConservationIntervals({ ...thresholded, ambiguity_policy: { ...base.ambiguity_policy, treatment: 'count_as_partial_match' } }, rows(), { start: 1, end: 13 });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    const [ia, ib] = [a.intervals[0]!, b.intervals[0]!];
    // exclude_column drops the ambiguous column 6 AND the gapped columns 1, 7, 8
    // (the gap policy applies too) -> 9 counted columns (2-5, 9-13) ->
    // 20/27 with coverage 9/12. count_as_partial_match keeps column 6 (R
    // intersects the modal G in all three rows) -> 23/30 with coverage 10/12.
    // The declared threshold 0.5 keeps both sides reported as numbers
    // (0.75 and 0.8333 both satisfy it) so the leg isolates the ambiguity
    // treatment itself, not the threshold.
    expect(ia.metricValue).not.toEqual(ib.metricValue);
    expect(ia.metricValue).toBeCloseTo(20 / 27);
    expect(ib.metricValue).toBeCloseTo(23 / 30);
    expect(ia.coverage).toBeCloseTo(9 / 12);
    expect(ib.coverage).toBeCloseTo(10 / 12);
  });

  it('leg 6 — below threshold: with coverage.threshold 1 and a region that has a dropped column the metricValue is the STRING unresolved (never a number, never null); with the threshold satisfied it is a number', () => {
    // gap_policy exclude_column drops columns 1, 7 and 8 -> coverage 10/12.
    // threshold 1: 10/12 < 1 -> below threshold; threshold 0.8: 10/12 >= 0.8
    // -> the number is reported.
    const below = computeConservationIntervals({ ...declaration(), coverage: { threshold: 1, denominator: 'defined_bases', below_threshold: 'unresolved' } }, rows(), { start: 1, end: 13 });
    expect(below.ok).toBe(true);
    if (!below.ok) return;
    const ivBelow = below.intervals[0]!;
    expect(ivBelow.coverage).toBeCloseTo(10 / 12); // below the declared threshold
    expect(ivBelow.metricValue).toBe('unresolved');
    expect(typeof ivBelow.metricValue).toBe('string');
    // uncertainty is still reported alongside the unresolved metric
    expect(typeof ivBelow.uncertainty).toBe('number');
    const above = computeConservationIntervals({ ...declaration(), coverage: { threshold: 0.8, denominator: 'defined_bases', below_threshold: 'unresolved' } }, rows(), { start: 1, end: 13 });
    expect(above.ok).toBe(true);
    if (!above.ok) return;
    expect(above.intervals[0]!.coverage).toBeCloseTo(10 / 12); // threshold satisfied
    expect(typeof above.intervals[0]!.metricValue).toBe('number');
    expect(above.intervals[0]!.metricValue).toBeCloseTo(23 / 30); // the hand-computed leg-1 value
  });

  it('leg 7 — weighting.unique_taxa with a row missing taxonId refuses conservation_taxa_unresolved (no silent unweighted fallback)', () => {
    const r = computeConservationIntervals({ ...declaration(), metric: { id: 'conservation-fraction', unit: 'per_column', numerator: 'columns in which every aligned residue is the identical base', denominator: 'non_gap_columns', weighting: 'unique_taxa' } }, [
      { sequenceId: 'seq-1', revisionId: 'rev-1', aligned: 'ATGCG-TGCATG', coordinateMap: [1, 2, 3, 4, 5, null, 7, 8, 9, 10, 11, 12], taxonId: 'taxon-1' },
      { sequenceId: 'seq-2', revisionId: 'rev-2', aligned: 'ATGCGG-GATGC', coordinateMap: [1, 2, 3, 4, 5, 6, null, 8, 9, 10, 11, 12] },
      { sequenceId: 'seq-3', revisionId: 'rev-3', aligned: 'ATGCG-GCGAGC', coordinateMap: [1, 2, 3, 4, 5, null, 7, 8, 9, 10, 11, 12], taxonId: 'taxon-1' },
    ], { start: 1, end: 12 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.diagnostics[0]).toContain('conservation_taxa_unresolved');
    expect(r.diagnostics[0]).toContain('seq-2');
  });

  it('leg 8 — the returned interval validates against schema/sequence-analysis/conservation-interval.schema.yaml (house harness: Ajv2020 strict, repo-root-relative read)', () => {
    const r = computeConservationIntervals(declaration(), rows(), { start: 1, end: 13 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(validateInterval(r.intervals[0]), JSON.stringify(validateInterval.errors)).toBe(true);
  });
});
