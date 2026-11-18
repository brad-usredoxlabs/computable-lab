// @vitest-environment node
/**
 * L2-JOURNEY-CONSERVATION-1 (unit concompute) — RED-first.
 *
 * computeConservationIntervals is the LATER COMPUTATION the conservation-
 * analysis declaration is the contract for: every policy is read from the
 * declaration (never a default), and each row's per-sequence mapping is
 * COPIED from the row's own shipped coordinateMap (never re-derived by index
 * arithmetic). Fixtures are inline ONLY — no config/ files, no shipped example
 * declaration. Leg 8 compiles the interval schema with the house harness (one
 * Ajv2020 strict instance, repo-root-relative read via
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

// Repo-root-relative (house idiom): src/sequences/ + three up = worktree root — not cwd.
const intervalSchema = parseYaml(await readFile(join(fileURLToPath(new URL('.', import.meta.url)), '../../../schema/sequence-analysis/conservation-interval.schema.yaml'), 'utf8')) as Record<string, any>;
const validateInterval = new Ajv2020({ strict: true, allErrors: true }).compile(intervalSchema);
const ok = (r: ReturnType<typeof computeConservationIntervals>) => { expect(r.ok).toBe(true); return r as { ok: true; intervals: any[] }; };
const refused = (r: ReturnType<typeof computeConservationIntervals>) => { expect(r.ok).toBe(false); return r as { ok: false; diagnostics: string[] }; };

/** A COMPLETE declaration (mirrors conservationAnalysisDecl.test.ts:40-55). */
const declaration = (overrides: Record<string, any> = {}): Record<string, any> => ({
  kind: 'conservation-analysis-declaration', id: 'CONSERV-DECL-1', version: '1.0.0',
  objective: { kind: 'broadly_conserved', decided_by: 'brad', decision_ref: 'journey step L2-JOURNEY-CONSERVATION-1 objective — an explicit human decision, recorded' },
  metric: { id: 'conservation-fraction', unit: 'per_column', numerator: 'columns in which every aligned residue is the identical base', denominator: 'non_gap_columns', weighting: 'sequence_count' },
  gap_policy: { treatment: 'exclude_column', denominator_effect: 'a column containing any gap leaves the denominator entirely' },
  ambiguity_policy: { treatment: 'count_as_partial_match', codes: ['R', 'Y', 'M', 'K', 'S', 'W', 'B', 'D', 'H', 'V'] },
  coverage: { threshold: 0.8, denominator: 'defined_bases', below_threshold: 'unresolved' },
  coordinate_mapping: { source: 'alignment.coordinateMap', strand: 'as_aligned', convention: 'one_based' },
  uncertainty: { method: 'jackknife resampling over sequences per column', reported_per_interval: true },
  primer_suitability: { claimed: false, note: 'a declared column set is never a primer recommendation; primer choice stays a human decision' },
  ...overrides,
});

/** Three equal-length rows, all gapped at column 1 (a leading gap, as MAFFT
 *  emits); literal coordinateMap arrays — the mapping the compute must COPY
 *  (shipped by sequenceRuntime.ts:137, where a null entry is exactly the gap
 *  '-' in aligned). The leading gap puts the first non-null coordinateMap
 *  value (1) at column 2, so copying the coordinateMap and index arithmetic
 *  over columns DIVERGE (1 vs 2) and leg 4 pins the former. */
