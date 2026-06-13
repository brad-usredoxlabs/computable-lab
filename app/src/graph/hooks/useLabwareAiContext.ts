/**
 * useLabwareAiContext — Builds an AiContext from the labware editor state.
 *
 * Extracts the editor-specific context building that was previously
 * embedded inside useAiChat, so useAiChat stays surface-agnostic.
 */

import { useMemo } from 'react'
import { useLabwareEditor } from '../context/LabwareEditorContext'
import { getVerbsForDisplay } from '../../shared/vocab/registry'
import { useLabSettings } from './useLabSettings'
import type { AiContext } from '../../types/aiContext'
import { buildAcceptedEventGraphProjection } from '../lib/acceptedEventGraphProjection'

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
    const verbs = getVerbsForDisplay(options.vocabPackId).map((v) => v.verb)
    const surfaceContext = buildAcceptedEventGraphProjection({
      labwares: state.labwares,
      events: state.events,
      vocabPackId: options.vocabPackId,
      availableVerbs: verbs,
      sourceSelection: { labware: sourceLabware, selectedWells: sourceSelection?.selectedWells },
      targetSelection: { labware: targetLabware, selectedWells: targetSelection?.selectedWells },
      ...(options.deckPlatform ? { deckPlatform: options.deckPlatform } : {}),
      ...(options.deckVariant ? { deckVariant: options.deckVariant } : {}),
      ...(options.deckPlacements ? { deckPlacements: options.deckPlacements } : {}),
      ...(typeof options.manualPipettingMode === 'boolean' ? { manualPipettingMode: options.manualPipettingMode } : {}),
      materialTracking: settings.materialTracking,
    })

    return {
      surface: 'event-editor',
      summary: `Labware editor with ${surfaceContext.labwares.length} labware(s), ${state.events.length} events`,
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
