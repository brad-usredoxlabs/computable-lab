import type { PlateEvent } from '../../types/events'
import type { Labware, LabwareType } from '../../types/labware'

export interface TipRackRuntimeState {
  labwareId: string
  tipType: string
  capacity: number
  consumedCount: number
  depleted: boolean
  nextTipWell: string | null
}

export interface TipTrackingResult {
  valid: boolean
  requiredTips: number
  availableTips: number
  racks: TipRackRuntimeState[]
  errors: string[]
}

function tipTypeForLabwareType(type: LabwareType): string {
  const table: Record<string, string> = {
    tiprack_ot2_20: 'ot2_20',
    tiprack_ot2_200: 'ot2_200',
    tiprack_ot2_300: 'ot2_300',
    tiprack_ot2_1000: 'ot2_1000',
    tiprack_flex_50: 'flex_50',
    tiprack_flex_200: 'flex_200',
    tiprack_flex_1000: 'flex_1000',
    tiprack_assist_12_5_384: 'assist_12_5_384',
    tiprack_assist_125_384: 'assist_125_384',
    tiprack_assist_300: 'assist_300',
    tiprack_assist_1250: 'assist_1250',
  }
  return table[type] || type
}

function isPipettingEvent(event: PlateEvent): boolean {
  return (
    event.event_type === 'transfer' ||
    event.event_type === 'multi_dispense' ||
    event.event_type === 'mix' ||
    event.event_type === 'macro_program'
  )
}

function sequenceRowMajor(rows: string[], cols: string[]): string[] {
  const out: string[] = []
  for (const row of rows) {
    for (const col of cols) out.push(`${row}${col}`)
  }
  return out
}

function sequenceByColumns(rows: string[], cols: string[]): string[] {
  const out: string[] = []
  for (const col of cols) {
    for (const row of rows) out.push(`${row}${col}`)
  }
  return out
}

function tipSequence(labware: Labware, channels: number, opentronsLandscape: boolean): string[] {
  const rows = labware.addressing.rowLabels || []
  const cols = labware.addressing.columnLabels || []
  if (rows.length === 0 || cols.length === 0) return []
  if (!opentronsLandscape) return sequenceRowMajor(rows, cols)
  if (channels >= 8 && rows.length >= 8) return sequenceByColumns(rows.slice(0, 8), cols)
  return sequenceRowMajor(rows, cols)
}

export function runTipTracking(input: {
  events: PlateEvent[]
  tipRacks: Labware[]
  channels: number
  isOpentrons: boolean
  manualMode: boolean
}): TipTrackingResult {
  if (input.manualMode) {
    return { valid: true, requiredTips: 0, availableTips: 0, racks: [], errors: [] }
  }
  const channels = Math.max(1, input.channels)
  const pipettingEvents = input.events.filter(isPipettingEvent)
  const requiredTips = pipettingEvents.length * channels

  const racks: TipRackRuntimeState[] = input.tipRacks.map((labware) => {
    const rows = labware.addressing.rows || labware.addressing.rowLabels?.length || 0
    const cols = labware.addressing.columns || labware.addressing.columnLabels?.length || 0
    const capacity = rows * cols
    return {
      labwareId: labware.labwareId,
      tipType: tipTypeForLabwareType(labware.labwareType),
      capacity,
      consumedCount: 0,
      depleted: false,
      nextTipWell: null,
    }
  })

  let availableTips = racks.reduce((sum, rack) => sum + rack.capacity, 0)
  const errors: string[] = []
  let remaining = requiredTips
  for (const rack of racks) {
    const consume = Math.min(remaining, rack.capacity)
    rack.consumedCount = consume
    rack.depleted = consume >= rack.capacity && consume > 0
    const seq = tipSequence(
      input.tipRacks.find((t) => t.labwareId === rack.labwareId) as Labware,
      channels,
      input.isOpentrons
    )
    rack.nextTipWell = consume < seq.length ? seq[consume] : null
    remaining -= consume
    if (remaining <= 0) break
  }

  if (input.tipRacks.length === 0 && requiredTips > 0) {
    errors.push('No tip racks placed on deck for pipetting events.')
  } else if (requiredTips > availableTips) {
    errors.push(`Insufficient tips: required ${requiredTips}, available ${availableTips}. Add racks or reduce pipetting steps.`)
  }
  return {
    valid: errors.length === 0,
    requiredTips,
    availableTips,
    racks,
    errors,
  }
}
