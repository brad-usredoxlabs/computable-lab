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

/** Three rows of equal length; literal coordinateMap arrays — the per-sequence
 *  mapping the compute must COPY, never recompute (MAFFT rows ship it from
 *  server/src/sequences/sequenceRuntime.ts). Column 4 is a gap in every row,
 *  column 5 carries an ambiguous base in one row. */
const rows = (): AlignmentRow[] => [
  { sequenceId: 'seq-1', revisionId: 'rev-1', aligned: 'ATGCGTGCATGC', coordinateMap: [1, 2, 3, 4, 5, null, 7, 8, 9, 10, 11, 12] },
  { sequenceId: 'seq-2', revisionId: 'rev-2', aligned: 'ATGCGTGATGAC', coordinateMap: [1, 2, 3, 4, 5, 6, null, 8, 9, 10, 11, 12] },
  { sequenceId: 'seq-3', revisionId: 'rev-3', aligned: 'ATGCGTGCGAGC', coordinateMap: [1, 2, 3, 4, null, 6, 7, 8, 9, 10, 11, 12] },
];

describe('computeConservationIntervals (declaration is the contract; no defaults anywhere)', () => {
  it('leg 1 — a complete declaration over three equal-length rows gives one interval; metricValue equals the hand-computed fraction and declarationVersion is copied', () => {
    const r = computeConservationIntervals(declaration(), rows(), { start: 1, end: 12 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.intervals).toHaveLength(1);
    const iv = r.intervals[0]!;
    // hand-computed (region 1..12, gap_policy.exclude_column, ambiguity.count_as_partial_match,
    // coverage.denominator.defined_bases): column 4 is gapped in all rows -> excluded;
    // column 5 is ambiguous in row 3 -> partial match (set intersect); the other 10 columns:
    // c1 A/A/A match, c2 T/T/T, c3 G/G/G, c5 G/G/G (partial counts), c6 -/-/G mismatch,
    // c7 C/C/C, c8 T/G/G mismatch, c9 A/A/C mismatch, c10 G/T/G mismatch, c11 C/G/G mismatch,
    // c12 C/C/C -> 6 weighted matches / 11 weighted denominator.
    expect(iv.metricValue).toBeCloseTo(6 / 11);
    expect(iv.declarationVersion).toBe('1.0.0');
    expect(iv.declarationId).toBe('CONSERV-DECL-1');
    expect(iv.regionStart).toBe(1);
    expect(iv.regionEnd).toBe(12);
    // the declared metric statement is recorded verbatim, not restated
    expect(iv.metricDenominator).toBe('non_gap_columns');
    expect(iv.uncertaintyMethod).toBe('jackknife resampling over sequences per column');
    // coverage: 11 counted (defined) columns / 12 region columns
    expect(iv.coverage).toBeCloseTo(11 / 12);
    expect(iv.uncertainty).toBeCloseTo(Math.sqrt((6 / 11) * (1 - 6 / 11) / 11));
  });

  it('leg 2 — an invalid declaration (metric.denominator deleted) refuses with the reader OWN diagnostics and NO intervals', () => {
    const doc = declaration();
    delete doc.metric.denominator;
    const r = computeConservationIntervals(doc, rows(), { start: 1, end: 12 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const d = r.diagnostics.find((x) => x.includes('/metric/denominator')) ?? '';
    expect(d, JSON.stringify(r.diagnostics)).toContain('conservation_declaration_invalid');
    expect(d).toContain('/metric/denominator');
  });

  it('leg 3 — the item mutation test: the SAME rows under gap_policy.treatment exclude_column vs count_as_mismatch give DIFFERENT metricValue AND coverage', () => {
    const base = declaration();
    const a = computeConservationIntervals({ ...base, gap_policy: { ...base.gap_policy, treatment: 'exclude_column' } }, rows(), { start: 1, end: 12 });
    const b = computeConservationIntervals({ ...base, gap_policy: { ...base.gap_policy, treatment: 'count_as_mismatch' } }, rows(), { start: 1, end: 12 });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    const [ia, ib] = [a.intervals[0]!, b.intervals[0]!];
    // exclude_column: 6/11 with coverage 11/12; count_as_mismatch: the all-gapped
    // column counts in the denominator with no matches -> 6/12 with coverage 12/12.
    expect(ia.metricValue).not.toEqual(ib.metricValue);
    expect(ia.coverage).not.toEqual(ib.coverage);
    expect(ia.metricValue).toBeCloseTo(6 / 11);
    expect(ib.metricValue).toBeCloseTo(6 / 12);
    expect(ib.coverage).toBeCloseTo(1);
  });

  it('leg 4 — mapping provenance: perSequence start/end are the first/last non-null coordinateMap values in the region (asserted against the fixture LITERAL arrays), strand/convention copied verbatim, source reported as alignment.coordinateMap', () => {
    const r = computeConservationIntervals(declaration(), rows(), { start: 1, end: 12 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const iv = r.intervals[0]!;
    // literal coordinateMap arrays from the fixture rows:
    // seq-1: [1,2,3,4,5,null,7..12] -> first 1, last 12
    // seq-2: [1..6,null,8..12] -> first 1, last 12
    // seq-3: [1,2,3,4,null,6..12] -> first 1, last 12
    expect(iv.perSequence).toEqual([
      { sequenceId: 'seq-1', revisionId: 'rev-1', start: 1, end: 12, strand: 'as_aligned', convention: 'one_based' },
      { sequenceId: 'seq-2', revisionId: 'rev-2', start: 1, end: 12, strand: 'as_aligned', convention: 'one_based' },
      { sequenceId: 'seq-3', revisionId: 'rev-3', start: 1, end: 12, strand: 'as_aligned', convention: 'one_based' },
    ]);
    // strand/convention verbatim from coordinate_mapping (a different declaration value must flow through)
    const alt = declaration({ coordinate_mapping: { source: 'alignment.coordinateMap', strand: 'reverse_complement', convention: 'zero_based' } });
    const r2 = computeConservationIntervals(alt, rows(), { start: 1, end: 12 });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.intervals[0]!.perSequence.every((ps) => ps.strand === 'reverse_complement' && ps.convention === 'zero_based')).toBe(true);
    // source is the alignment artifact field name, reported
    expect(iv.source).toBe('alignment.coordinateMap');
  });

  it('leg 5 — ambiguity: a column containing R is dropped under exclude_column and counted under count_as_partial_match; the two metricValues differ', () => {
    // column 5 of the rows is ambiguous in row 3 (G vs R); the other rows agree on G
    const base = declaration();
    const a = computeConservationIntervals({ ...base, ambiguity_policy: { ...base.ambiguity_policy, treatment: 'exclude_column' } }, rows(), { start: 1, end: 12 });
    const b = computeConservationIntervals({ ...base, ambiguity_policy: { ...base.ambiguity_policy, treatment: 'count_as_partial_match' } }, rows(), { start: 1, end: 12 });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    const [ia, ib] = [a.intervals[0]!, b.intervals[0]!];
    // exclude_column drops column 5 too: 10 region columns, col6 -/-/G mismatch, col4 gapped ->
    // denominator 9, matches c1,c2,c3,c7,c12 = 5 -> 5/9. Partial match keeps column 5 -> 6/11.
    expect(ia.metricValue).not.toEqual(ib.metricValue);
    expect(ia.metricValue).toBeCloseTo(5 / 9);
    expect(ib.metricValue).toBeCloseTo(6 / 11);
    expect(ia.coverage).toBeCloseTo(10 / 12);
    expect(ib.coverage).toBeCloseTo(11 / 12);
  });

  it('leg 6 — below threshold: with coverage.threshold 1 and a dropped column the metricValue is the STRING unresolved (never a number, never null); with the threshold satisfied it is a number', () => {
    const below = computeConservationIntervals({ ...declaration(), coverage: { threshold: 1, denominator: 'defined_bases', below_threshold: 'unresolved' } }, rows(), { start: 1, end: 12 });
    expect(below.ok).toBe(true);
    if (!below.ok) return;
    const ivBelow = below.intervals[0]!;
    expect(ivBelow.coverage).toBeCloseTo(11 / 12); // below the declared threshold
    expect(ivBelow.metricValue).toBe('unresolved');
    expect(typeof ivBelow.metricValue).toBe('string');
    // uncertainty is still reported alongside the unresolved metric
    expect(typeof ivBelow.uncertainty).toBe('number');
    const above = computeConservationIntervals({ ...declaration(), coverage: { threshold: 0.8, denominator: 'defined_bases', below_threshold: 'unresolved' } }, rows(), { start: 1, end: 12 });
    expect(above.ok).toBe(true);
    if (!above.ok) return;
    expect(typeof above.intervals[0]!.metricValue).toBe('number');
  });

  it('leg 7 — weighting.unique_taxa with a row missing taxonId refuses conservation_taxa_unresolved (no silent unweighted fallback)', () => {
    const r = computeConservationIntervals({ ...declaration(), metric: { id: 'conservation-fraction', unit: 'per_column', numerator: 'columns in which every aligned residue is the identical base', denominator: 'non_gap_columns', weighting: 'unique_taxa' } }, [
      { sequenceId: 'seq-1', revisionId: 'rev-1', aligned: 'ATGCGTGCATGC', coordinateMap: [1, 2, 3, 4, 5, null, 7, 8, 9, 10, 11, 12], taxonId: 'taxon-1' },
      { sequenceId: 'seq-2', revisionId: 'rev-2', aligned: 'ATGCGTGATGAC', coordinateMap: [1, 2, 3, 4, 5, 6, null, 8, 9, 10, 11, 12] },
      { sequenceId: 'seq-3', revisionId: 'rev-3', aligned: 'ATGCGTGCGAGC', coordinateMap: [1, 2, 3, 4, null, 6, 7, 8, 9, 10, 11, 12], taxonId: 'taxon-1' },
    ], { start: 1, end: 12 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.diagnostics[0]).toContain('conservation_taxa_unresolved');
    expect(r.diagnostics[0]).toContain('seq-2');
  });

  it('leg 8 — the returned interval validates against schema/sequence-analysis/conservation-interval.schema.yaml (house harness: Ajv2020 strict, repo-root-relative read)', () => {
    const r = computeConservationIntervals(declaration(), rows(), { start: 1, end: 12 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(validateInterval(r.intervals[0]), JSON.stringify(validateInterval.errors)).toBe(true);
  });
});
