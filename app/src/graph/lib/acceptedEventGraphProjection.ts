import type {
  AiActiveDeckScope,
  AiLabwareSummary,
  AiRequestContext,
  AiWellSelection,
  AiWellStateSummary,
} from '../../types/ai'
import type { PlateEvent } from '../../types/events'
import { getEventSummary } from '../../types/events'
import type { Labware } from '../../types/labware'
import type { WellId } from '../../types/plate'
import { computeLabwareStates, getWellState } from './eventGraph'

export interface AcceptedEventGraphSelection {
  labware?: Labware | null
  selectedWells?: Set<WellId> | WellId[] | null
}

export interface AcceptedEventGraphProjectionInput {
  labwares: Map<string, Labware>
  events: PlateEvent[]
  vocabPackId: string
  availableVerbs: string[]
  sourceSelection?: AcceptedEventGraphSelection
  targetSelection?: AcceptedEventGraphSelection
  selectedWells?: WellId[]
  deckPlatform?: string
  deckVariant?: string
  deckPlacements?: AiRequestContext['deckPlacements']
  deckAllowedSurfaces?: AiActiveDeckScope['allowedSurfaces']
  deckAllowedSlots?: string[]
  focusedLabwareId?: string
  manualPipettingMode?: boolean
  materialTracking?: AiRequestContext['materialTracking']
  runId?: string
  eventGraphId?: string
}

export type AcceptedEventGraphProjection = Pick<
  AiRequestContext,
  | 'labwares'
  | 'eventSummary'
  | 'vocabPackId'
  | 'availableVerbs'
  | 'selectedWells'
  | 'sourceSelection'
  | 'targetSelection'
  | 'wellStateSnapshot'
  | 'deckPlatform'
  | 'deckVariant'
  | 'deckPlacements'
  | 'activeDeckScope'
  | 'manualPipettingMode'
  | 'materialTracking'
> & {
  runId?: string
  eventGraphId?: string
}

function collectReferencedWells(events: PlateEvent[], limit = 8): Array<{ labwareId: string; wellId: string }> {
  const seen = new Set<string>()
  const refs: Array<{ labwareId: string; wellId: string }> = []
  for (const event of [...events].reverse()) {
    const details = event.details as Record<string, unknown>
    const pushRef = (labwareId: unknown, wells: unknown) => {
      if (typeof labwareId !== 'string' || !Array.isArray(wells)) return
      for (const wellId of wells) {
        if (typeof wellId !== 'string') continue
        const key = `${labwareId}:${wellId}`
        if (seen.has(key)) continue
        seen.add(key)
        refs.push({ labwareId, wellId })
        if (refs.length >= limit) return
      }
    }
    pushRef(details.labwareId, details.wells)
    pushRef(details.source_labwareId, details.source_wells)
    pushRef(details.dest_labwareId, details.dest_wells)
    const canonicalSource = details.source as { labwareInstanceId?: string; wells?: unknown } | undefined
    const canonicalDest = details.target as { labwareInstanceId?: string; wells?: unknown } | undefined
    pushRef(canonicalSource?.labwareInstanceId, canonicalSource?.wells)
    pushRef(canonicalDest?.labwareInstanceId, canonicalDest?.wells)
    if (refs.length >= limit) break
  }
  return refs
}

function selectedWellsArray(selection?: AcceptedEventGraphSelection): WellId[] {
  if (!selection?.selectedWells) return []
  return Array.isArray(selection.selectedWells)
    ? selection.selectedWells
    : Array.from(selection.selectedWells)
}

function summarizeSelection(selection?: AcceptedEventGraphSelection): AiWellSelection | undefined {
  const labware = selection?.labware
  const wells = selectedWellsArray(selection)
  if (!labware || wells.length === 0) return undefined
  return {
    labwareId: labware.labwareId,
    labwareName: labware.name,
    wells,
  }
}

function summarizeLabwares(labwares: Map<string, Labware>): AiLabwareSummary[] {
  return Array.from(labwares.values()).map((lw) => ({
    labwareId: lw.labwareId,
    labwareType: lw.labwareType,
    name: lw.name,
    ...(lw.addressing.type === 'grid' ? { rows: lw.addressing.rows ?? 0, columns: lw.addressing.columns ?? 0 } : {}),
  }))
}

function buildActiveDeckScope(input: AcceptedEventGraphProjectionInput): AiActiveDeckScope | undefined {
  if (!input.runId || !input.deckPlatform || !input.deckVariant) return undefined
  const allowedSurfaces = input.deckAllowedSurfaces?.length
    ? Array.from(new Set(input.deckAllowedSurfaces))
    : ['slot' as const]
  const allowedSlots = input.deckAllowedSlots
    ? Array.from(new Set(input.deckAllowedSlots))
    : []
  const allowedLabwareIds = Array.from(new Set(
    (input.deckPlacements ?? [])
      .map((placement) => placement.labwareId)
      .filter((id): id is string => Boolean(id)),
  ))
  return {
    locked: true,
    runId: input.runId,
    platformId: input.deckPlatform,
    variantId: input.deckVariant,
    allowedSurfaces,
    allowedSlots,
    allowedLabwareIds,
    ...(input.focusedLabwareId ? { focusedLabwareId: input.focusedLabwareId } : {}),
  }
}

