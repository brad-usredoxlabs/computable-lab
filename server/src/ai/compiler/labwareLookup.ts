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
  generic_384_well_plate: 'lbw-def-generic-384-well-plate',
  generic_24_well_plate: 'lbw-def-generic-24-well-plate',
  // Reservoir hints
  generic_1_well_reservoir: 'lbw-def-generic-reservoir-1-v1',
  generic_8_well_reservoir: 'lbw-def-generic-8-reservoir',
  generic_12_well_reservoir: 'lbw-def-generic-12-well-reservoir',
  generic_2_well_reservoir: 'lbw-def-generic-2-well-reservoir',
  generic_24_well_reservoir: 'lbw-def-generic-24-well-reservoir',
  // Tip rack hints
  generic_96_tip_rack: 'lbw-def-generic-96-tip-rack',
  // PCR rack hints
  generic_96x0p2ml_pcr_rack: 'lbw-def-generic-96x0p2ml-pcr-rack',
  // Integra tip rack hints
  integra_tiprack_12_5ul_384: 'lbw-def-integra-tiprack-12-5ul-384-v1',
  integra_tiprack_1250ul_96: 'lbw-def-integra-tiprack-1250ul-96-v1',
  integra_tiprack_125ul_384: 'lbw-def-integra-tiprack-125ul-384-v1',
  integra_tiprack_300ul_96: 'lbw-def-integra-tiprack-300ul-96-v1',
  // Nest plate hints
  nest_96_wellplate_200ul_flat: 'lbw-def-opentrons-nest-96-wellplate-200ul-flat-v1',
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

    // L2-P1-BIND-ID-1 recbyid: the IDENTITY tier — resolve by recordId, not
    // by name. "Identity is a record id, never a name" (architect-context-l2
    // §2.7): names, labels and aliases only pre-select a candidate. A
    // `labware: <recordId>` answer carries one identity end to end, so an
    // EXACT, CASE-SENSITIVE hint === recordId match — over the lab's
    // labware-DEFINITION records AND labware instance records — returns that
    // record at the top score, before any name/alias scoring. recordId only:
    // never `id`, platform_aliases, or the display name. This ADDS an
    // identity tier; it does not replace the label tier below.
    const definitionRecords = await store.list({ kind: 'labware-definition' });
    // Trim surrounding whitespace (a recordId never carries any) but keep the
    // match CASE-SENSITIVE: identity is the record id exactly, never a case-
    // folded name.
    const identityHint = hint.trim();
    const identityRecord =
      definitionRecords.find((r) => r.recordId === identityHint) ??
      labwareRecords.find((r) => r.recordId === identityHint);
    if (identityRecord) {
      const identityPayload = identityRecord.payload as Record<string, unknown>;
      const isDefinition = definitionRecords.some(
        (r) => r.recordId === identityRecord.recordId,
      );
      const identityTitle = isDefinition
        ? typeof identityPayload['display_name'] === 'string'
          ? identityPayload['display_name']
          : identityRecord.recordId
        : typeof identityPayload['name'] === 'string'
          ? identityPayload['name']
          : identityRecord.recordId;
      return [{ recordId: identityRecord.recordId, title: identityTitle }];
    }

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

/**
 * L2-P1-ABSENCE-PROBE-TIERS-1 (u1probe) — the DEFINITION tier of the
 * two-tier absence probe (decision ABSENCE-RENDERING-AND-PROBE-TIERS-l2-
 * 20261114, ruling 2): an absence assertion requires a probe across BOTH
 * `kind:'labware'` store records AND the labware-definition registry.
 *
 * createLabwareLookup scores ONLY `kind:'labware'` instance records by
 * payload['name'] (its identity tier is recordId-only, and it also feeds the
 * compile/resolution path — labwareInstanceLookup — so it stays unchanged).
 * This function walks `kind:'labware-definition'` records by
 * payload.display_name (plus payload.aliases when present) with the SAME
 * scoring rules as the record tier's name/alias tier (exact=100, alias=90,
 * squash=80/70, includes=50, alias-includes=40, squash-includes=30). It is a
 * lookup by NAME, not identity: the definition recordId never binds a name
 * hint here (identity stays the record tier's exclusive tier).
 */
export function createLabwareDefinitionLookup(
  store: RecordStore,
): (hint: string) => Promise<Array<{ recordId: string; title: string }>> {
  return async (hint: string) => {
    const normalized = hint.toLowerCase().trim();
    if (!normalized) return [];

    const definitionRecords = await store.list({ kind: 'labware-definition' });

    interface Scored {
      recordId: string;
      title: string;
      score: number;
    }

    const scored: Scored[] = [];
    for (const record of definitionRecords) {
      const payload = record.payload as Record<string, unknown>;
      const name = typeof payload['display_name'] === 'string' ? payload['display_name'] : '';
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
