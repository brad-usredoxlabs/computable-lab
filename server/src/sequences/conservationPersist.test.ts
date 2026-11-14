/**
 * conpersist (L2-JOURNEY-CONSERVATION-1, unit u3persist) — the PURE
 * conservation-interval planner. The four pure legs (a)-(c2) assert that
 * alignmentRowsFromSnapshot + planConservationIntervals hold the artifact
 * snapshot as the only row authority (the per-sequence mapping is the row's
 * own shipped coordinateMap — read and copied, never re-derived); the four
 * schema legs (s1)-(s4) assert the record shape the planner's receipts ride
 * on: kind+id on the interval record and the save_conservation_intervals
 * action variant.
 *
 * The service-level legs (d, AC2a-AC2c, AC3a-AC3b, e — the SequenceService
 * operation on the real store) moved OUT of this file to unit u3wire (same
 * item, service-wiring split). They are preserved VERBATIM at commit
 * 6c975ffaf: git show 6c975ffaf:server/src/sequences/conservationPersist.test.ts
 */
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';
import { SEQUENCE_SCHEMA } from './sequenceRuntime.js';
import { computeConservationIntervals, type AlignmentRow } from './conservationCompute.js';
import { alignmentRowsFromSnapshot, planConservationIntervals } from './conservationPersist.js';

// Repo-root-relative (house idiom): src/sequences/ + three up = worktree root — not cwd.
const intervalSchema = parseYaml(await readFile(join(fileURLToPath(new URL('.', import.meta.url)), '../../../schema/sequence-analysis/conservation-interval.schema.yaml'), 'utf8')) as Record<string, any>;
const validateInterval = new Ajv2020({ strict: true, allErrors: true }).compile(intervalSchema);

// The sequence-action schema needs the house harness (SequenceService.test.ts
// idiom, minus the store): the existing variants $ref sibling schemas, so the
// full schema directory is loaded once and every entry registered by $id
// before the file compiles. createValidator() carries the house Ajv options
// (strict + allErrors + discriminator + strictRequired:false —
// AjvValidator.ts:27-32), which is what lets the file's `discriminator:`
// keyword and root-level required compile under strict mode.
const actionRegistry = createSchemaRegistry();
const actionLoaded = await loadAllSchemas({ basePath: fileURLToPath(new URL('../../../schema', import.meta.url)), recursive: true });
expect(actionLoaded.errors).toEqual([]);
actionRegistry.addSchemas(actionLoaded.entries);
const actionValidator = createValidator();
for (const id of actionRegistry.getTopologicalOrder()) { const e = actionRegistry.getById(id); if (e) actionValidator.addSchema(e.schema, id); }
const ACTION_SCHEMA = SEQUENCE_SCHEMA + 'sequence-action.schema.yaml';

/** A COMPLETE declaration (mirrors conservationCompute.test.ts:30-41). */
const declaration = (): Record<string, any> => ({
  kind: 'conservation-analysis-declaration', id: 'CONSERV-DECL-1', version: '1.0.0',
  objective: { kind: 'broadly_conserved', decided_by: 'brad', decision_ref: 'journey step L2-JOURNEY-CONSERVATION-1 objective — an explicit human decision, recorded' },
  metric: { id: 'conservation-fraction', unit: 'per_column', numerator: 'columns in which every aligned residue is the identical base', denominator: 'non_gap_columns', weighting: 'sequence_count' },
  gap_policy: { treatment: 'exclude_column', denominator_effect: 'a column containing any gap leaves the denominator entirely' },
  ambiguity_policy: { treatment: 'count_as_partial_match', codes: ['R', 'Y', 'M', 'K', 'S', 'W', 'B', 'D', 'H', 'V'] },
  coverage: { threshold: 0.8, denominator: 'defined_bases', below_threshold: 'unresolved' },
  coordinate_mapping: { source: 'alignment.coordinateMap', strand: 'as_aligned', convention: 'one_based' },
  uncertainty: { method: 'jackknife resampling over sequences per column', reported_per_interval: true },
  primer_suitability: { claimed: false, note: 'a declared column set is never a primer recommendation; primer choice stays a human decision' },
});
/** Three equal-length rows, all gapped at column 1; literal coordinateMap arrays
 *  — the mapping the persisted record must COPY (first/last non-null in the
 *  region: cols 1-5 -> start 1, end 4). */
