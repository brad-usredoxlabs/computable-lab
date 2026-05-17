import type { AiRequestContext } from '../../types/ai'
import type { EventEditorState } from '../EventEditorContext'
import { getVariantManifest } from '../../shared/lib/platformRegistry'
import { getAllPacks } from '../../shared/vocab/registry'

/**
 * Build the AI request context from the editor's current state. Mirrors what
 * the legacy editor sends so the backend's event-editor surface understands
 * the request shape.
 */
export function buildAiRequestContext(state: EventEditorState): AiRequestContext {
  const labwares = Object.values(state.labwares).map((lw) => ({
    labwareId: lw.labwareId,
    labwareType: lw.labwareType,
    name: lw.name,
    rows: lw.addressing.type === 'grid' ? lw.addressing.rows ?? 0 : 0,
    columns: lw.addressing.type === 'grid' ? lw.addressing.columns ?? 0 : 0,
  }))

  const eventSummary =
    state.events.length === 0
      ? 'No events yet.'
      : `${state.events.length} event${state.events.length === 1 ? '' : 's'} in graph.`

  const variant = getVariantManifest(state.platforms, state.platformId, state.variantId)
  const verbs = getAllPacks()
    .find((pack) => pack.packId === state.vocabPackId)
    ?.verbs.map((v) => v.verb) ?? []

  return {
    labwares,
    eventSummary,
    vocabPackId: state.vocabPackId,
    availableVerbs: verbs,
    deckPlatform: state.platformId,
    deckVariant: state.variantId,
    deckPlacements: state.placements.map((p) => ({
      slotId: p.location.kind === 'slot' ? p.location.slotId : `lawn:${p.location.xMm}:${p.location.yMm}`,
      labwareId: p.labwareId,
    })),
    ...(state.selection
      ? {
          selectedWells: state.selection.wells,
        }
      : {}),
    ...(variant ? {} : {}),
  }
}
