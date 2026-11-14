/**
 * Pure compute for the conservation-analysis CAPABILITY
 * (schema/sequence-analysis/conservation-interval.schema.yaml) — the COMPUTATION
 * half of L2-JOURNEY-CONSERVATION-1.
 *
 * A conservation-analysis DECLARATION
 * (schema/sequence-analysis/conservation-analysis.schema.yaml) is the contract a
 * later computation must be read against: the objective as a recorded human
 * decision, the metric denominator, the gap/ambiguity policies, the weighting,
 * the coverage threshold and the coordinate convention. This file is that later
 * computation and it RESTATES NOTHING the declaration already decided — there
 * is no default policy anywhere here, and an invalid declaration is refused
 * with the VALIDATING READER's own diagnostics (the single authority for
 * whether the contract is usable).
 *
 * The per-sequence alignment→source mapping is the shipped alignment artifact's
 * own field (coordinateMap, produced by server/src/sequences/sequenceRuntime.ts):
 * each interval's perSequence entries COPY the row's first/last non-null
 * coordinateMap values in the requested region — coordinates are never
 * re-derived by index arithmetic — and strand/convention are copied verbatim
 * from the declaration's coordinate_mapping.
 *
 * One interval per call, spanning the requested 1-based alignment region, with
 * coverage and uncertainty (not just a colour). Below the declared coverage
 * threshold the metricValue is the string 'unresolved' — never a number, never
 * null. No I/O, no clock, no randomness: the result is a pure function of
 * (declaration, rows, region).
 */
import { validateConservationAnalysisDeclaration } from './conservationAnalysisDecl.js';

export type AlignmentRow = {
  sequenceId: string;
  revisionId?: string;
  taxonId?: string;
  aligned: string;
  coordinateMap: (number | null)[];
};

export type ConservationIntervalPerSequence = {
  sequenceId: string;
  revisionId?: string;
  start: number | null;
  end: number | null;
  strand: string;
  convention: string;
};

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
  perSequence: ConservationIntervalPerSequence[];
};

export type ConservationComputeResult =
  | { ok: true; intervals: ConservationInterval[] }
  | { ok: false; diagnostics: string[] };

/** Canonical DNA IUPAC possibility sets — one entry per code. '-' and '.' are
 *  gaps (not in the table: a residue outside the table IS a gap). */
const IUPAC_DNA: Record<string, Set<string>> = {
  A: new Set(['A']),
  C: new Set(['C']),
  G: new Set(['G']),
  T: new Set(['T']),
  U: new Set(['T']),
  R: new Set(['A', 'G']),
  Y: new Set(['C', 'T']),
  M: new Set(['A', 'C']),
  K: new Set(['G', 'T']),
  S: new Set(['G', 'C']),
  W: new Set(['A', 'T']),
  B: new Set(['C', 'G', 'T']),
  D: new Set(['A', 'G', 'T']),
  H: new Set(['A', 'C', 'T']),
  V: new Set(['A', 'C', 'G']),
  N: new Set(['A', 'C', 'G', 'T']),
};

/** Possibility set for a row's residue in one column, or null when the residue
 *  is a gap ('-' or '.', or anything the canonical DNA table does not name). */
function residueSet(residue: string): Set<string> | null {
  const code = residue.toUpperCase();
  return IUPAC_DNA[code] ?? null;
}

function isAmbiguousCode(residue: string, codes: string[]): boolean {
  return codes.some((c) => c.toUpperCase() === residue.toUpperCase());
}

/** The column's modal residue possibility set under `weighting`: the most
 *  frequently occurring (first on a tie) among the defined rows present. */
function modalSet(defined: { set: Set<string>; weight: number }[], weight: 'none' | 'sequence_count' | 'unique_taxa'): Set<string> {
  const tally = new Map<Set<string>, number>();
  for (const entry of defined) {
    const w = weight === 'unique_taxa' ? entry.weight : 1;
    tally.set(entry.set, (tally.get(entry.set) ?? 0) + w);
  }
  let best: Set<string> | undefined;
  let bestWeight = -Infinity;
  for (const [set, w] of tally) {
    if (w > bestWeight) {
      best = set;
      bestWeight = w;
    }
  }
  return best!;
}