const rows: AlignmentRow[] = [
  { sequenceId: 'seq-1', revisionId: 'rev-1', aligned: '-ATGCG-TGCATG', coordinateMap: [null, 1, 2, 3, 4, 5, null, 6, 7, 8, 9, 10, 11] },
  { sequenceId: 'seq-2', revisionId: 'rev-2', aligned: '-ATGCGG-GATGC', coordinateMap: [null, 1, 2, 3, 4, 5, 6, null, 7, 8, 9, 10, 11] },
  { sequenceId: 'seq-3', revisionId: 'rev-3', aligned: '-ATGCRGGGCGCT', coordinateMap: [null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
];

describe('alignmentRowsFromSnapshot / planConservationIntervals (pure; artifact snapshot is the only row authority)', () => {
  it('leg a — a dataKind:alignment inlineValue of shaped rows is accepted and returned as-is', () => {
    const r = alignmentRowsFromSnapshot({ dataKind: 'alignment', inlineValue: rows });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toMatchObject({ sequenceId: 'seq-1', aligned: '-ATGCG-TGCATG', coordinateMap: [null, 1, 2, 3, 4, 5, null, 6, 7, 8, 9, 10, 11] });
  });
  it('leg b — a non-alignment dataKind and a missing inlineValue are refused with the one named diagnostic stating the observed dataKind and inlineValue arrayness', () => {
    const table = alignmentRowsFromSnapshot({ dataKind: 'table', inlineValue: rows });
    expect(table.ok).toBe(false);
    if (table.ok) return;
    expect(table.diagnostics).toHaveLength(1);
    expect(table.diagnostics[0]).toContain('conservation_alignment_artifact_invalid');
    expect(table.diagnostics[0]).toContain('dataKind table');
    expect(table.diagnostics[0]).toContain('inlineValue is an array');
    const noValue = alignmentRowsFromSnapshot({ dataKind: 'alignment' });
    expect(noValue.ok).toBe(false);
    if (noValue.ok) return;
    expect(noValue.diagnostics[0]).toContain('conservation_alignment_artifact_invalid');
    expect(noValue.diagnostics[0]).toContain('dataKind alignment');
    expect(noValue.diagnostics[0]).toContain('inlineValue is not an array');
  });
  it('leg c — one payload per region, each naming the declaration id+version, distinct deterministic ids (same inputs mint the same id)', () => {
    const regions = [{ start: 1, end: 5 }, { start: 2, end: 4 }];
    const p = planConservationIntervals(declaration(), rows, regions);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.records).toHaveLength(2);
    for (const r of p.records) {
      expect(r.id).toMatch(/^CINT-[0-9a-f]{24}$/);
      expect(r.payload).toMatchObject({ kind: 'conservation-interval', id: r.id, declarationId: 'CONSERV-DECL-1', declarationVersion: '1.0.0' });
    }
    expect(p.records[0]!.id).not.toBe(p.records[1]!.id);
    const p2 = planConservationIntervals(declaration(), rows, regions);
    expect(p2.ok).toBe(true);
    if (p2.ok) expect(p2.records[0]!.id).toBe(p.records[0]!.id);
  });
  it('leg c2 — a declaration the reader refuses is refused verbatim (the reader own diagnostics joined, no generic message)', () => {
    const noGap: Record<string, any> = { ...declaration() };
    delete noGap.gap_policy;
    const bad = planConservationIntervals(noGap, rows, [{ start: 1, end: 5 }]);
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.diagnostics.join(' ')).toContain('conservation_declaration_invalid');
    expect(bad.diagnostics.join(' ')).toContain('/gap_policy');
  });
});

describe('schema legs — kind+id on the interval record; the save_conservation_intervals action variant (u3persist)', () => {
  /** The exact s3 body: the variant declares no rows member — the rows
   *  authority is the pinned artifact snapshot, never the request. */
  const s3Body: Record<string, any> = {
    operation: 'save_conservation_intervals', requestId: 'cons-1',
    declaration: { kind: 'conservation-analysis-declaration', id: 'CONSERV-DECL-1', version: '1.0.0' },
    alignmentRef: { kind: 'record', id: 'AOUT-CONS-1', type: 'analysis-output-artifact' },
    regions: [{ start: 1, end: 5 }],
  };
  const intervalPayload = (): Record<string, any> => {
    const computed = computeConservationIntervals(declaration(), rows, { start: 1, end: 5 });
    expect(computed.ok).toBe(true);
    if (!computed.ok) throw new Error('fixture declaration must compute');
    return computed.intervals[0]!;
  };

  it('s1 — an interval payload carrying kind + a CINT-<24hex> id validates against conservation-interval.schema.yaml (Ajv2020 strict)', () => {
    const payload: Record<string, any> = { ...intervalPayload(), kind: 'conservation-interval', id: 'CINT-0123456789abcdef01234567' };
    expect(validateInterval(payload), JSON.stringify(validateInterval.errors)).toBe(true);
  });
  it('s2 — without kind the payload STILL validates (kind is optional by design: kind is not in the schema required list, so the compute output, which carries no kind, must keep validating — the brief literal "kind deleted is INVALID" is unsatisfiable under that constraint), and an undeclared extra member is INVALID (additionalProperties: false — exactly the declared fields plus kind+id and nothing else)', () => {
    const noKind = { ...intervalPayload(), id: 'CINT-0123456789abcdef01234567' }; // no kind
    expect(validateInterval(noKind), JSON.stringify(validateInterval.errors)).toBe(true);
    const extra = { ...intervalPayload(), kind: 'conservation-interval', id: 'CINT-0123456789abcdef01234567', rows: [{ sequenceId: 'seq-1' }] };
    expect(validateInterval(extra), JSON.stringify(validateInterval.errors)).toBe(false);
  });
  it('s3 — the save_conservation_intervals action body validates against sequence-action.schema.yaml (house validator, full schema directory registered)', () => {
    expect(actionValidator.validate(s3Body, ACTION_SCHEMA).valid, JSON.stringify(actionValidator.validate(s3Body, ACTION_SCHEMA).errors)).toBe(true);
  });
  it('s4 — the s3 body with an extra rows member is INVALID (the variant must not accept rows)', () => {
    const withRows = { ...s3Body, rows: [{ sequenceId: 'seq-1', aligned: '-A', coordinateMap: [null, 1] }] };
    expect(actionValidator.validate(withRows, ACTION_SCHEMA).valid, JSON.stringify(actionValidator.validate(withRows, ACTION_SCHEMA).errors)).toBe(false);
  });
});
