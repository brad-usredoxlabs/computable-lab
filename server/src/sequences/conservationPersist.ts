/**
 * Pure conservation-interval planner (L2-JOURNEY-CONSERVATION-1, unit u3persist) —
 * the seam between (pinned artifact snapshot + validated declaration + selected
 * regions) and the interval RECORDS that persist the computation. It adds no
 * policy and no second authority:
 *
 *  - alignmentRowsFromSnapshot accepts ONLY a dataKind:alignment snapshot whose
 *    inlineValue is an array of shaped rows; anything else is one NAMED refusal
 *    stating the observed facts. The per-sequence source mapping is each row's
 *    OWN shipped coordinateMap — this function only READS and TYPE-CHECKS the
 *    structure (no arithmetic on the map, no re-derivation); the coordinateMap
 *    is copied later by computeConservationIntervals, which is the only mapping
 *    authority. Rows never ride the request: the artifact snapshot is the only
 *    row authority, and planConservationIntervals therefore takes no
 *    rows-from-request parameter.
 *  - planConservationIntervals calls the shipped computeConservationIntervals
 *    ONCE per region (declaration is the contract — read through the compute's
 *    own reader call, never re-validated here) and mints one record per region.
 *    On a refusal it returns the compute/reader diagnostics VERBATIM (joined,
 *    never a generic message). Record ids are deterministic content hashes —
 *    no clock, no randomness; the interval is SPREAD into the payload (never
 *    rebuilt), so every field is the compute's own.
 *
 * No store, no ctx, no route: persistence and the service wiring are unit
 * u3wire.
 */
import { contentHash } from '../revisions/RecordRevisionService.js';
import { computeConservationIntervals, type AlignmentRow } from './conservationCompute.js';

/** One NAMED refusal, derived from the observed facts (never a second copy of
 *  the schema's field list). */
function artifactDiagnostics(snapshot: unknown): string[] {
  const s = (typeof snapshot === 'object' && snapshot !== null ? snapshot : {} as Record<string, unknown>) as Record<string, unknown>;
  const dataKind = 'dataKind' in s ? (typeof s.dataKind === 'string' ? s.dataKind : `non-string(${typeof s.dataKind})`) : 'missing';
  const isArray = Array.isArray(s.inlineValue);
  return [`conservation_alignment_artifact_invalid: dataKind ${dataKind}, inlineValue ${isArray ? 'is an array' : 'is not an array'} — an alignment artifact's inlineValue must be an array of rows (sequenceId, aligned, coordinateMap)`];
}

/** The artifact snapshot is the ONLY row authority: rows are read from it,
 *  never from the request. */
export function alignmentRowsFromSnapshot(snapshot: unknown): { ok: true; rows: AlignmentRow[] } | { ok: false; diagnostics: string[] } {
  if (typeof snapshot !== 'object' || snapshot === null) {
    return { ok: false, diagnostics: artifactDiagnostics(snapshot) };
  }
  const s = snapshot as Record<string, unknown>;
  const isShaped = (entry: unknown): entry is AlignmentRow => {
    if (typeof entry !== 'object' || entry === null) return false;
    const e = entry as Record<string, unknown>;
    return typeof e.sequenceId === 'string' && e.sequenceId.length > 0
      && typeof e.aligned === 'string'
      && Array.isArray(e.coordinateMap)
      && e.coordinateMap.every((v) => typeof v === 'number' || v === null);
  };
  if (s.dataKind !== 'alignment' || !Array.isArray(s.inlineValue) || !s.inlineValue.every(isShaped)) {
    return { ok: false, diagnostics: artifactDiagnostics(snapshot) };
  }
  return { ok: true, rows: s.inlineValue as AlignmentRow[] };
}

/** One record per region: id = 'CINT-' + the first 24 hex chars of
 *  contentHash over the deterministic hash input { declarationId, version,
 *  rows, region } (rows = each row's { sequenceId, revisionId, aligned } — the
 *  row set's own provenance; the artifact REVISION is not known to a pure
 *  planner and is deliberately omitted from the hash input; coordinateMap is
 *  excluded: it is read-only mapping data copied by the compute, never an
 *  identity input; no clock or random source anywhere). payload =
 *  { kind: 'conservation-interval', id, ...interval } — the interval is
 *  SPREAD, never rebuilt: every policy field is the compute's own. */
export function planConservationIntervals(
  declaration: unknown,
  rows: AlignmentRow[],
  regions: { start: number; end: number }[],
): { ok: true; records: { id: string; payload: Record<string, unknown> }[] } | { ok: false; diagnostics: string[] } {
  const records: { id: string; payload: Record<string, unknown> }[] = [];
  for (const region of regions) {
    const result = computeConservationIntervals(declaration, rows, region);
    if (!result.ok) return { ok: false, diagnostics: result.diagnostics }; // the compute/reader's own, verbatim
    const interval = result.intervals[0]!;
    const id = `CINT-${contentHash({ declarationId: interval.declarationId, version: interval.declarationVersion, rows: rows.map((row) => ({ sequenceId: row.sequenceId, revisionId: row.revisionId, aligned: row.aligned })), region }).slice(0, 24)}`;
    records.push({ id, payload: { kind: 'conservation-interval', id, ...interval } });
  }
  return { ok: true, records };
}
