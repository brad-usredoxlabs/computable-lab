/**
 * Mention ↔ token serialization.
 *
 * The wire format is the same `[[kind:id|label]]` (and `[[selection:…]]`)
 * the server already parses — see `server/src/ai/promptMentions.ts`. Lifting
 * the serializer here keeps the slash menu the single owner of mention I/O;
 * the existing helpers in `app/src/shared/lib/aiPromptMentions.ts` remain
 * available for callers that still parse stored prompts but are no longer
 * authoritative for *writing* tokens.
 */

import type { SlashMention } from './types'

export function mentionToToken(mention: SlashMention): string {
  switch (mention.type) {
    case 'material':
      return `[[${mention.entityKind}:${mention.id}|${mention.label}]]`
    case 'labware':
      return `[[labware:${mention.id}|${mention.label}]]`
    case 'protocol':
      return `[[${mention.entityKind}:${mention.id}|${mention.label}]]`
    case 'selection':
      return `[[selection:${mention.selectionKind}|${mention.labwareId}|${mention.wells.join(
        ',',
      )}|${mention.label}]]`
    case 'tube':
      return `[[tube:${mention.sizeLabel}|${mention.label}]]`
    case 'equipment':
      return `[[equipment:${mention.id}|${mention.label}]]`
  }
}

/**
 * L2-TERM-1 (UC-D4) — the badge/vocabulary policy as a single DATA table.
 *
 * The vocabulary tiers are the words a resolved row wears: a TRUE ontology
 * hit, a workspace RECORD of this lab, a multi-part COMPOSITION, and the
 * mint floor must be visibly distinct terms. Never two local terms for one
 * entity; never a local/composite reading as "Ontology". Every badge
 * surface (resolver rows, the record popover, the heading copy) reads
 * these words from here — no scattered string branches.
 */
export const VOCABULARY_BADGE = {
  ontology: 'Ontology',
  local: 'Local',
  composition: 'Composition',
  mint: 'New',
} as const
export type VocabularyTier = keyof typeof VOCABULARY_BADGE

/** The honest subtitle a tier wears next to its badge. A local record is
 *  not an ontology term; a composition is not a term under any ontology.
 *  (The mint entry carries the byte-pinned floor wording.) */
export const VOCABULARY_SUBTITLE: Record<VocabularyTier, string> = {
  ontology: 'Ontology term',
  local: 'Local record',
  composition: 'Composition',
  mint: 'mint a draft term into the lab namespace',
}

/** A row whose detail.ontology is this value is a record of THIS lab, not
 *  an ontology hit — its popover field must not be labelled "Ontology". */
export const LOCAL_VOCABULARY = 'local'

/** Popover/rail field label for a row's detail.ontology value (DATA map):
 *  a namespace (CHEBI, XCO, OAK…) is an ontology; 'local' is the lab's own
 *  vocabulary. L2-TERM-1 — the "Ontology: local" contradiction is gone. */
export const ONTOLOGY_FIELD_LABEL: Record<string, string> = {
  [LOCAL_VOCABULARY]: 'Vocabulary',
}
export function detailOntologyFieldLabel(value: string): string {
  return ONTOLOGY_FIELD_LABEL[value] ?? 'Ontology'
}

/**
 * The KIND WORDS a material mention kind reads as in human-facing text — the
 * ONE shared vocabulary (L2-CLARIFY-PICKER-1 P2, advc-c1 DEFECT 3). The
 * per-row consequence line and the answered-row sentence both use these words
 * for the same row: never a second vocabulary, and `material` alone is not a
 * sanctioned word (the ontology terms are concept / formulation / instance /
 * aliquot / vendor-product — spec:50). Keyed by the material mention kind
 * (`material`, `material-spec`, …) the wire token carries.
 */
export const ANSWER_KIND_WORD: Record<string, string> = {
  material: 'material record',
  'material-spec': 'formulation',
  'material-instance': 'instance',
  aliquot: 'aliquot',
  'vendor-product': 'vendor product',
}

/** The short KIND WORD in parentheses on a consequence / answered row:
 *  `material` => `concept`, `material-spec` => `formulation`, … (the
 *  ontology term for the layer, NOT the raw mention kind). */
export const KIND_WORD: Record<string, string> = {
  material: 'concept',
  'material-spec': 'formulation',
  'material-instance': 'instance',
  aliquot: 'aliquot',
  'vendor-product': 'vendor product',
}

/** The menu's display-label dedupe key (MENU-CANDIDATES-1 Fix A) — the
 *  canonical shape so the contains-section count can be computed on the SAME
 *  key the downstream dedupe uses (one source; the resolver and the
 *  comparator must not each invent their own normalization). */
export function menuLabelKey(entityKind: string, title: string): string {
  return `${entityKind}::${title.trim().toLowerCase().replace(/\s+/g, ' ')}`
}

/** Badge label shown by the UI for a given mention. Centralised so the
 *  suggestion list and the inline pill agree. */
export function mentionBadge(mention: SlashMention): string {
  if (mention.type === 'material') {
    if (mention.entityKind === 'material-spec') return 'Formulation'
    if (mention.entityKind === 'aliquot' || mention.entityKind === 'material-instance') return 'Instance'
    if (mention.entityKind === 'vendor-product') return 'Vendor'
    return 'Concept'
  }
  if (mention.type === 'labware') return 'Labware'
  if (mention.type === 'protocol') {
    return mention.entityKind === 'graph-component' ? 'Component' : 'Protocol'
  }
  if (mention.type === 'tube') return 'Tube'
  if (mention.type === 'equipment') return 'Equipment'
  return mention.selectionKind === 'source' ? 'Source' : 'Target'
}

/** Inline pill background/foreground colours per badge label. */
export function badgeStyles(
  badge: string,
): { background: string; color: string; border: string } {
  switch (badge) {
    case 'Formulation':
      return { background: '#dcfce7', color: '#166534', border: '#86efac' }
    case 'Instance':
      return { background: '#dbeafe', color: '#1d4ed8', border: '#93c5fd' }
    case 'Vendor':
      return { background: '#fef9c3', color: '#854d0e', border: '#fde68a' }
    case 'Concept':
    case 'Ontology':
      return { background: '#f3e8ff', color: '#7e22ce', border: '#d8b4fe' }
    // L2-TERM-1 (UC-D4): the local/composite/mint vocabulary tiers wear
    // palettes of their own — never the neutral unknown-badge gray, and
    // never the ontology purple.
    case 'Local':
      return { background: '#f0fdf4', color: '#15803d', border: '#4ade80' }
    case 'Composition':
      return { background: '#ccfbf1', color: '#0f766e', border: '#2dd4bf' }
    case 'New':
      return { background: '#fff7ed', color: '#c2410c', border: '#fb923c' }
    case 'Labware':
      return { background: '#fef3c7', color: '#92400e', border: '#fcd34d' }
    case 'Source':
      return { background: '#e0f2fe', color: '#075985', border: '#7dd3fc' }
    case 'Target':
      return { background: '#fee2e2', color: '#991b1b', border: '#fca5a5' }
    case 'Protocol':
      return { background: '#e0e7ff', color: '#3730a3', border: '#c7d2fe' }
    case 'Component':
      return { background: '#ede9fe', color: '#5b21b6', border: '#ddd6fe' }
    case 'Tube':
      return { background: '#ffedd5', color: '#9a3412', border: '#fdba74' }
    case 'Equipment':
      return { background: '#ecfdf5', color: '#047857', border: '#a7f3d0' }
    default:
      return { background: '#e5e7eb', color: '#374151', border: '#d1d5db' }
  }
}
