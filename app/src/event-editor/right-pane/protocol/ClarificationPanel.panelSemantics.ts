/**
 * MATRES-PANEL §7.3 — per-selection semantics as DATA.
 *
 * The same class of client DATA table `CLARIFICATION_MENU_BY_REASON`
 * established as law in the clarification adapter ("presentation mapping
 * belongs in the client adapter as a table, not scattered branches").
 * Orch OQ-2 ruling (BINDING): per-selection semantics text lives HERE, in the
 * client table — server payload prose was rejected; ELIG declares NO
 * presentation data (post-merge re-verify §6: grep panelSemantics/
 * selectionSemantics/groupLabel/mintAllowed/mintDisclosure across schema/,
 * config/, server/src, app/src = EMPTY).
 *
 * Keys are EXACTLY the canonical five referent levels
 * (schema/scientist-intent/material-eligibility/material-eligibility.yaml:42
 * == scientist-intent-vocabulary referentLevels, set-diff pinned) plus the
 * `unspecified` arm for candidates carrying NO ELIG keys (tier-5 mint offers,
 * near-miss suggestions, model-side facts, pre-ELIG payloads — the LIVE
 * degradation branch, spec §7.2). `unknown` (the spine's undeclared-level
 * spelling) is NOT a table key: it degrades to `unspecified` — the panel
 * never re-derives a level from a tier (bait 13).
 *
 * `pickerLayer` reuses the EXISTING AiClarificationRequest.materialLayer
 * spellings (the shipped layer-scoping law, ClarificationPicker.tsx:208-211 +
 * LAYER_ALIASES) — no new layer nouns. `mintAllowed` is the mint-legality
 * COLUMN (spec §7.3 / D5): mint only at NON-PHYSICAL layers; instance/aliquot
 * selection is REFERENCE attach, never a custody/use assertion (memo Q2/Q4,
 * RATIFIED; P4). The `catalog-identity` role tag is PAYLOAD (read off the
 * verdict, EligibilityVerdictFact.bindRole/displayRole) — it is deliberately
 * NOT a column here (orch OQ-3 ruling: read it, never table it).
 */
import type { AiClarificationRequest } from '../../../types/ai'

/** The canonical five referent levels (material-eligibility.yaml:42). */
export type CanonicalReferentLevel =
  | 'concept'
  | 'formulation'
  | 'vendor-product'
  | 'instance'
  | 'aliquot'

/** A candidate's level arm as the panel groups it: the canonical five, or the
 *  honest degradation arm when the payload carries no (or an untabled) level. */
export type PanelLevelArm = CanonicalReferentLevel | 'unspecified'

export interface PanelLevelSemantics {
  /** Group header wording (the biologist never infers a level from a list). */
  groupLabel: string
  /** What a selection in this group DOES — shown at the point of choice. */
  selectionSemantics: string
  /** Mint legality as a DATA column (D5): mint only at NON-PHYSICAL layers. */
  mintAllowed: boolean
  /** The shipped picker layer this level scopes to (materialLayer spellings). */
  pickerLayer?: NonNullable<AiClarificationRequest['materialLayer']>
  /** Point-of-choice disclosure for an existing selection-time write (D6:
   *  display-only copy; the write path is untouched). */
  mintDisclosure?: string
}

