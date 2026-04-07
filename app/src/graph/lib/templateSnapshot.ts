import type { PlateEvent, TransferDetails } from '../../types/events'
import type { Labware } from '../../types/labware'
import { normalizeTransferDetails } from '../../types/events'
import { normalizeSerialDilutionParams } from '../../editor/lib/serialDilutionPlan'

function referencedLabwareIds(event: PlateEvent): Set<string> {
  const refs = new Set<string>()
  const details = event.details as Record<string, unknown>
  if (typeof details.labwareId === 'string' && details.labwareId.length > 0) {
    refs.add(details.labwareId)
  }
  const transfer = normalizeTransferDetails(event.details as TransferDetails)
  if (transfer.sourceLabwareId) refs.add(transfer.sourceLabwareId)
  if (transfer.destLabwareId) refs.add(transfer.destLabwareId)

  if (event.event_type === 'macro_program') {
    const program = details.program as { kind?: string; params?: Record<string, unknown> } | undefined
    const params = program?.params || {}
    const ids = [
      params.sourceLabwareId,
      params.targetLabwareId,
      params.containerId,
      params.sourceLabware,
      params.targetLabware,
    ]
    for (const id of ids) {
      if (typeof id === 'string' && id.length > 0) refs.add(id)
    }
    if (program?.kind === 'serial_dilution') {
      const normalized = normalizeSerialDilutionParams(program.params as never)
      for (const lane of normalized.lanes) {
        if (lane.targetLabwareId) refs.add(lane.targetLabwareId)
        if (lane.sourceLabwareId) refs.add(lane.sourceLabwareId)
        if (lane.startSource.labwareId) refs.add(lane.startSource.labwareId)
      }
    }
  }
  return refs
}

export function computeTemplateClosure(
  events: PlateEvent[],
  anchorLabwareId: string,
  playbackPosition?: number
): { labwareIds: string[]; eventIds: string[] } {
  const applied = typeof playbackPosition === 'number'
    ? events.slice(0, Math.max(0, Math.min(events.length, playbackPosition)))
    : events

  const includedLabware = new Set<string>([anchorLabwareId])
  const includedEvents: PlateEvent[] = []

  for (let i = applied.length - 1; i >= 0; i -= 1) {
    const event = applied[i]
    const refs = referencedLabwareIds(event)
    const touchesIncluded = Array.from(refs).some((id) => includedLabware.has(id))
    if (!touchesIncluded) continue
    includedEvents.push(event)
    for (const id of refs) includedLabware.add(id)
  }

  includedEvents.reverse()
  return {
    labwareIds: Array.from(includedLabware),
    eventIds: includedEvents.map((event) => event.eventId),
  }
}

export function buildTemplateSnapshot(input: {
  title: string
  version: string
  notes?: string
  events: PlateEvent[]
  labwares: Map<string, Labware>
  playbackPosition?: number
  anchorLabwareId?: string
  eventGraphId?: string | null
}) {
  const allLabwareIds = Array.from(input.labwares.keys())
  if (allLabwareIds.length === 0) {
    throw new Error('No labware available to snapshot')
  }
  const applied = typeof input.playbackPosition === 'number'
    ? input.events.slice(0, Math.max(0, Math.min(input.events.length, input.playbackPosition)))
    : input.events

  const closure = input.anchorLabwareId
    ? computeTemplateClosure(applied, input.anchorLabwareId, undefined)
    : {
        labwareIds: allLabwareIds,
        eventIds: applied.map((event) => event.eventId),
      }
  const eventIdSet = new Set(closure.eventIds)
  const labwareIdSet = new Set(closure.labwareIds)

  return {
    title: input.title,
    version: input.version,
    notes: input.notes || '',
    anchorLabwareId: input.anchorLabwareId || undefined,
    sourceEventGraphId: input.eventGraphId || null,
    playbackPosition: typeof input.playbackPosition === 'number' ? input.playbackPosition : applied.length,
    events: applied.filter((event) => eventIdSet.has(event.eventId)),
    labwares: Array.from(input.labwares.values()).filter((labware) => labwareIdSet.has(labware.labwareId)),
    closure,
  }
}
