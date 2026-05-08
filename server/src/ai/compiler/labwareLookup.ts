/**
 * Labware lookup by hint.
 * 
 * Provides a search function that matches labware records by name, aliases,
 * and a deterministic alias map for Foundry test assumption hints,
 * with scoring for different match types (exact, alias, substring).
 */

import type { RecordStore } from '../../store/types.js';

/**
 * Deterministic aliases for Foundry test assumption hints.
 *
 * These map only to existing, semantically compatible labware-definition
 * records. Missing exact definitions should stay unresolved so the Foundry can
 * route them to a labware definition/rendering patch instead of hiding the gap.
 */
const LABWARE_ALIAS_MAP: Record<string, string> = {
  // Manual tube rack hints
  generic_24x1_5ml_tube_rack: 'lbw-def-generic-50x1p5ml-tube-rack',
  generic_6x15ml_tube_rack: 'lbw-def-generic-6x15ml-tube-rack',
  generic_4x50ml_tube_rack: 'lbw-def-generic-4x50ml-tube-rack',
  // Plate hints
  generic_96_well_plate: 'lbw-def-generic-96-well-plate',
  generic_384_well_plate: 'lbw-def-generic-384-well-pcr-plate',
  generic_24_well_plate: 'lbw-def-generic-24-well-plate',
  generic_96_well_deep_plate: 'lbw-def-generic-96-well-deepwell-plate',
  // Reservoir hints
  generic_1_well_reservoir: 'lbw-def-generic-reservoir-1-v1',
  generic_8_well_reservoir: 'lbw-def-generic-8-reservoir',
  generic_12_well_reservoir: 'lbw-def-generic-12-well-reservoir',
  generic_2_well_reservoir: 'lbw-def-generic-2-well-reservoir',
  generic_24_well_reservoir: 'lbw-def-generic-24-well-reservoir',
  // Tip rack hints
  generic_96_tip_rack: 'lbw-def-generic-96-tip-rack',
  // Deep well plate hints
  generic_96_well_deep_plate: 'lbw-def-generic-96-well-deepwell-plate',
  // PCR rack hints
  generic_96x0p2ml_pcr_rack: 'lbw-def-generic-96x0p2ml-pcr-rack',
  // Integra tip rack hints
  integra_tiprack_12_5ul_384: 'lbw-def-integra-tiprack-12-5ul-384-v1',
  integra_tiprack_1250ul_96: 'lbw-def-integra-tiprack-1250ul-96-v1',
  integra_tiprack_125ul_384: 'lbw-def-integra-tiprack-125ul-384-v1',
  integra_tiprack_300ul_96: 'lbw-def-integra-tiprack-300ul-96-v1',
  // Nest plate hints
  nest_96_wellplate_200ul_flat: 'lbw-def-opentrons-nest-96-wellplate-200ul-flat-v1',
  nest_96_wellplate_2ml_deep: 'lbw-def-opentrons-nest-96-wellplate-2ml-deep-v1',
  // Nest reservoir hints
  nest_12_reservoir_22ml: 'lbw-def-opentrons-nest-12-reservoir-22ml-v1',
  nest_8_reservoir_22ml: 'lbw-def-opentrons-nest-8-reservoir-22ml-v1',
};

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
    
    // Check deterministic alias map first for Foundry test assumption hints
    const directAlias = LABWARE_ALIAS_MAP[normalized];
    if (directAlias) {
      return [{ recordId: directAlias, title: directAlias }];
    }

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
