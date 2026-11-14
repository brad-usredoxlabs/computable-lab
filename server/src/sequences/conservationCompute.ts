/**
 * Pure compute for the conservation-analysis capability
 * (schema/sequence-analysis/conservation-interval.schema.yaml) — the COMPUTATION
 * half of L2-JOURNEY-CONSERVATION-1. The validated DECLARATION
 * (validateConservationAnalysisDeclaration — the single authority for whether
 * the contract is usable) is the contract this later computation reads against:
 * every policy is READ from it (nothing here defaults a denominator, treatment,
 * weighting or threshold) and an invalid declaration is refused with the
 * reader's own diagnostics, unchanged. The per-sequence source mapping is the
 * alignment artifact's own coordinateMap (shipped by sequenceRuntime.ts),
 * COPIED per row — first/last non-null value in the region — never re-derived
 * by index arithmetic. One interval per call; below the declared coverage
 * threshold metricValue is the string 'unresolved' (never a number, never
 * null); coverage AND uncertainty ship. Pure function of (declaration, rows,
 * region): no I/O, clock or randomness.
 */
import { validateConservationAnalysisDeclaration } from './conservationAnalysisDecl.js';

export type AlignmentRow = { sequenceId: string; revisionId?: string; taxonId?: string; aligned: string; coordinateMap: (number | null)[] };

export type ConservationInterval = {
  declarationId: string;
  declarationVersion: string;
  regionStart: number;
  regionEnd: number;
  metricId: string;
  metricUnit: string;
  metricValue: number | 'unresolved';
  metricDenominator: string;
  metricWeighting: string;
  gapTreatment: string;
  ambiguityTreatment: string;
  coverage: number;
  coverageThreshold: number;
  uncertainty: number;
  uncertaintyMethod: string;
  source: string;
  perSequence: Array<{ sequenceId: string; revisionId?: string; start: number | null; end: number | null; strand: string; convention: string }>;
};

// Canonical DNA IUPAC possibility sets — one entry per code; '-' and '.' (and
// anything the table does not name) are gaps.
const IUPAC_DNA: Record<string, Set<string>> = {
  A: new Set(['A']), C: new Set(['C']), G: new Set(['G']), T: new Set(['T']), U: new Set(['T']),
  R: new Set(['A', 'G']), Y: new Set(['C', 'T']), M: new Set(['A', 'C']), K: new Set(['G', 'T']),
  S: new Set(['G', 'C']), W: new Set(['A', 'T']), B: new Set(['C', 'G', 'T']), D: new Set(['A', 'G', 'T']),
  H: new Set(['A', 'C', 'T']), V: new Set(['A', 'C', 'G']), N: new Set(['A', 'C', 'G', 'T']),
};
const residueSet = (r: string): Set<string> | null => IUPAC_DNA[r.toUpperCase()] ?? null;