export const PLANE_SEMANTICS_BY_LEVEL: Readonly<Record<PanelLevelArm, PanelLevelSemantics>> = {
  concept: {
    groupLabel: 'Concept',
    // §7.3: concept/formulation selection MAY ground a proposed record — the
    // existing groundedAnswerFromMention/groundMaterialRef proposed-status
    // path (ClarificationPicker.tsx:92-115), stated as such.
    selectionSemantics: 'Selecting may ground a proposed local record for this slot.',
    mintAllowed: true,
    pickerLayer: 'material',
  },
  formulation: {
    groupLabel: 'Formulation',
    selectionSemantics: 'Selecting may ground a proposed local record for this slot.',
    mintAllowed: true,
    pickerLayer: 'material-spec',
  },
  'vendor-product': {
    groupLabel: 'Vendor-product',
    // §7.3: vendor-product goes through the EXISTING mint-on-select
    // (resolvers.ts vendorExaSuggestions -> createFromVendorExa); the panel
    // DISCLOSES that selection-time durable write at the point of choice.
    selectionSemantics: 'Selecting answers this slot with the vendor product.',
    mintAllowed: false,
    // NO pickerLayer: the vendor tier is the Exa arm that STREAMS inside the
    // unscoped '/m' funnel (resolvers.ts:124 — appendVendorExaHits fires from
    // resolveMaterial's general arm; a layer-scoped resolver never queries it).
    // Scoping a vendor-bearing slot to 'vendor-product' would kill the shipped
    // "vendor search on demand" tier. Mint legality here comes from the
    // disclosure line, not from layer scoping.
    mintDisclosure: 'Vendor rows mint on select: selecting one creates a local vendor-product record now.',
  },
  instance: {
    groupLabel: 'Instance',
    // §7.3 / memo Q2+Q4 (RATIFIED): REFERENCE attach, never a custody/use
    // assertion (P4: catalog identity is never custody/use evidence).
    selectionSemantics: 'Selecting attaches a REFERENCE to this preparation for this slot — it asserts nothing about custody or use.',
    mintAllowed: false,
    pickerLayer: 'material-instance',
  },
  aliquot: {
    groupLabel: 'Aliquot',
    selectionSemantics: 'Selecting attaches a REFERENCE to this aliquot for this slot — it asserts nothing about custody or use.',
    mintAllowed: false,
    pickerLayer: 'aliquot',
  },
  unspecified: {
    // §7.2 degradation arm: candidates with NO ELIG keys (mint offers,
    // near-miss suggestions, model-side facts) render here, no verdict markers.
    groupLabel: 'Unspecified level',
    selectionSemantics: 'Selecting answers this slot with the chosen record; the payload states no referent level.',
    mintAllowed: true,
  },
}

/** The table's canonical order for group rendering (unspecified last). */
export const PANEL_LEVEL_ORDER: readonly PanelLevelArm[] = [
  'concept',
  'formulation',
  'vendor-product',
  'instance',
  'aliquot',
  'unspecified',
]

/** Map a candidate's payload level onto the table arm. An absent level, or a
 *  level the table does not name (e.g. the spine's 'unknown' spelling),
 *  degrades to `unspecified` — NEVER a re-derivation from tier (bait 13). */
export function panelLevelArmOf(referentLevel: string | undefined): PanelLevelArm {
  if (referentLevel !== undefined && referentLevel !== 'unspecified') {
    const semantics = (PLANE_SEMANTICS_BY_LEVEL as Readonly<Record<string, PanelLevelSemantics | undefined>>)[referentLevel]
    if (semantics !== undefined) return referentLevel as PanelLevelArm
  }
  return 'unspecified'
}

/** The slot's picker search layer from the table's `mintAllowed`/`pickerLayer`
 *  columns (bait 3: a table column lookup, no tier literal, no level
 *  switchboard). The search is scoped to a physical layer ONLY when EVERY arm
 *  present is a physical layer with a declared pickerLayer (instance/aliquot):
 *  that is the "mint absent below formulation" law expressed as the shipped
 *  layer-scoping gate (ClarificationPicker.tsx:208-211) + the shipped canMint
 *  gate (:268-269) — a physical-scoped '/m' search offers no mint floor.
 *  Any non-physical arm present (concept/formulation/unspecified) keeps the
 *  general '/m' menu — the shipped mint floor lives there and minting is
 *  legal at those layers. vendor-product deliberately declares NO
 *  pickerLayer: the Exa vendor tier streams inside the unscoped '/m' funnel
 *  (resolvers.ts appendVendorExaHits), so scoping a vendor-bearing slot away
 *  from '/m' would kill "vendor search on demand". */
export function slotPickerLayer(arms: Iterable<PanelLevelArm>): NonNullable<AiClarificationRequest['materialLayer']> | undefined {
  const present = [...arms]
  if (present.length === 0) return undefined
  let layer: NonNullable<AiClarificationRequest['materialLayer']> | undefined
  let bestRank = -1
  for (const arm of present) {
    const semantics = PLANE_SEMANTICS_BY_LEVEL[arm]
    if (semantics.mintAllowed || semantics.pickerLayer === undefined) return undefined
    const rank = PANEL_LEVEL_ORDER.indexOf(arm)
    if (rank > bestRank) {
      bestRank = rank
      layer = semantics.pickerLayer
    }
  }
  return layer
}
