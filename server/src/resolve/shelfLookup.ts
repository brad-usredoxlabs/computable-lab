/**
 * MATRES-SHELF — concept-keyed inventory shelf lookup (side lookup).
 *
 * NOT a spine adapter: the spine answers "what noun is this term?" with
 * CURIE-ranked candidates. The lazy-brand question ("what brand of DMSO do we
 * have") is an INVENTORY query — the output is a grouped bill of RECORDED
 * MATERIAL, not a ranking. This module resolves the term to CONCEPT records
 * using the same tier-1 lexical law the spine's record provider uses
 * (createRecordProvider over `material` kind — imported, not copied), then
 * joins DOWN to recorded material through the schema-verified refs:
 *
 *   - material-instance: material_ref ∈ concept ids, OR vendor_product_ref ->
 *     vendor-product whose material_ref ∈ concept ids.
 *   - material-lot: material_ref ∈ concept ids.
 *   - aliquot: parent_material_instance_ref (instance already surfaced) or
 *     source_lot_ref (lot already surfaced).
 *   - MISSING LINKS ARE VISIBLE: instances/lots with no resolvable concept
 *     join that matched the term lexically surface as joinedVia
 *     'unknown-provenance' — never silently absent, and with no provenance
 *     claim attached (no vendor/lot invented).
 *
 * NAMING LAW (P7): every report line is RECORDED MATERIAL. The words
 * available / availability / reserved / sufficient appear NOWHERE in the
 * response shape or field names. Read-only: store.list ONLY, zero writes.
 */

import type { RecordEnvelope, RecordStore } from '../store/types.js';
import { createRecordProvider } from './providers/records.js';
import type { ProviderHit } from './types.js';

/** Referent level of a shelf line (inventory layer, never concept/spec). */
export type ShelfReferentLevel = 'instance' | 'lot' | 'aliquot';

/** How the line joined to the resolved concept(s) — recorded as data. */
export type ShelfJoinPath =
  | 'vendor-product'
  | 'direct-material-ref'
  | 'parent-instance'
  | 'source-lot'
  | 'unknown-provenance';

/** A concept the term resolved to (tier-1 local material records). */
export interface ShelfConcept {
  recordId: string;
  label: string;
}

/** One recorded-material line on the shelf. */
export interface ShelfEntry {
  recordId: string;
  kind: string;
  label: string;
  level: ShelfReferentLevel;
  /** Vendor from the vendor-product (or lot supplier) when joined. */
  vendor?: string;
  /** Lot string (vendor_lot / lot_number) when present. */
  lot?: string;
  joinedVia: ShelfJoinPath;
}

/** Recorded material grouped by vendor/lot. */
export interface ShelfGroup {
  vendor?: string;
  lot?: string;
  entries: ShelfEntry[];
}

/** The grouped bill of recorded material for one term. */
export interface ShelfReport {
  term: string;
  concepts: ShelfConcept[];
  groups: ShelfGroup[];
}

export interface ShelfLookup {
  queryShelf(term: string): Promise<ShelfReport>;
}

/**
 * kind -> referent level. The spine provider's KIND_LEVEL is not exported
 * (providers/records.ts keeps it private and stays byte-unchanged), so this
 * is a local data-const table (spec §6 allows this; recorded as assumption).
 */
const KIND_LEVEL: Record<string, ShelfReferentLevel> = {
  'material-instance': 'instance',
  'material-lot': 'lot',
  aliquot: 'aliquot',
};

/** Cap on concept hits per query (mirrors the spine's default candidate limit). */
const CONCEPT_LIMIT = 20;

function payloadOf(record: RecordEnvelope): Record<string, unknown> {
  return (record.payload ?? {}) as Record<string, unknown>;
}

