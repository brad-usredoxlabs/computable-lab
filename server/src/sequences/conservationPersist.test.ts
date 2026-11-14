/**
 * conpersist (L2-JOURNEY-CONSERVATION-1, unit 3 of 3) — persisting the computed
 * conservation intervals. RED-first suite: legs (a)-(d) must fail before the
 * product code exists. The service-level leg runs on the house harness
 * (SequenceService.test.ts:18-22 shape): the artifact is built directly through
 * the REAL store — the operation's rows and coordinates come ONLY from the
 * pinned artifact's own snapshot, never from the request body; the declaration
 * is validated ONLY through the compute's own reader call; the record id is
 * deterministic in (declaration id+version, pinned artifact revision, region).
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';
import { LintEngine } from '../lint/LintEngine.js';
import { createLocalRepoAdapter } from '../repo/LocalRepoAdapter.js';
import { createRecordStore } from '../store/RecordStoreImpl.js';
import type { AppContext } from '../server.js';
import { SequenceService } from './SequenceService.js';
import { SEQUENCE_SCHEMA } from './sequenceRuntime.js';
import { computeConservationIntervals, type AlignmentRow } from './conservationCompute.js';
import { alignmentRowsFromSnapshot, planConservationIntervals } from './conservationPersist.js';

// Repo-root-relative (house idiom): src/sequences/ + three up = worktree root — not cwd.
const intervalSchema = parseYaml(await readFile(join(fileURLToPath(new URL('.', import.meta.url)), '../../../schema/sequence-analysis/conservation-interval.schema.yaml'), 'utf8')) as Record<string, any>;
const validateInterval = new Ajv2020({ strict: true, allErrors: true }).compile(intervalSchema);

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
/** Same declaration, changed gap treatment and version — the mutation leg. */
const declB = (): Record<string, any> => ({ ...declaration(), version: '1.1.0', gap_policy: { treatment: 'count_as_mismatch', denominator_effect: 'a column containing any gap stays in the denominator and counts as a mismatch' } });
/** Three equal-length rows, all gapped at column 1; literal coordinateMap arrays
 *  — the mapping the persisted record must COPY (first/last non-null in the
 *  region: cols 1-5 -> start 1, end 4). */
const rows: AlignmentRow[] = [
  { sequenceId: 'seq-1', revisionId: 'rev-1', aligned: '-ATGCG-TGCATG', coordinateMap: [null, 1, 2, 3, 4, 5, null, 6, 7, 8, 9, 10, 11] },
  { sequenceId: 'seq-2', revisionId: 'rev-2', aligned: '-ATGCGG-GATGC', coordinateMap: [null, 1, 2, 3, 4, 5, 6, null, 7, 8, 9, 10, 11] },
  { sequenceId: 'seq-3', revisionId: 'rev-3', aligned: '-ATGCRGGGCGCT', coordinateMap: [null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
];
const base = 'https://computable-lab.com/schema/computable-lab/';
const ref = (id: string, type: string) => ({ kind: 'record', id, type });
const opRequest = (requestId: string, declaration_: Record<string, any>, artifactId = 'AOUT-CONS-1') => ({
  operation: 'save_conservation_intervals', requestId, declaration: declaration_, alignmentRef: ref(artifactId, 'analysis-output-artifact'), regions: [{ start: 1, end: 5 }],
});

let ctx: AppContext; let root: string; let service: SequenceService;
let saved: { ids: string[]; payload: Record<string, any> };
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'cl-conpersist-'));
  const registry = createSchemaRegistry();
  const loaded = await loadAllSchemas({ basePath: fileURLToPath(new URL('../../../schema', import.meta.url)), recursive: true });
  expect(loaded.errors).toEqual([]);
  registry.addSchemas(loaded.entries);
  const validator = createValidator();
  for (const id of registry.getTopologicalOrder()) { const e = registry.getById(id); if (e) validator.addSchema(e.schema, id); }
  const store = createRecordStore(createLocalRepoAdapter({ basePath: root }), validator, new LintEngine());
  ctx = { store, validator, schemaRegistry: registry, workspaceRoot: root, recordsDir: root } as AppContext;
  service = new SequenceService(ctx, 'USR-test');
}, 30000);
afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

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

