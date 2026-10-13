/**
 * OLIGO-AI-1 lowerer contract (spec §6.4, §4): an oligo-order-draft lowers into
 * the SAME OligoRow[] the deterministic regex extractor emits — one compiler
 * (the shared normalizer in oligoOrder.ts), two producers.
 *
 * The envelope-identity arm IS the task-list acceptance clause: deterministic
 * rows vs AI-draft rows produce identical candidate envelopes
 * (buildIngestionCandidateEnvelope is pure — recordId is sha1-based, no
 * timestamps — so identity is testable with zero I/O).
 */
import { describe, expect, it } from 'vitest';
import { oligoRowsFromDraft, type OligoOrderDraft } from './oligoOrderDraft.js';
import { extractOligoRows, type OligoRow } from './oligoOrder.js';
import { buildIngestionJobEnvelope, buildIngestionBundleEnvelope, buildIngestionCandidateEnvelope, createSourceRef } from '../ingestion/records.js';
import { SEQUENCE_SCHEMA } from './sequenceRuntime.js';

// The exact dye-wrapped-row line the regex path reads (oligoOrder.test.ts fixture line).
const DETERMINISTIC_LINE = '30 Pass Oformi_1784_ABY |ABY-CAC CGT ATC GCA AGG TTG TCG ACA GTC A-QSY 28 365570 10137.44 Pass 6000 100uM';
// The verbatim sequence capture group 1 of that line (probe-verified raw).
const CAPTURED_SEQUENCE = 'ABY-CAC CGT ATC GCA AGG TTG TCG ACA GTC A-QSY';

