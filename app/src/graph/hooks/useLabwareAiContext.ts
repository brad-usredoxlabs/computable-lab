/**
 * useLabwareAiContext — Builds an AiContext from the labware editor state.
 *
 * Extracts the editor-specific context building that was previously
 * embedded inside useAiChat, so useAiChat stays surface-agnostic.
 */

import { useMemo } from 'react'
import { useLabwareEditor } from '../context/LabwareEditorContext'
import { getVerbsForDisplay } from '../../shared/vocab/registry'
import { getEventSummary } from '../../types/events'
import { useLabSettings } from './useLabSettings'
import { computeLabwareStates, getWellState } from '../lib/eventGraph'
import type { PlateEvent } from '../../types/events'
import type { AiContext } from '../../types/aiContext'

interface UseLabwareAiContextOptions {
  vocabPackId: string
  editorMode?: string
  deckPlatform?: string
  deckVariant?: string
  deckPlacements?: Array<{
    slotId: string
    labwareId?: string
    moduleId?: string
  }>
  manualPipettingMode?: boolean
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

export function useLabwareAiContext(options: UseLabwareAiContextOptions): AiContext {
  const {
    state,
    sourceLabware,
    targetLabware,
    sourceSelection,
    targetSelection,
  } = useLabwareEditor()
  const { settings } = useLabSettings()

  return useMemo((): AiContext => {
    const labwares = Array.from(state.labwares.values()).map((lw) => ({
      labwareId: lw.labwareId,
      labwareType: lw.labwareType,
      name: lw.name,
      rows: lw.addressing.rows,
      columns: lw.addressing.columns,
    }))

    const computedStates = computeLabwareStates(state.events, state.labwares)
    const recentEvents = state.events.slice(-20)
    const eventSummary = recentEvents.length
      ? recentEvents.map((e) => getEventSummary(e)).join('; ')
      : 'No events yet.'

    const verbs = getVerbsForDisplay(options.vocabPackId).map((v) => v.verb)

    const selectedWells = sourceSelection
      ? Array.from(sourceSelection.selectedWells)
      : undefined

    const sourceSelectionSummary = sourceLabware && sourceSelection && sourceSelection.selectedWells.size > 0
      ? {
          labwareId: sourceLabware.labwareId,
          labwareName: sourceLabware.name,
          wells: Array.from(sourceSelection.selectedWells),
        }
      : undefined

    const targetSelectionSummary = targetLabware && targetSelection && targetSelection.selectedWells.size > 0
      ? {
          labwareId: targetLabware.labwareId,
          labwareName: targetLabware.name,
          wells: Array.from(targetSelection.selectedWells),
        }
      : undefined

    const snapshotRefs = new Map<string, { labwareId: string; wellId: string }>()
    for (const selection of [sourceSelectionSummary, targetSelectionSummary]) {
      if (!selection) continue
      for (const wellId of selection.wells) {
        snapshotRefs.set(`${selection.labwareId}:${wellId}`, { labwareId: selection.labwareId, wellId })
      }
    }
    for (const ref of collectReferencedWells(recentEvents)) {
      if (snapshotRefs.size >= 12) break
      snapshotRefs.set(`${ref.labwareId}:${ref.wellId}`, ref)
    }
    const wellStateSnapshot = Array.from(snapshotRefs.values()).slice(0, 12).map(({ labwareId, wellId }) => {
      const stateForWell = getWellState(computedStates, labwareId, wellId)
      const labware = state.labwares.get(labwareId)
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

    const surfaceContext: Record<string, unknown> = {
      labwares,
      eventSummary,
      vocabPackId: options.vocabPackId,
      availableVerbs: verbs,
      selectedWells,
      ...(sourceSelectionSummary ? { sourceSelection: sourceSelectionSummary } : {}),
      ...(targetSelectionSummary ? { targetSelection: targetSelectionSummary } : {}),
      ...(wellStateSnapshot.length > 0 ? { wellStateSnapshot } : {}),
      ...(options.deckPlatform ? { deckPlatform: options.deckPlatform } : {}),
      ...(options.deckVariant ? { deckVariant: options.deckVariant } : {}),
      ...(options.deckPlacements ? { deckPlacements: options.deckPlacements } : {}),
      ...(typeof options.manualPipettingMode === 'boolean' ? { manualPipettingMode: options.manualPipettingMode } : {}),
      materialTracking: settings.materialTracking,
    }

    return {
      surface: 'event-editor',
      summary: `Labware editor with ${labwares.length} labware(s), ${state.events.length} events`,
      surfaceContext,
      editorMode: options.editorMode,
    }
  }, [
    state.labwares,
    state.events,
    sourceLabware,
    targetLabware,
    sourceSelection,
    targetSelection,
    options.vocabPackId,
    options.editorMode,
    options.deckPlatform,
    options.deckVariant,
    options.deckPlacements,
    options.manualPipettingMode,
    settings.materialTracking,
  ])
}