const rows = (): AlignmentRow[] => [
  { sequenceId: 'seq-1', revisionId: 'rev-1', aligned: '-ATGCG-TGCATG', coordinateMap: [null, 1, 2, 3, 4, 5, null, 6, 7, 8, 9, 10, 11] },
  { sequenceId: 'seq-2', revisionId: 'rev-2', aligned: '-ATGCGG-GATGC', coordinateMap: [null, 1, 2, 3, 4, 5, 6, null, 7, 8, 9, 10, 11] },
  { sequenceId: 'seq-3', revisionId: 'rev-3', aligned: '-ATGCRGGGCGCT', coordinateMap: [null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
];

describe('computeConservationIntervals (declaration is the contract; no defaults anywhere)', () => {
  it('leg 1 — a complete declaration over three equal-length rows gives one interval; metricValue equals the hand-computed fraction and declarationVersion is copied', () => {
    const r = ok(computeConservationIntervals(declaration(), rows(), { start: 1, end: 13 }));
    expect(r.intervals).toHaveLength(1);
    const iv = r.intervals[0]!;
    // hand-computed (1..13, exclude_column, count_as_partial_match,
    // sequence_count, defined_bases): c1/c7/c8 (gaps) dropped, c6 R
    // partial-matches -> 23 matches / 30 weighted columns; coverage 10/12
    // defined.
    expect(iv.metricValue).toBeCloseTo(23 / 30);
    expect(iv.declarationVersion).toBe('1.0.0');
    expect(iv.declarationId).toBe('CONSERV-DECL-1');
    expect(iv.regionStart).toBe(1);
    expect(iv.regionEnd).toBe(13);
    expect(iv.metricDenominator).toBe('non_gap_columns');
    expect(iv.uncertaintyMethod).toBe('jackknife resampling over sequences per column');
    expect(iv.coverage).toBeCloseTo(10 / 12);
    expect(iv.uncertainty).toBeCloseTo(Math.sqrt((23 / 30) * (1 - 23 / 30) / 30));
  });

  it('leg 2 — an INVALID declaration (metric.denominator deleted) refuses with the reader OWN diagnostics and NO intervals', () => {
    const doc = declaration();
    delete doc.metric.denominator;
    const r = refused(computeConservationIntervals(doc, rows(), { start: 1, end: 13 }));
    // the compute never invents a policy to fill the gap: the reader's own
    // diagnostics pass through unchanged
    const d = r.diagnostics.find((x) => x.includes('/metric/denominator')) ?? '';
    expect(d, JSON.stringify(r.diagnostics)).toContain('conservation_declaration_invalid');
    expect(d).toContain('/metric/denominator');
  });

  it('leg 3 — the item mutation test: the SAME rows under gap_policy.treatment exclude_column vs count_as_mismatch give DIFFERENT metricValue AND coverage', () => {
    const a = ok(computeConservationIntervals({ ...declaration(), gap_policy: { treatment: 'exclude_column', denominator_effect: 'a column containing any gap leaves the denominator entirely' } }, rows(), { start: 1, end: 13 }));
    const b = ok(computeConservationIntervals({ ...declaration(), gap_policy: { treatment: 'count_as_mismatch', denominator_effect: 'a gapped column stays in the denominator and contributes no matches' } }, rows(), { start: 1, end: 13 }));
    const [ia, ib] = [a.intervals[0]!, b.intervals[0]!];
    // exclude_column: c1/c7/c8 leave numerator AND denominator -> 23/30 with
    // coverage 10/12. count_as_mismatch counts them in the denominator (gapped
    // rows never match: c7 -,G,G modal G +2; c8 T,-,G modal T first-row tie
    // +1) -> 26/39 with coverage 13/12 clamped to 1.
    expect(ia.metricValue).not.toEqual(ib.metricValue);
    expect(ia.coverage).not.toEqual(ib.coverage);
    expect(ia.metricValue).toBeCloseTo(23 / 30);
    expect(ib.metricValue).toBeCloseTo(26 / 39);
    expect(ia.coverage).toBeCloseTo(10 / 12);
    expect(ib.coverage).toBeCloseTo(1);
  });

  it('leg 4 — mapping provenance: perSequence start/end equal the first/last non-null coordinateMap values of that ROW in the region (asserted against the fixture LITERAL arrays), strand/convention copied verbatim, source reported as alignment.coordinateMap', () => {
    const iv = ok(computeConservationIntervals(declaration(), rows(), { start: 1, end: 13 })).intervals[0]!;
    // literal fixture coordinateMaps, region 1..13: seq-1 1..11, seq-2 1..11,
    // seq-3 1..12. A column-INDEX reading would report start 2 (the first
    // column whose entry is non-null) instead of the mapped coordinate 1.
    expect(iv.perSequence).toEqual([
      { sequenceId: 'seq-1', revisionId: 'rev-1', start: 1, end: 11, strand: 'as_aligned', convention: 'one_based' },
      { sequenceId: 'seq-2', revisionId: 'rev-2', start: 1, end: 11, strand: 'as_aligned', convention: 'one_based' },
      { sequenceId: 'seq-3', revisionId: 'rev-3', start: 1, end: 12, strand: 'as_aligned', convention: 'one_based' },
    ]);
    // a different coordinate_mapping value must flow through verbatim
    const r2 = ok(computeConservationIntervals(declaration({ coordinate_mapping: { source: 'alignment.coordinateMap', strand: 'reverse_complement', convention: 'zero_based' } }), rows(), { start: 1, end: 13 }));
    expect(r2.intervals[0]!.perSequence.every((ps) => ps.strand === 'reverse_complement' && ps.convention === 'zero_based')).toBe(true);
    expect(iv.source).toBe('alignment.coordinateMap');
  });

  it('leg 5 — ambiguity: a column containing R is dropped under exclude_column and counted under count_as_partial_match; the two metricValues differ', () => {
    // c6 is ambiguous in row 3 (G vs R), the other rows agree on G; this leg's
    // declared threshold 0.5 keeps BOTH sides reported as numbers (9/12 and
    // 10/12 both satisfy it), isolating the ambiguity treatment itself.
    const base = declaration();
    const a = ok(computeConservationIntervals({ ...base, coverage: { ...base.coverage, threshold: 0.5 }, ambiguity_policy: { ...base.ambiguity_policy, treatment: 'exclude_column' } }, rows(), { start: 1, end: 13 }));
    const b = ok(computeConservationIntervals({ ...base, coverage: { ...base.coverage, threshold: 0.5 }, ambiguity_policy: { ...base.ambiguity_policy, treatment: 'count_as_partial_match' } }, rows(), { start: 1, end: 13 }));
    const [ia, ib] = [a.intervals[0]!, b.intervals[0]!];
    // exclude_column drops the ambiguous c6 AND the gapped c1/c7/c8 (the gap
    // policy applies too) -> 9 counted (2-5, 9-13) -> 20/27, coverage 9/12;
    // count_as_partial_match keeps c6 (R intersects the modal G) -> 23/30,
    // coverage 10/12.
    expect(ia.metricValue).not.toEqual(ib.metricValue);
    expect(ia.metricValue).toBeCloseTo(20 / 27);
    expect(ib.metricValue).toBeCloseTo(23 / 30);
    expect(ia.coverage).toBeCloseTo(9 / 12);
    expect(ib.coverage).toBeCloseTo(10 / 12);
  });

  it('leg 6 — below threshold: with coverage.threshold 1 and a region that has a dropped column the metricValue is the STRING unresolved (never a number, never null); with the threshold satisfied it is a number', () => {
    // exclude_column drops c1/c7/c8 -> coverage 10/12; threshold 1 below,
    // threshold 0.8 satisfied.
    const ivBelow = ok(computeConservationIntervals({ ...declaration(), coverage: { threshold: 1, denominator: 'defined_bases', below_threshold: 'unresolved' } }, rows(), { start: 1, end: 13 })).intervals[0]!;
    expect(ivBelow.coverage).toBeCloseTo(10 / 12); // below the declared threshold
    expect(ivBelow.metricValue).toBe('unresolved');
    expect(typeof ivBelow.metricValue).toBe('string');
    expect(typeof ivBelow.uncertainty).toBe('number'); // uncertainty reported alongside
    const ivAbove = ok(computeConservationIntervals({ ...declaration(), coverage: { threshold: 0.8, denominator: 'defined_bases', below_threshold: 'unresolved' } }, rows(), { start: 1, end: 13 })).intervals[0]!;
    expect(ivAbove.coverage).toBeCloseTo(10 / 12);
    expect(ivAbove.metricValue).toBeCloseTo(23 / 30);
    expect(typeof ivAbove.metricValue).toBe('number');
  });

  it('leg 7 — weighting.unique_taxa with a row missing taxonId refuses conservation_taxa_unresolved (never a silent unweighted fallback)', () => {
    const r = refused(computeConservationIntervals({ ...declaration(), metric: { id: 'conservation-fraction', unit: 'per_column', numerator: 'columns in which every aligned residue is the identical base', denominator: 'non_gap_columns', weighting: 'unique_taxa' } }, [
      { sequenceId: 'seq-1', revisionId: 'rev-1', aligned: 'ATGCG-TGCATG', coordinateMap: [1, 2, 3, 4, 5, null, 7, 8, 9, 10, 11, 12], taxonId: 'taxon-1' },
      { sequenceId: 'seq-2', revisionId: 'rev-2', aligned: 'ATGCGG-GATGC', coordinateMap: [1, 2, 3, 4, 5, 6, null, 8, 9, 10, 11, 12] },
      { sequenceId: 'seq-3', revisionId: 'rev-3', aligned: 'ATGCG-GCGAGC', coordinateMap: [1, 2, 3, 4, 5, null, 7, 8, 9, 10, 11, 12], taxonId: 'taxon-1' },
    ], { start: 1, end: 12 }));
    expect(r.diagnostics[0]).toContain('conservation_taxa_unresolved');
    expect(r.diagnostics[0]).toContain('seq-2');
  });

  it('leg 8 — the returned interval validates against schema/sequence-analysis/conservation-interval.schema.yaml (house harness: Ajv2020 strict, repo-root-relative read)', () => {
    const iv = ok(computeConservationIntervals(declaration(), rows(), { start: 1, end: 13 })).intervals[0]!;
    expect(validateInterval(iv), JSON.stringify(validateInterval.errors)).toBe(true);
  });
});
