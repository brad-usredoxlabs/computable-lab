/**
 * Labware lookup by hint.
 * 
 * Provides a search function that matches labware records by name and aliases,
 * with scoring for different match types (exact, alias, substring).
 */

import type { RecordStore } from '../../store/types.js';

export interface LabwareLookupResult {
  recordId: string;
  title: string;
}

/**
 * Create a labware lookup function backed by a RecordStore.
 * 
 * @param store - The record store to query
 * @returns A function that takes a hint string and returns matching labware records
 */
export function createLabwareLookup(
  store: RecordStore,
): (hint: string) => Promise<LabwareLookupResult[]> {
  return async (hint: string) => {
    const normalized = hint.toLowerCase().trim();
    if (!normalized) return [];

    // Use store.list({kind: 'labware'}) — the existing RecordStoreImpl.list
    // signature accepts a filter object
    const labwareRecords = await store.list({ kind: 'labware' });

    interface Scored {
      recordId: string;
      title: string;
      score: number;
    }

    const scored: Scored[] = [];
    for (const record of labwareRecords) {
      // Extract name from payload - handle both direct property and payload.name
      const payload = record.payload as Record<string, unknown>;
      const name = typeof payload['name'] === 'string' ? payload['name'] : '';
      
      // Extract aliases from payload - treat as unknown and narrow
      const aliasesRaw = payload['aliases'];
      const aliases = Array.isArray(aliasesRaw)
        ? (aliasesRaw as unknown[]).filter((a): a is string => typeof a === 'string')
        : [];
      
      const normalizedName = name.toLowerCase();
      const normalizedAliases = aliases.map((a) => a.toLowerCase());

      let score = 0;
      if (normalizedName === normalized) {
        score = 100;
      } else if (normalizedAliases.includes(normalized)) {
        score = 90;
      } else if (normalizedName.includes(normalized)) {
        score = 50;
      } else if (normalizedAliases.some((a) => a.includes(normalized))) {
        score = 40;
      } else {
        // Alphanumeric squash fallback for things like "12well" vs "12 well"
        const squash = (s: string) => s.replace(/[^a-z0-9]+/g, '');
        const squashedHint = squash(normalized);
        if (squash(normalizedName) === squashedHint) {
          score = 80;
        } else if (normalizedAliases.some((a) => squash(a) === squashedHint)) {
          score = 70;
        } else if (squash(normalizedName).includes(squashedHint)) {
          score = 30;
        }
      }

      if (score > 0) {
        scored.push({ recordId: record.recordId, title: name, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 5).map(({ recordId, title }) => ({ recordId, title }));
  };
}