export function computeConservationIntervals(
  declaration: unknown,
  rows: AlignmentRow[],
  region: { start: number; end: number },
): ConservationComputeResult {
  // The validating reader is the single authority for whether the contract is
  // usable; its diagnostics pass through unchanged (nothing prefixed, nothing
  // dropped). The compute never invents a policy to fill a gap the declaration
  // left.
  const verdict = validateConservationAnalysisDeclaration(declaration);
  if (!verdict.ok) return { ok: false, diagnostics: verdict.diagnostics };

  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, diagnostics: ['conservation_alignment_inconsistent: 0 rows — an alignment artifact must carry at least one row'] };
  }
  const length = rows[0]!.aligned.length;
  if (rows.some((row) => row.aligned.length !== length)) {
    return { ok: false, diagnostics: [`conservation_alignment_inconsistent: rows differ in aligned.length (${length}) — the alignment artifact is inconsistent`] };
  }
  if (region.start < 1 || region.end > length || region.start > region.end) {
    return { ok: false, diagnostics: [`conservation_region_out_of_range: [${region.start}, ${region.end}] is outside the 1-based alignment coordinates of length ${length}`] };
  }

  // Read the declaration as the contract. The reader has proven every
  // load-bearing statement present and enum-conformant, so each access here is
  // on declared structure; the `as` marks the trust the reader earned — this
  // file adds no policy of its own.
  const decl = declaration as Record<string, any>;
  const { metric, gap_policy: gapPolicy, ambiguity_policy: ambiguityPolicy, coverage, coordinate_mapping: coordinateMapping, uncertainty } = decl;
  const weight: 'none' | 'sequence_count' | 'unique_taxa' = metric.weighting;
  const ambiguityCodes: string[] = ambiguityPolicy.codes ?? [];
  const threshold: number = coverage.threshold;

  // Weights: none / sequence_count = 1 per row; unique_taxa = 1 / (rows sharing
  // that taxonId) so each taxon contributes 1 in total. EVERY row must carry a
  // taxonId — a missing one is a named refusal, never a silent unweighted
  // fallback.
  const weights: number[] = rows.map(() => 1);
  if (weight === 'unique_taxa') {
    const unresolved = rows.filter((row) => typeof row.taxonId !== 'string' || row.taxonId.length === 0);
    if (unresolved.length > 0) {
      return {
        ok: false,
        diagnostics: [
          `conservation_taxa_unresolved: ${unresolved.map((row) => row.sequenceId).join(', ')} — weighting.unique_taxa requires a taxonId on every row; no unweighted fallback is taken`,
        ],
      };
    }
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.taxonId!, (counts.get(row.taxonId!) ?? 0) + 1);
    for (let i = 0; i < rows.length; i++) weights[i] = 1 / (counts.get(rows[i]!.taxonId!) ?? 1);
  }

  const regionColumns = region.end - region.start + 1;
  // definedColumns: region columns carrying at least one non-gap residue — the
  // coverage denominator for the declaration's defined_bases choice (a
  // pre-scan over the whole region, independent of policy drops).
  let definedColumns = 0;
  for (let col = region.start; col <= region.end; col++) {
    const i = col - 1;
    if (rows.some((row) => residueSet(row.aligned[i] ?? '') !== null)) definedColumns++;
  }

  let counted = 0;
  let matchedWeight = 0;
  let denominatorWeight = 0;

  for (let col = region.start; col <= region.end; col++) {
    const i = col - 1;
    const entries = rows.map((row, rowIndex) => ({
      set: residueSet(row.aligned[i] ?? ''),
      ambiguous: isAmbiguousCode(row.aligned[i] ?? '', ambiguityCodes),
      weight: weights[rowIndex]!,
    }));
    const hasGap = entries.some((entry) => entry.set === null);
    const hasAmbiguous = entries.some((entry) => entry.set !== null && entry.ambiguous);
    // The gap policy governs a gap in the column (its declared treatment:
    // exclude_column drops the column from numerator AND denominator;
    // count_as_mismatch counts it in the denominator and contributes no
    // matches). The ambiguity policy applies only to rows whose residue is in
    // the declared codes (exclude_column drops the column;
    // count_as_partial_match counts a match when the row's possibility set
    // intersects the modal possibility set).
    if (hasGap && gapPolicy.treatment === 'exclude_column') continue;
    if (!hasGap && hasAmbiguous && ambiguityPolicy.treatment === 'exclude_column') continue;
    // A counted column contributes its full weight to the denominator — under
    // count_as_mismatch that includes the gapped rows (counted, never
    // matching); matches come only from defined rows.
    for (const entry of entries) denominatorWeight += entry.weight;
    counted++;
    const defined: { set: Set<string>; weight: number }[] = [];
    for (const entry of entries) {
      if (entry.set !== null) defined.push({ set: entry.set, weight: entry.weight });
    }
    if (defined.length > 0) {
      const modal = modalSet(defined, weight);
      for (const entry of defined) {
        const matches = entry.set === modal || [...entry.set].some((base) => modal.has(base));
        if (matches) matchedWeight += entry.weight;
      }
    }
  }

  // coverage: counted columns / columns in the region, where the column
  // denominator follows the declaration (coverage.denominator: for
  // defined_bases the region's columns that carry at least one non-gap
  // residue). A counted column is one the declared policies left in place —
  // under count_as_mismatch an all-gapped column IS counted (its treatment),
  // so coverage can reach the full region; the clamp to [0, 1] keeps the
  // reported quantity a fraction.
  const coverageValue = Math.min(1, counted / (coverage.denominator === 'defined_bases' && definedColumns > 0 ? definedColumns : regionColumns));
  const belowThreshold = coverageValue < threshold;
  const metricValue: number | 'unresolved' = denominatorWeight === 0 || belowThreshold ? 'unresolved' : matchedWeight / denominatorWeight;
  // p (the fraction the metric reports) and n (the weighted denominator);
  // when the metric is unresolved the estimate is still reported (0 when there
  // is no denominator to estimate from).
  const p = denominatorWeight === 0 ? 0 : matchedWeight / denominatorWeight;
  const uncertaintyValue = denominatorWeight === 0 ? 0 : Math.sqrt((p * (1 - p)) / denominatorWeight);

  // perSequence: the row's OWN shipped coordinateMap, copied — first/last
  // non-null value within the region span, null when the row is entirely
  // gapped there. strand and convention are the declaration's coordinate_mapping.
  const perSequence: ConservationIntervalPerSequence[] = rows.map((row) => {
    let start: number | null = null;
    let end: number | null = null;
    for (let col = region.start; col <= region.end; col++) {
      const coordinate = row.coordinateMap[col - 1] ?? null;
      if (coordinate === null) continue;
      if (start === null) start = coordinate;
      end = coordinate;
    }
    return {
      sequenceId: row.sequenceId,
      ...(row.revisionId !== undefined ? { revisionId: row.revisionId } : {}),
      start,
      end,
      strand: coordinateMapping.strand,
      convention: coordinateMapping.convention,
    };
  });

  return {
    ok: true,
    intervals: [
      {
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
      },
    ],
  };
}
