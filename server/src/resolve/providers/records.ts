/**
 * Tier 1 — existing workspace records ("local saved terms").
 *
 * Searches the record store for records whose name/label/synonyms match the
 * term, including previously-minted local concept materials. Each hit becomes
 * a `local:<recordId>` CURIE so downstream consumers treat it like any other
 * grounded term. This is what makes "prefer what the lab already has" work and
 * what the mint-gate dedups against.
 */

import type { RecordStore } from '../../store/types.js';
import type { MaterialLevel, ProviderHit, ResolveProvider } from '../types.js';

/** Record kinds searched by default, ordered roughly concept → physical. */
const DEFAULT_KINDS = [
  'material',
  'material-spec',
  'formulation',
  'material-instance',
  'aliquot',
  'vendor-product',
  'labware',
];

const KIND_LEVEL: Record<string, MaterialLevel> = {
  material: 'concept',
  'material-spec': 'spec',
  formulation: 'spec',
  'material-instance': 'instance',
  aliquot: 'aliquot',
};

function matchableStrings(payload: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const key of ['name', 'title', 'label'] as const) {
    const v = payload[key];
    if (typeof v === 'string' && v) out.push(v.toLowerCase());
  }
  const synonyms = payload.synonyms;
  if (Array.isArray(synonyms)) {
    for (const s of synonyms) if (typeof s === 'string' && s) out.push(s.toLowerCase());
  }
  return out;
}

/**
 * Build a tier-1 record provider over the given store. `kinds` overrides the
 * default kind set (e.g. when a surface restricts to labware).
 */
export function createRecordProvider(store: RecordStore, kinds: string[] = DEFAULT_KINDS): ResolveProvider {
  return async (term, limit): Promise<ProviderHit[]> => {
    const needle = term.toLowerCase();
    const hits: ProviderHit[] = [];

    for (const kind of kinds) {
      let records;
      try {
        records = await store.list({ kind });
      } catch {
        continue; // a missing kind index must not sink the rest
      }
      for (const record of records) {
        const payload = record.payload as Record<string, unknown>;
        const fields = matchableStrings(payload);
        if (!fields.some((f) => f.includes(needle))) continue;
        const label = String(payload.name ?? payload.title ?? payload.label ?? record.recordId);
        hits.push({
          curie: `local:${record.recordId}`,
          label,
          namespace: 'local',
          level: KIND_LEVEL[kind] ?? 'unknown',
        });
        if (hits.length >= limit) return hits;
      }
    }
    return hits;
  };
}