describe('oligo-order-draft lowering', () => {
  it('lowers a readable row, stripping the declared dye patterns', async () => {
    const rows = await oligoRowsFromDraft({ kind: 'oligo-order-draft', vendor: 'Thermo Fisher', rows: [
      { name: 'Oformi_1784_ABY', sequence: CAPTURED_SEQUENCE, page: 1 },
    ] });
    expect(rows[0]?.residues).toBe('CACCGTATCGCAAGGTTGTCGACAGTCA');
    expect(rows[0]?.modifications.map((m) => m.label)).toEqual(['ABY', 'QSY']);
    expect(rows[0]?.modifications).toEqual([
      { label: 'ABY', role: 'reporter', position: '5-prime' },
      { label: 'QSY', role: 'quencher', position: '3-prime' },
    ]);
    expect(rows[0]?.issues).toEqual([]);
    expect(rows[0]?.metadata.vendor).toBe('Thermo Fisher');
    expect(rows[0]?.label).toBe('Oformi_1784_ABY');
    expect(rows[0]?.page).toBe(1);
  });

  it('keeps raw verbatim (the identity arm depends on raw matching the regex capture byte-for-byte)', async () => {
    const rows = await oligoRowsFromDraft({ kind: 'oligo-order-draft', rows: [
      { name: 'Oformi_1784_ABY', sequence: CAPTURED_SEQUENCE },
    ] });
    const deterministic = await extractOligoRows(DETERMINISTIC_LINE);
    expect(rows[0]?.raw).toBe(deterministic[0]?.raw);
    expect(rows[0]?.raw).toBe(CAPTURED_SEQUENCE);
  });

  it('keeps an unreadable row visible with an issue instead of inventing bases', async () => {
    const rows = await oligoRowsFromDraft({ kind: 'oligo-order-draft', rows: [
      { name: 'Buulg_934_VIC', sequence: null, unreadable: true, page: 1 },
    ] });
    expect(rows).toHaveLength(1); // never a silently dropped row
    expect(rows[0]?.residues).toBe('');
    expect(rows[0]?.issues.join(' ')).toMatch(/could not be read/);
    // Short-circuits BEFORE normalizeSequence (which throws 'Sequence is empty.').
    expect(rows[0]?.issues.join(' ')).not.toMatch(/Sequence is empty/);
  });

  it('normalizes to the same residues the regex path produces for the same line', async () => {
    const rows = await oligoRowsFromDraft({ kind: 'oligo-order-draft', rows: [
      { name: 'Oformi_1786_ABY', sequence: 'ABY-CCG TAT CGC AAG GTT GTC GAC AGT CAC G-QSY' },
    ] });
    expect(rows[0]?.residues).toBe('CCGTATCGCAAGGTTGTCGACAGTCACG');
  });

  it('yields the SAME mods array whether or not the draft re-declares the pattern-table mods (no duplicates)', async () => {
    const without = await oligoRowsFromDraft({ kind: 'oligo-order-draft', rows: [
      { name: 'Oformi_1784_ABY', sequence: CAPTURED_SEQUENCE },
    ] });
    const withDeclared = await oligoRowsFromDraft({ kind: 'oligo-order-draft', rows: [
      { name: 'Oformi_1784_ABY', sequence: CAPTURED_SEQUENCE, modifications: [
        { label: 'ABY', role: 'reporter', position: '5-prime' },
        { label: 'QSY', role: 'quencher', position: '3-prime' },
      ] },
    ] });
    // Pattern-table first (deterministic truth), draft-declared mods the table
    // did not produce appended, deduped by label — never ABY/QSY twice.
    expect(withDeclared[0]?.modifications).toEqual(without[0]?.modifications);
    expect(withDeclared[0]?.modifications).toEqual([
      { label: 'ABY', role: 'reporter', position: '5-prime' },
      { label: 'QSY', role: 'quencher', position: '3-prime' },
    ]);
  });

  it('appends draft-declared modifications the pattern table did not produce', async () => {
    const rows = await oligoRowsFromDraft({ kind: 'oligo-order-draft', rows: [
      { name: 'Probe_i', sequence: 'FAM-ACGT', modifications: [
        { label: 'FAM', role: 'reporter', position: '5-prime' },
        { label: 'iBHQ', role: 'quencher', position: 'internal' },
      ] },
    ] });
    // FAM comes from the table once; iBHQ (not in the table) is appended.
    expect(rows[0]?.modifications).toEqual([
      { label: 'FAM', role: 'reporter', position: '5-prime' },
      { label: 'iBHQ', role: 'quencher', position: 'internal' },
    ]);
    expect(rows[0]?.residues).toBe('ACGT');
  });

  it('reports an honest leftover-symbol issue for a bracket-VIC row via the same catch arm (no second normalizer)', async () => {
    // The row the regex path silently misses: the lowerer must NOT "fix" it.
    const rows = await oligoRowsFromDraft({ kind: 'oligo-order-draft', rows: [
      { name: 'Buulg_934_VIC', sequence: '[VIC-CCC ATT TAG TAA TAT CAA CCG CAC GG-QSY' },
    ] });
    expect(rows[0]?.issues.join(' ')).toMatch(/Unrecognized sequence symbol '\['/);
    expect(rows[0]?.residues).toContain('[');
    expect(rows[0]?.modifications.map((m) => m.label)).not.toContain('VIC');
  });

  it('maps only the regex path\'s metadata keys into metadata, all as strings (numbers never leak)', async () => {
    const rows = await oligoRowsFromDraft({ kind: 'oligo-order-draft', vendor: 'Thermo Fisher', orderId: '13421320', rows: [
      { name: 'P', sequence: 'ACGT', scale: '50N', purification: 'HPLC', yieldPmol: 27.96, mass: 74249, concentrationUM: 100, buffer: 'TE', sourceQuote: 'Primer Name: P' },
    ] });
    const metadata = rows[0]?.metadata ?? {};
    expect(Object.keys(metadata).sort()).toEqual(['orderId', 'purification', 'synthesisScale', 'vendor']);
    expect(Object.values(metadata).every((v) => typeof v === 'string')).toBe(true);
    // Draft-only review fields ride the draft document, not OligoRow.metadata.
    expect(metadata).not.toHaveProperty('yieldPmol');
    expect(metadata).not.toHaveProperty('sourceQuote');
  });

  it('deterministic rows vs AI-draft rows produce IDENTICAL candidate envelopes (acceptance clause)', async () => {
    const deterministicRows = await extractOligoRows(DETERMINISTIC_LINE);
    const draft: OligoOrderDraft = { kind: 'oligo-order-draft', rows: [
      { name: 'Oformi_1784_ABY', sequence: CAPTURED_SEQUENCE, page: 1 },
    ] };
    const draftRows = await oligoRowsFromDraft(draft);

    // The rows themselves are the same OligoRow[] — deep-equal.
    expect(draftRows).toEqual(deterministicRows);

    // Same envelope inputs as ingestOligoOrder (oligoOrder.ts:70-75), fixed sha.
    const sha256 = '0'.repeat(64);
    const job = buildIngestionJobEnvelope({ sourceKind: 'other', adapterKind: 'oligo-order', name: 'order.txt', submittedBy: 'USR-TEST' });
    const bundle = buildIngestionBundleEnvelope({ job: job.payload, title: `${job.recordId} oligos`, bundleType: 'other', summary: 'Review names, base sequences, orientation and modifications before importing.' });
    const envelopeFor = (row: OligoRow) => buildIngestionCandidateEnvelope({
      job: job.payload,
      bundle: bundle.payload,
      candidateType: 'oligo',
      title: `${job.recordId} row 1: ${row.label}`,
      payload: { ...row, sha256 },
      sourceRefs: [createSourceRef('IAR-IDENTITY')],
      proposedRecordKind: 'oligo-spec',
      proposedSchemaId: SEQUENCE_SCHEMA + 'oligo-spec.schema.yaml',
    });
    const deterministicEnvelope = envelopeFor(deterministicRows[0]!);
    const aiEnvelope = envelopeFor(draftRows[0]!);
    expect(aiEnvelope).toEqual(deterministicEnvelope);
    expect(JSON.stringify(aiEnvelope)).toBe(JSON.stringify(deterministicEnvelope));
  });
});