function buildWellStateSnapshot(args: {
  labwares: Map<string, Labware>
  events: PlateEvent[]
  sourceSelectionSummary?: AiWellSelection
  targetSelectionSummary?: AiWellSelection
}): AiWellStateSummary[] {
  const computedStates = computeLabwareStates(args.events, args.labwares)
  const recentEvents = args.events.slice(-20)
  const snapshotRefs = new Map<string, { labwareId: string; wellId: string }>()

  for (const selection of [args.sourceSelectionSummary, args.targetSelectionSummary]) {
    if (!selection) continue
    for (const wellId of selection.wells) {
      snapshotRefs.set(`${selection.labwareId}:${wellId}`, { labwareId: selection.labwareId, wellId })
    }
  }
  for (const ref of collectReferencedWells(recentEvents)) {
    if (snapshotRefs.size >= 12) break
    snapshotRefs.set(`${ref.labwareId}:${ref.wellId}`, ref)
  }

  return Array.from(snapshotRefs.values()).slice(0, 12).map(({ labwareId, wellId }) => {
    const stateForWell = getWellState(computedStates, labwareId, wellId)
    const labware = args.labwares.get(labwareId)
    return {
      labwareId,
      labwareName: labware?.name || labwareId,
      wellId,
      totalVolume_uL: Number(stateForWell.volume_uL.toFixed(3)),
      materials: stateForWell.materials.map((material) => ({
        label: material.materialRef,
        ...(typeof material.volume_uL === 'number' ? { volume_uL: Number(material.volume_uL.toFixed(3)) } : {}),
        ...(material.concentration ? { concentration: material.concentration } : {}),
        ...(material.concentrationUnknown ? { concentrationUnknown: true } : {}),
        ...(typeof material.count === 'number' ? { count: Number(material.count.toFixed(3)) } : {}),
        ...(material.materialSpecRef ? { materialSpecRefId: material.materialSpecRef } : {}),
        ...(material.aliquotRef ? { aliquotRefId: material.aliquotRef } : {}),
        ...(material.materialInstanceRef ? { materialInstanceRefId: material.materialInstanceRef } : {}),
        ...(material.vendorProductRef ? { vendorProductRefId: material.vendorProductRef } : {}),
      })),
      ...(stateForWell.lastEventId ? { lastEventId: stateForWell.lastEventId } : {}),
      eventCount: stateForWell.eventHistory.length,
      harvested: stateForWell.harvested,
    }
  })
}

export function buildAcceptedEventGraphProjection(
  input: AcceptedEventGraphProjectionInput,
): AcceptedEventGraphProjection {
  const labwares = summarizeLabwares(input.labwares)
  const recentEvents = input.events.slice(-20)
  const eventSummary = recentEvents.length
    ? recentEvents.map((event) => getEventSummary(event)).join('; ')
    : 'No events yet.'
  const sourceSelectionSummary = summarizeSelection(input.sourceSelection)
  const targetSelectionSummary = summarizeSelection(input.targetSelection)
  const sourceSelectedWells = selectedWellsArray(input.sourceSelection)
  const targetSelectedWells = selectedWellsArray(input.targetSelection)
  const selectedWells = input.selectedWells
    ?? (sourceSelectedWells.length > 0 ? sourceSelectedWells : targetSelectedWells)
  const wellStateSnapshot = buildWellStateSnapshot({
    labwares: input.labwares,
    events: input.events,
    sourceSelectionSummary,
    targetSelectionSummary,
  })
  const activeDeckScope = buildActiveDeckScope(input)

  return {
    labwares,
    eventSummary,
    vocabPackId: input.vocabPackId,
    availableVerbs: input.availableVerbs,
    ...(selectedWells.length > 0 ? { selectedWells } : {}),
    ...(sourceSelectionSummary ? { sourceSelection: sourceSelectionSummary } : {}),
    ...(targetSelectionSummary ? { targetSelection: targetSelectionSummary } : {}),
    ...(wellStateSnapshot.length > 0 ? { wellStateSnapshot } : {}),
    ...(input.deckPlatform ? { deckPlatform: input.deckPlatform } : {}),
    ...(input.deckVariant ? { deckVariant: input.deckVariant } : {}),
    ...(input.deckPlacements ? { deckPlacements: input.deckPlacements } : {}),
    ...(activeDeckScope ? { activeDeckScope } : {}),
    ...(typeof input.manualPipettingMode === 'boolean' ? { manualPipettingMode: input.manualPipettingMode } : {}),
    ...(input.materialTracking ? { materialTracking: input.materialTracking } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.eventGraphId ? { eventGraphId: input.eventGraphId } : {}),
  }
}