describe('save_conservation_intervals — SequenceService operation on the real store and schemas', () => {
  it('leg d — pins the alignment artifact, computes once per region, and persists one record per region naming the declaration and the pinned revision', async () => {
    await service.save({ kind: 'analysis-run', id: 'ANR-CONS', title: 'alignment run', revisionRef: ref('ANREV-CONS', 'analysis-revision'), status: 'succeeded' }, base + 'analysis-run.schema.yaml');
    await service.save({ kind: 'analysis-output-artifact', id: 'AOUT-CONS-1', title: 'alignment', name: 'alignment', runRef: ref('ANR-CONS', 'analysis-run'), dataKind: 'alignment', inlineValue: rows }, base + 'analysis-output-artifact.schema.yaml');
    const before = (await ctx.store.list({ kind: 'conservation-interval' })).length;
    const res = (await service.apply(opRequest('cons-1', declaration()))) as { recordIds: string[] };
    expect(res.recordIds).toHaveLength(1);
    const payload = ((await ctx.store.get(res.recordIds[0]!))?.payload ?? {}) as Record<string, any>;
    saved = { ids: res.recordIds, payload };
    expect(payload).toMatchObject({ kind: 'conservation-interval', id: res.recordIds[0], declarationId: 'CONSERV-DECL-1', declarationVersion: '1.0.0', metricUnit: 'per_column', source: 'alignment.coordinateMap' });
    expect(typeof payload.metricValue).toBe('number');
    expect(payload.coverage).toBeGreaterThanOrEqual(0);
    // perSequence start/end = the artifact's OWN coordinateMap first/last non-null within columns 1-5 (copied, never recomputed)
    expect(payload.perSequence[0]).toMatchObject({ sequenceId: 'seq-1', start: 1, end: 4 });
    expect(payload.perSequence[2]).toMatchObject({ sequenceId: 'seq-3', start: 1, end: 4 });
    // the persisted number equals a direct computeConservationIntervals call on the same rows/region
    const direct = computeConservationIntervals(declaration(), rows, { start: 1, end: 5 });
    expect(direct.ok).toBe(true);
    if (direct.ok) expect(payload.metricValue).toBe(direct.intervals[0]!.metricValue);
    expect((await ctx.store.list({ kind: 'conservation-interval' })).length).toBe(before + 1);
  });
  it('AC2a — an artifact whose dataKind is not alignment is refused with the named diagnostic; no record is created', async () => {
    await service.save({ kind: 'analysis-output-artifact', id: 'AOUT-CONS-TBL', title: 'table artifact', name: 'table', runRef: ref('ANR-CONS', 'analysis-run'), dataKind: 'table', inlineValue: [{ a: 1 }] }, base + 'analysis-output-artifact.schema.yaml');
    const before = (await ctx.store.list({ kind: 'conservation-interval' })).length;
    await expect(service.apply(opRequest('cons-table', declaration(), 'AOUT-CONS-TBL'))).rejects.toThrow(/conservation_alignment_artifact_invalid.*table/);
    expect((await ctx.store.list({ kind: 'conservation-interval' })).length).toBe(before);
  });
  it('AC2b — a declaration missing gap_policy is refused with the reader own diagnostic; no record is created', async () => {
    const noGap: Record<string, any> = { ...declaration() };
    delete noGap.gap_policy;
    const before = (await ctx.store.list({ kind: 'conservation-interval' })).length;
    await expect(service.apply(opRequest('cons-nogap', noGap))).rejects.toThrow(/gap_policy/);
    expect((await ctx.store.list({ kind: 'conservation-interval' })).length).toBe(before);
  });
  it('AC2c — rows supplied in the request body are not accepted by the action schema at all', () => {
    const v = ctx.validator.validate({ ...opRequest('cons-rows', declaration()), rows }, SEQUENCE_SCHEMA + 'sequence-action.schema.yaml');
    expect(v.valid).toBe(false);
  });
  it('AC3a — replaying the same requestId returns the SAME record ids and creates no second record (the apply receipt lock)', async () => {
    const n = (await ctx.store.list({ kind: 'conservation-interval' })).length;
    const again = await service.apply(opRequest('cons-1', declaration()));
    expect(again).toEqual({ recordIds: saved.ids });
    expect((await ctx.store.list({ kind: 'conservation-interval' })).length).toBe(n);
  });
  it('AC3b — changing gap_policy.treatment (version 1.1.0) changes metricValue AND the persisted gapTreatment; the record carries a different id', async () => {
    const resB = (await service.apply(opRequest('cons-2', declB()))) as { recordIds: string[] };
    const payB = ((await ctx.store.get(resB.recordIds[0]!))?.payload ?? {}) as Record<string, any>;
    expect(payB.declarationVersion).toBe('1.1.0');
    expect(payB.gapTreatment).toBe('count_as_mismatch');
    expect(payB.metricValue).toBe(0.8); // hand-computed: gap col 1 stays in the denominator as a mismatch -> 12/15
    expect(payB.metricValue).not.toBe(saved.payload.metricValue);
    expect(resB.recordIds[0]).not.toBe(saved.ids[0]);
  });
  it('leg e — the persisted record validates against schema/sequence-analysis/conservation-interval.schema.yaml (house harness: Ajv2020 strict)', () => {
    expect(validateInterval(saved.payload), JSON.stringify(validateInterval.errors)).toBe(true);
  });
});
