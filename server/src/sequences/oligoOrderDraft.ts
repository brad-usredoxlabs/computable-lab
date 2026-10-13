/**
 * Deterministic lowering of an `oligo-order-draft` (an AI READ of a vendor
 * document) into the pipeline's own OligoRow[] — the exact shape
 * extractOligoRows produces. One compiler, two producers: everything
 * downstream (envelopes, review cards, save actions) is unchanged.
 *
 * Normalization is NOT re-implemented here: normalizeOligoRawBases (the
 * extracted stage of oligoOrder.ts) applies the declared sequenceNoise and
 * modification patterns from config/sequence-analysis/oligo-order.yaml and
 * runs residues through normalizeSequence, so an AI-read row and a regex-read
 * row are indistinguishable downstream except for provenance.
 *
 * The draft document contract is schema/sequence-analysis/oligo-order-draft.schema.yaml.
 */
import { normalizeOligoRawBases, type OligoModification, type OligoRow } from './oligoOrder.js';
import { sequenceConfig } from './sequenceRuntime.js';

export interface OligoOrderDraftRow {
  name: string;
  sequence?: string | null;
  unreadable?: boolean;
  modifications?: OligoModification[];
  scale?: string;
  purification?: string;
  yieldPmol?: number;
  mass?: number;
  concentrationUM?: number;
  buffer?: string;
  page?: number;
  sourceQuote?: string;
}
export interface OligoOrderDraft {
  kind: 'oligo-order-draft';
  vendor?: string;
  orderId?: string;
  declaredRowCount?: number;
  notes?: string;
  rows: OligoOrderDraftRow[];
}

export async function oligoRowsFromDraft(draft: OligoOrderDraft): Promise<OligoRow[]> {
  const config = await sequenceConfig('oligo-order');
  const alphabets = await sequenceConfig('alphabets');
  const rows: OligoRow[] = [];
  for (const entry of draft.rows) {
    // metadata keys mirror the regex path's config.metadata keys exactly;
    // draft-only review fields (yieldPmol/mass/concentrationUM/buffer/
    // sourceQuote/unreadable) ride the draft document, never OligoRow.metadata.
    const metadata: Record<string, string> = {};
    if (draft.vendor) metadata.vendor = draft.vendor;
    if (draft.orderId) metadata.orderId = draft.orderId;
    if (entry.scale) metadata.synthesisScale = entry.scale;
    if (entry.purification) metadata.purification = entry.purification;
    const row: OligoRow = {
      label: entry.name.trim(),
      residues: '',
      raw: entry.sequence ?? '', // verbatim: the identity arm depends on raw matching the regex capture byte-for-byte
      page: entry.page ?? 1,
      modifications: [],
      issues: [],
      metadata,
    };
    if (entry.unreadable || entry.sequence == null || entry.sequence.trim() === '') {
      // Short-circuit BEFORE normalizeSequence (which throws 'Sequence is empty.').
      // The row stays visible for review — never silently dropped, never invented bases.
      row.issues.push('The bases of this row could not be read from the document. Type them in from the page before importing.');
      if (!row.label) row.issues.push('No oligo name found. Enter a name before saving.');
      rows.push(row);
      continue;
    }
    const normalized = normalizeOligoRawBases(entry.sequence, config, alphabets);
    row.residues = normalized.residues;
    row.issues.push(...normalized.issues);
    // Modification merge (OQ2): pattern-table first (deterministic truth),
    // then draft-declared modifications the table did not produce, deduped
    // by label — never ABY/QSY twice.
    row.modifications = [...normalized.modifications];
    for (const mod of entry.modifications ?? []) {
      if (!row.modifications.some((m) => m.label === mod.label)) row.modifications.push({ label: mod.label, role: mod.role, position: mod.position });
    }
    if (!row.label) row.issues.push('No oligo name found. Enter a name before saving.');
    rows.push(row);
  }
  return rows;
}
