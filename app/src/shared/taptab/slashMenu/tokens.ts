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
  }
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
      return { background: '#f3e8ff', color: '#7e22ce', border: '#d8b4fe' }
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
    default:
      return { background: '#e5e7eb', color: '#374151', border: '#d1d5db' }
  }
}
