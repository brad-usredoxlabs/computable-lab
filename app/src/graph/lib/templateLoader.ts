import type { MaterializedTemplate } from '../../shared/api/client'
import type { PlateEvent } from '../../types/events'
import type { Labware } from '../../types/labware'
import { normalizeLabwareWithDefinition } from '../../types/labware'
import type { DeckPlacement } from '../labware/DeckVisualizationPanel'

export interface LoadedTemplateState {
  labwares: Map<string, Labware>
  events: PlateEvent[]
  deckPlatform?: string
  deckVariant?: string
  deckPlacements: DeckPlacement[]
  notice: string
}

export function materializedTemplateToState(
  materialized: MaterializedTemplate,
  options?: {
    mergedWith?: {
      labwares: Map<string, Labware>
      events: PlateEvent[]
      deckPlacements: DeckPlacement[]
    } | null
  }
): LoadedTemplateState {
  const merged = options?.mergedWith
  const labwares = merged ? new Map(merged.labwares) : new Map<string, Labware>()
  const events = merged ? [...merged.events] : []
  const placements = merged ? [...merged.deckPlacements] : []

  for (const rawLabware of materialized.snapshot.labwares || []) {
    const labware = normalizeLabwareWithDefinition(rawLabware as Labware)
    labwares.set(labware.labwareId, labware)
  }

  const existingEventIds = new Set(events.map((event) => event.eventId))
  for (const rawEvent of materialized.snapshot.events || []) {
    const event = rawEvent as PlateEvent
    if (!existingEventIds.has(event.eventId)) {
      events.push(event)
      existingEventIds.add(event.eventId)
    }
  }

  for (const placement of materialized.snapshot.deck?.placements || []) {
    if (placements.some((item) => item.slotId === placement.slotId)) continue
    placements.push(placement)
  }

  return {
    labwares,
    events,
    deckPlatform: materialized.snapshot.deck?.platform,
    deckVariant: materialized.snapshot.deck?.variant,
    deckPlacements: placements,
    notice: `Loaded template ${materialized.title}.`,
  }
}