/** Extract the target id from a ref-shaped field ({kind, id, ...}). */
function refId(payload: Record<string, unknown>, field: string): string | undefined {
  const ref = payload[field];
  if (!ref || typeof ref !== 'object') return undefined;
  const id = (ref as Record<string, unknown>).id;
  return typeof id === 'string' && id ? id : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

/**
 * Lexical law for the unknown-provenance leg ONLY (records.ts-style:
 * name/title/label/synonyms substring). The join law above is the primary
 * resolution; this leg exists so missing links are never silently absent.
 */
function lexicallyMatches(payload: Record<string, unknown>, needle: string): boolean {
  const fields: string[] = [];
  for (const key of ['name', 'title', 'label'] as const) {
    const v = payload[key];
    if (typeof v === 'string' && v) fields.push(v.toLowerCase());
  }
  const synonyms = payload.synonyms;
  if (Array.isArray(synonyms)) {
    for (const s of synonyms) if (typeof s === 'string' && s) fields.push(s.toLowerCase());
  }
  return fields.some((f) => f.includes(needle));
}

/** Nested lot block (material-instance / aliquot payload.lot). */
function lotBlock(payload: Record<string, unknown>): Record<string, unknown> | undefined {
  const lot = payload.lot;
  return lot && typeof lot === 'object' ? (lot as Record<string, unknown>) : undefined;
}

async function listKind(store: RecordStore, kind: string): Promise<RecordEnvelope[]> {
  try {
    return await store.list({ kind });
  } catch {
    return []; // a missing kind index must not sink the rest (provider style)
  }
}

const LEVEL_ORDER: Record<ShelfReferentLevel, number> = { instance: 0, lot: 1, aliquot: 2 };

/**
 * Build a read-only shelf lookup over the given store. store.list ONLY —
 * no create/update/delete is ever touched (pinned by the write-spy test).
 */
export function createShelfLookup(store: RecordStore): ShelfLookup {
  return {
    async queryShelf(term: string): Promise<ShelfReport> {
      const needle = term.toLowerCase();

      // 1. Term -> concepts via the SAME tier-1 lexical law the spine uses
      //    for the CONCEPT (imported provider, restricted to material kind).
      const provider = createRecordProvider(store, ['material']);
      const controller = new AbortController();
      let hits: ProviderHit[];
      try {
        hits = await provider(term, CONCEPT_LIMIT, controller.signal);
      } catch {
        hits = [];
      }
      const concepts: ShelfConcept[] = hits.map((hit) => ({
        recordId: hit.curie.startsWith('local:') ? hit.curie.slice('local:'.length) : hit.curie,
        label: hit.label,
      }));
      const conceptIds = new Set(concepts.map((c) => c.recordId));

      // 2. Load inventory kinds (filter in code — no query index beyond kind).
      const vendorProducts = await listKind(store, 'vendor-product');
      const instances = await listKind(store, 'material-instance');
      const lots = await listKind(store, 'material-lot');
      const aliquots = await listKind(store, 'aliquot');
      const vpById = new Map<string, Record<string, unknown>>();
      for (const vp of vendorProducts) vpById.set(vp.recordId, payloadOf(vp));

      const entries: ShelfEntry[] = [];

      const makeEntry = (
        record: RecordEnvelope,
        joinedVia: ShelfJoinPath,
        vendor?: string,
        lot?: string,
      ): ShelfEntry => {
        const payload = payloadOf(record);
        const level = KIND_LEVEL[String(payload.kind ?? '')] ?? 'instance';
        return {
          recordId: record.recordId,
          kind: String(payload.kind ?? record.recordId),
          label: firstString(payload.name, payload.title, payload.label) ?? record.recordId,
          level,
          ...(vendor ? { vendor } : {}),
          ...(lot ? { lot } : {}),
          joinedVia,
        };
      };

      // 3. Instances: direct material_ref, or vendor-product -> material_ref.
      const surfacedInstanceIds = new Set<string>();
      for (const record of instances) {
        const payload = payloadOf(record);
        const direct = refId(payload, 'material_ref');
        if (direct && conceptIds.has(direct)) {
          const block = lotBlock(payload);
          entries.push(makeEntry(
            record,
            'direct-material-ref',
            firstString(block?.vendor),
            firstString(block?.lot_number),
          ));
          surfacedInstanceIds.add(record.recordId);
          continue;
        }
        const vpRefId = refId(payload, 'vendor_product_ref');
        const vp = vpRefId ? vpById.get(vpRefId) : undefined;
        const vpConcept = vp ? refId(vp, 'material_ref') : undefined;
        if (vp && vpConcept && conceptIds.has(vpConcept)) {
          const block = lotBlock(payload);
          entries.push(makeEntry(
            record,
            'vendor-product',
            firstString(block?.vendor, vp.vendor),
            firstString(block?.lot_number),
          ));
          surfacedInstanceIds.add(record.recordId);
          continue;
        }
        // Missing link but lexically matched: visible, no provenance claim.
        if (lexicallyMatches(payload, needle)) {
          entries.push(makeEntry(record, 'unknown-provenance'));
          surfacedInstanceIds.add(record.recordId);
        }
      }

      // 4. Lots: direct material_ref.
      const surfacedLotIds = new Set<string>();
      for (const record of lots) {
        const payload = payloadOf(record);
        const direct = refId(payload, 'material_ref');
        if (direct && conceptIds.has(direct)) {
          const supplier = payload.supplier;
          const supplierObj = supplier && typeof supplier === 'object'
            ? (supplier as Record<string, unknown>)
            : undefined;
          entries.push(makeEntry(
            record,
            'direct-material-ref',
            firstString(supplierObj?.name),
            firstString(supplierObj?.vendor_lot, payload.lot_number),
          ));
          surfacedLotIds.add(record.recordId);
          continue;
        }
        if (lexicallyMatches(payload, needle)) {
          entries.push(makeEntry(record, 'unknown-provenance'));
          surfacedLotIds.add(record.recordId);
        }
      }

      // 5. Aliquots: via an already-surfaced instance or lot. Vendor/lot are
      //    inherited from the joined parent (recorded data, not a claim).
      for (const record of aliquots) {
        const payload = payloadOf(record);
        const parentId = refId(payload, 'parent_material_instance_ref');
        const lotId = refId(payload, 'source_lot_ref');
        let joinedVia: ShelfJoinPath | undefined;
        let parentEntry: ShelfEntry | undefined;
        if (parentId && surfacedInstanceIds.has(parentId)) {
          joinedVia = 'parent-instance';
          parentEntry = entries.find((e) => e.recordId === parentId);
        } else if (lotId && surfacedLotIds.has(lotId)) {
          joinedVia = 'source-lot';
          parentEntry = entries.find((e) => e.recordId === lotId);
        }
        if (!joinedVia) continue;
        const block = lotBlock(payload);
        entries.push(makeEntry(
          record,
          joinedVia,
          firstString(block?.vendor, parentEntry?.vendor),
          firstString(block?.lot_number, parentEntry?.lot),
        ));
      }

      // 6. Group recorded material by vendor/lot (deterministic order).
      const groupKey = (e: ShelfEntry): string => `${e.vendor ?? ''}\u0000${e.lot ?? ''}`;
      const groupsByVendorLot = new Map<string, ShelfGroup>();
      for (const entry of entries) {
        const key = groupKey(entry);
        let group = groupsByVendorLot.get(key);
        if (!group) {
          group = {
            ...(entry.vendor ? { vendor: entry.vendor } : {}),
            ...(entry.lot ? { lot: entry.lot } : {}),
            entries: [],
          };
          groupsByVendorLot.set(key, group);
        }
        group.entries.push(entry);
      }
      const groups = [...groupsByVendorLot.values()].sort((a, b) => {
        const av = a.vendor ?? '\uffff';
        const bv = b.vendor ?? '\uffff';
        if (av !== bv) return av < bv ? -1 : 1;
        const al = a.lot ?? '';
        const bl = b.lot ?? '';
        if (al !== bl) return al < bl ? -1 : 1;
        return 0;
      });
      for (const group of groups) {
        group.entries.sort((a, b) =>
          LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.recordId.localeCompare(b.recordId),
        );
      }

      return { term, concepts, groups };
    },
  };
}
