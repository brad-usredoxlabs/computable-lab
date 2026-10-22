/**
 * Say what a draft will do, in the Changes panel.
 *
 * The panel used to receive a hardcoded `changes: []` whenever a draft needed no
 * clarification, so "Apply to run" appeared over an EMPTY list — the biologist was
 * asked to accept something they could not see. That path became the common one
 * once a range of wells stopped producing one question per well, so it has to say
 * something true.
 *
 * This is a pure description of the draft's own events (never a re-derivation of
 * the graph): verb, what it touches, how much, and which labware.
 */
import type { EventGraphChange } from './sidebarState'

type Dict = Record<string, unknown>

function asDict(value: unknown): Dict | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Dict) : null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** "A2–H5 (32 wells)" — a count first, because that is what a biologist checks. */
export function describeWells(wells: readonly string[]): string {
  if (wells.length === 0) return ''
  if (wells.length === 1) return wells[0]!
  return `${wells[0]}–${wells[wells.length - 1]} (${wells.length} wells)`
}

function describeAmount(details: Dict): string {
  const parts: string[] = []
  const count = details['count']
  // "count 10,000" — neutral and true whatever the material is (cells, beads,
  // organisms). The material's own name sits beside it in the same row.
  if (typeof count === 'number' && Number.isFinite(count)) parts.push(`count ${count.toLocaleString('en-US')}`)
  const volume = asDict(details['volume'])
  if (volume) parts.push(`${asString(volume['value'])} ${asString(volume['unit'])}`.trim())
  const concentration = asDict(details['concentration'])
  if (concentration) parts.push(`${asString(concentration['value'])} ${asString(concentration['unit'])}`.trim())
  return parts.join(', ')
}

function describeMaterial(details: Dict): string {
  for (const field of [
    'material_spec_ref',
    'material_instance_ref',
    'aliquot_ref',
    'vendor_product_ref',
    'material_ref',
  ]) {
    const ref = asDict(details[field])
    if (!ref) continue
    const label = asString(ref['label']) || asString(ref['id'])
    const mint = asDict(ref['mint'])
    if (mint) {
      const minted = asString(mint['label']) || asString(mint['name'])
      if (minted) return `${minted} (new local term?)`
    }
    if (label) return label
  }
  return ''
}

/**
 * One row per drafted event. `op: 'add'` because a draft proposes additions to
 * the graph; the description carries the substance the biologist must check.
 */
export function changesFromDraftEvents(events: readonly unknown[]): EventGraphChange[] {
  const out: EventGraphChange[] = []
  for (const raw of events) {
    const event = asDict(raw)
    if (!event) continue
    const details = asDict(event['details']) ?? {}
    const verb = asString(event['event_type']) || asString(event['verb']) || 'event'
    const wells = Array.isArray(details['wells'])
      ? (details['wells'] as unknown[]).filter((w): w is string => typeof w === 'string' && w.trim().length > 0)
      : []
    const fragments = [verb]
    const wellText = describeWells(wells)
    if (wellText) fragments.push(wellText)
    const material = describeMaterial(details)
    if (material) fragments.push(material)
    const amount = describeAmount(details)
    if (amount) fragments.push(amount)
    const labware = asString(details['labwareId']) || asString(details['labware_id'])
    if (labware) fragments.push(`on ${labware}`)
    out.push({
      op: 'add',
      description: fragments.join(' · '),
      ...(asString(event['eventId']) ? { eventId: asString(event['eventId']) } : {}),
    })
  }
  return out
}