export function computeConservationIntervals(
  declaration: unknown,
  rows: AlignmentRow[],
  region: { start: number; end: number },
): { ok: true; intervals: ConservationInterval[] } | { ok: false; diagnostics: string[] } {
  const verdict = validateConservationAnalysisDeclaration(declaration);
  if (!verdict.ok) return { ok: false, diagnostics: verdict.diagnostics }; // the reader's own, unchanged
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, diagnostics: ['conservation_alignment_inconsistent: 0 rows — an alignment artifact must carry at least one row'] };
  }
  const length = rows[0]!.aligned.length;
  if (rows.some((row) => row.aligned.length !== length)) {
    return { ok: false, diagnostics: [`conservation_alignment_inconsistent: rows differ in aligned.length (${length})`] };
  }
  if (region.start < 1 || region.end > length || region.start > region.end) {
    return { ok: false, diagnostics: [`conservation_region_out_of_range: [${region.start}, ${region.end}] is outside the 1-based alignment coordinates of length ${length}`] };
  }
  // The reader proved every load-bearing statement present and enum-conformant;
  // each access below is on declared structure — this file adds no policy.
  const decl = declaration as Record<string, any>;
  const { metric, gap_policy: gapPolicy, ambiguity_policy: ambiguityPolicy, coverage, coordinate_mapping: coordinateMapping, uncertainty } = decl;
  const weight = metric.weighting;
  const ambiguityCodes: string[] = ambiguityPolicy.codes ?? [];
  const threshold: number = coverage.threshold;

  // Weights: none / sequence_count = 1 per row; unique_taxa = 1 / (rows sharing
  // that taxonId) so each taxon contributes 1 in total. EVERY row must carry a
  // taxonId — a named refusal, never a silent unweighted fallback.
  const weights: number[] = rows.map(() => 1);
  if (weight === 'unique_taxa') {
    const unresolved = rows.filter((row) => typeof row.taxonId !== 'string' || row.taxonId.length === 0);
    if (unresolved.length > 0) {
      return { ok: false, diagnostics: [`conservation_taxa_unresolved: ${unresolved.map((row) => row.sequenceId).join(', ')} — weighting.unique_taxa requires a taxonId on every row; no unweighted fallback is taken`] };
    }
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.taxonId!, (counts.get(row.taxonId!) ?? 0) + 1);
    for (let i = 0; i < rows.length; i++) weights[i] = 1 / (counts.get(rows[i]!.taxonId!) ?? 1);
  }

  // definedColumns: region columns carrying ≥1 non-gap residue — the coverage
  // denominator for the declaration's defined_bases choice.
  let definedColumns = 0;
  for (let col = region.start; col <= region.end; col++) {
    if (rows.some((row) => residueSet(row.aligned[col - 1] ?? '') !== null)) definedColumns++;
  }
  const regionColumns = region.end - region.start + 1;

  // Modal possibility set under the declared weighting: most frequent (first on
  // a tie) among the defined rows.
  const modalSet = (defined: { set: Set<string>; weight: number }[]): Set<string> => {
    const tally = new Map<Set<string>, number>();
    for (const e of defined) tally.set(e.set, (tally.get(e.set) ?? 0) + (weight === 'unique_taxa' ? e.weight : 1));
    let best: Set<string> | undefined, bestWeight = -Infinity;
    for (const [set, w] of tally) if (w > bestWeight) (best = set), (bestWeight = w);
    return best!;
  };

  let counted = 0, matchedWeight = 0, denominatorWeight = 0;
  for (let col = region.start; col <= region.end; col++) {
    const i = col - 1;
    const entries = rows.map((row, rowIndex) => ({
      set: residueSet(row.aligned[i] ?? ''),
      ambiguous: ambiguityCodes.some((c) => c.toUpperCase() === (row.aligned[i] ?? '').toUpperCase()),
      weight: weights[rowIndex]!,
    }));
    const hasGap = entries.some((e) => e.set === null);
    const hasAmbiguous = entries.some((e) => e.set !== null && e.ambiguous);
    // gap policy: exclude_column drops the column from numerator AND
    // denominator; count_as_mismatch keeps it (counted, contributes no matches).
    // ambiguity policy (only rows whose residue is in the declared codes):
    // exclude_column drops the column; count_as_partial_match counts a match
    // when a row's possibility set intersects the modal possibility set.
    if (hasGap && gapPolicy.treatment === 'exclude_column') continue;
    if (!hasGap && hasAmbiguous && ambiguityPolicy.treatment === 'exclude_column') continue;
    for (const e of entries) denominatorWeight += e.weight; // a counted column's full weight
    counted++;
    const defined = entries.filter((e) => e.set !== null).map((e) => ({ set: e.set as Set<string>, weight: e.weight }));
    if (defined.length > 0) {
      const modal = modalSet(defined);
      for (const e of defined) if (e.set === modal || [...e.set].some((b) => modal.has(b))) matchedWeight += e.weight;
    }
  }

  // coverage: counted columns over the region's columns under the declared
  // coverage.denominator (defined_bases → the region's non-gap columns); the
  // clamp keeps the reported quantity a fraction.
  const coverageValue = Math.min(1, counted / (coverage.denominator === 'defined_bases' && definedColumns > 0 ? definedColumns : regionColumns));
  const belowThreshold = coverageValue < threshold;
  const metricValue: number | 'unresolved' = denominatorWeight === 0 || belowThreshold ? 'unresolved' : matchedWeight / denominatorWeight;
  // p (the reported fraction) and n (the weighted denominator); the estimate is
  // still reported when the metric is unresolved (0 with no denominator).
  const p = denominatorWeight === 0 ? 0 : matchedWeight / denominatorWeight;
  const uncertaintyValue = denominatorWeight === 0 ? 0 : Math.sqrt((p * (1 - p)) / denominatorWeight);

  // perSequence: the row's OWN shipped coordinateMap, copied — first/last
  // non-null value within the region span (null when entirely gapped there);
  // strand and convention are the declaration's coordinate_mapping.
  const perSequence = rows.map((row) => {
    let start: number | null = null, end: number | null = null;
    for (let col = region.start; col <= region.end; col++) {
      const coordinate = row.coordinateMap[col - 1] ?? null;
      if (coordinate === null) continue;
      if (start === null) start = coordinate;
      end = coordinate;
    }
    return { sequenceId: row.sequenceId, ...(row.revisionId !== undefined ? { revisionId: row.revisionId } : {}), start, end, strand: coordinateMapping.strand, convention: coordinateMapping.convention };
  });

  return {
    ok: true,
    intervals: [{
      declarationId: decl.id,
      declarationVersion: decl.version,
      regionStart: region.start,
      regionEnd: region.end,
      metricId: metric.id,
      metricUnit: metric.unit,
      metricValue,
      metricDenominator: metric.denominator,
      metricWeighting: metric.weighting,
      gapTreatment: gapPolicy.treatment,
      ambiguityTreatment: ambiguityPolicy.treatment,
      coverage: coverageValue,
      coverageThreshold: threshold,
      uncertainty: uncertaintyValue,
      uncertaintyMethod: uncertainty.method,
      source: coordinateMapping.source,
      perSequence,
    }],
  };
}
