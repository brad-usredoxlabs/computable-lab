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
 * the graph): verb, what it touches, how much, and which labware. CHANGES-UI-1
 * (2026-10-20) made each of those four honest: a composition row enumerates the
 * COMPONENTS the snapshot carries (not just the minted blob label), numeric
 * amounts render instead of dropping, and a requirement ghost's raw
 * `req:<curie>:<rand>` handle reads as a human name.
 */
import type { EventGraphChange } from './sidebarState'

type Dict = Record<string, unknown>

function asDict(value: unknown): Dict | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Dict) : null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * CHANGES-UI-1 (B): the compiler emits `{value: number, unit}` commonly
 * (types/events.ts:145), and `asString` returns '' for numbers — so the row
 * printed " uL" or nothing at all. A finite number renders plainly (no
 * scientific notation for normal magnitudes); anything else renders NOTHING,
 * never an orphan unit and never "undefined"/"NaN".
 */
function formatAmountValue(value: unknown): string {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toLocaleString('en-US') : ''
  }
  return asString(value)
}

/** "A2–H5 (32 wells)" — a count first, because that is what a biologist checks. */
export function describeWells(wells: readonly string[]): string {
  if (wells.length === 0) return ''
  if (wells.length === 1) return wells[0]!
  return `${wells[0]}–${wells[wells.length - 1]} (${wells.length} wells)`
}

/** One `<value> <unit>` fragment, or '' when the value is unusable (no orphan unit). */
function describeAmountDict(dict: Dict | null): string {
  if (!dict) return ''
  const value = formatAmountValue(dict['value'])
  if (!value) return ''
  const unit = asString(dict['unit'])
  return unit ? `${value} ${unit}` : value
}

function describeAmount(details: Dict): string {
  const parts: string[] = []
  const count = details['count']
  // "count 10,000" — neutral and true whatever the material is (cells, beads,
  // organisms). The material's own name sits beside it in the same row.
  if (typeof count === 'number' && Number.isFinite(count)) parts.push(`count ${count.toLocaleString('en-US')}`)
  const volume = describeAmountDict(asDict(details['volume']))
  if (volume) parts.push(volume)
  const concentration = describeAmountDict(asDict(details['concentration']))
  if (concentration) parts.push(concentration)
  return parts.join(', ')
}

/**
 * CHANGES-UI-1 (A): `AddMaterialDetails.composition_snapshot`
 * (types/events.ts:145-160) carries the mixture's COMPONENTS with their roles
 * (`CompositionEntryValue`, types/material.ts:50-56; the parse also accepts the
 * snake_case `component_ref`, :269). Until now the row showed only the FIRST ref
 * label — for a minted mixture that is the blob label ("Trypsin-EDTA + DMEM +
 * FBS + HepG2 cells"), so the biologist could not see what the mixture is made
 * of. The row now enumerates the components the way the well tooltip does
 * (focus/WellTooltip.tsx renders `<ref> · <role>` per row): `<label> as <role>`
 * per entry, roles read VERBATIM from the snapshot data — no vocabulary here.
 * Entry label = `componentRef.label || componentRef.id`, the same fallback as
 * formatCompositionSummary (types/material.ts:431-440). Concentrations stay the
 * tooltip's job; this row keeps roles only.
 */
interface CompositionRow {
  label: string
  role: string
}

function describeCompositionEntries(details: Dict): CompositionRow[] {
  const raw = details['composition_snapshot']
  if (!Array.isArray(raw)) return []
  const rows: CompositionRow[] = []
  for (const item of raw) {
    const entry = asDict(item)
    if (!entry) continue
    const ref = asDict(entry['componentRef']) ?? asDict(entry['component_ref'])
    const label = ref ? asString(ref['label']) || asString(ref['id']) : ''
    // An entry with neither a usable label nor an id says nothing — skip it.
    if (!label) continue
    rows.push({ label, role: asString(entry['role']) })
  }
  return rows
}

/** Today's behavior: the first ref field that carries a label (or a mint). */
function describeRefLabel(details: Dict): string {
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

function describeMaterial(details: Dict): string {
  const base = describeRefLabel(details)
  const components = describeCompositionEntries(details)
  if (components.length === 0) return base
  const rendered = components.map(c => (c.role ? `${c.label} as ${c.role}` : c.label)).join('; ')
  // The minted blob label may appear ONLY as the mixture's proposed name BEFORE
  // the component parenthetical — never in place of the components. If the
  // snapshot yields nothing usable we fall back to today's behavior (no
  // fabricated text).
  return base ? `${base} (${rendered})` : `(${rendered})`
}

/**
 * CHANGES-UI-1 (C): a requirement ghost's `details.labwareId` IS the raw handle
 * `req:<classCurie>:<t36>:<rand>` (types/labwareRequirement.ts:126) and was
 * printed verbatim — random tails on a review row a biologist must read.
 * Resolution order (draftChanges stays pure over events only):
 * 1. an optional resolver map (caller-supplied labwareId→label, e.g. the
 *    draft's preview labwares) wins when it has the handle;
 * 2. else a `req:` handle humanizes from itself: the CURIE's term segment
 *    (`96_well_plate` — the term id stays intact, underscores are NOT rewritten)
 *    plus a shortened `req:CL:96_well_plate…` so the ghost is still traceable,
 *    NEVER the full random tails;
 * 3. else the handle prints as today (non-`req:` ids are already human names
 *    like `plate1`).
 */
function describeLabware(handle: string, labwareLabels?: ReadonlyMap<string, string>): string {
  const mapped = labwareLabels?.get(handle)
  if (mapped) return mapped
  if (handle.startsWith('req:')) {
    const segments = handle.split(':')
    const classCurie = segments.length >= 3 ? `${segments[1]}:${segments[2]}` : ''
    const term = segments[2] ?? ''
    if (!classCurie) return 'req:…'
    return term ? `${term} (req:${classCurie}…)` : `req:${classCurie}…`
  }
  return handle
}

/**
 * One row per drafted event. `op: 'add'` because a draft proposes additions to
 * the graph; the description carries the substance the biologist must check.
 * `labwareLabels` is OPTIONAL (defaults to undefined) so every existing caller
 * that passes only events renders unchanged apart from the `req:` humanizer.
 */
export function changesFromDraftEvents(
  events: readonly unknown[],
  labwareLabels?: ReadonlyMap<string, string>,
): EventGraphChange[] {
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
    if (labware) fragments.push(`on ${describeLabware(labware, labwareLabels)}`)
    out.push({
      op: 'add',
      description: fragments.join(' · '),
      ...(asString(event['eventId']) ? { eventId: asString(event['eventId']) } : {}),
    })
  }
  return out
}
