import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react'
import { apiClient } from '../shared/api/client'
import type { PlatformManifest } from '../types/platformRegistry'
import { defaultVariantForPlatform, getPlatformManifest } from '../shared/lib/platformRegistry'
import type { Labware } from '../types/labware'
import type {
  EventEditorPlacement,
  LabwareOrientation,
  PlacementLocation,
  TipState,
  WellSelection,
} from './types'
import type { WellId } from '../types/plate'
import type { PlateEvent } from '../types/events'
import { generateEventId } from '../types/events'

export type LoadState = 'idle' | 'loading' | 'ready' | 'error'

export interface EventEditorState {
  loadState: LoadState
  loadError: string | null
  platforms: PlatformManifest[]
  platformId: string
  variantId: string
  vocabPackId: string
  toolTypeId: string | null
  assistPipetteId: string | null
  runId: string | null
  labwares: Record<string, Labware>
  placements: EventEditorPlacement[]
  focusPlacementId: string | null
  selection: WellSelection | null
  events: PlateEvent[]
  tipState: TipState
}

type Action =
  | { type: 'load_start' }
  | { type: 'load_error'; error: string }
  | { type: 'load_success'; platforms: PlatformManifest[]; initialPlatformId?: string }
  | { type: 'set_platform'; platformId: string }
  | { type: 'set_variant'; variantId: string }
  | { type: 'set_vocab'; vocabPackId: string }
  | { type: 'set_tool'; toolTypeId: string | null; assistPipetteId: string | null }
  | { type: 'set_run'; runId: string | null }
  | {
      type: 'place_new_labware'
      labware: Labware
      location: PlacementLocation
      orientation: LabwareOrientation
    }
  | {
      type: 'move_placement'
      placementId: string
      location: PlacementLocation
      orientation: LabwareOrientation
      // If location is a slot, displace any existing occupant to the lawn.
      displaceTo?: { xMm: number; yMm: number }
    }
  | { type: 'remove_placement'; placementId: string }
  | { type: 'set_focus'; placementId: string | null }
  | { type: 'set_selection'; selection: WellSelection | null }
  | { type: 'append_event'; event: PlateEvent }
  | { type: 'set_tip'; tipState: TipState }
  | { type: 'dispense_commit'; destLabwareId: string; destWells: WellId[] }

const DEFAULT_PLATFORM_ID = 'opentrons_flex'

const initialState: EventEditorState = {
  loadState: 'idle',
  loadError: null,
  platforms: [],
  platformId: DEFAULT_PLATFORM_ID,
  variantId: '',
  vocabPackId: 'liquid-handling/v1',
  toolTypeId: null,
  assistPipetteId: null,
  runId: null,
  labwares: {},
  placements: [],
  focusPlacementId: null,
  selection: null,
  events: [],
  tipState: { kind: 'empty' },
}

function pickDefaultsForPlatform(
  platforms: PlatformManifest[],
  platformId: string,
): { variantId: string; vocabPackId: string; toolTypeId: string | null } {
  const manifest = getPlatformManifest(platforms, platformId)
  const variantId = defaultVariantForPlatform(platforms, platformId)
  const vocabPackId = manifest?.allowedVocabIds[0] ?? 'liquid-handling/v1'
  const toolTypeId = manifest?.toolTypeIds[0] ?? null
  return { variantId, vocabPackId, toolTypeId }
}

let placementIdCounter = 0
function nextPlacementId(): string {
  placementIdCounter += 1
  return `pl-${Date.now().toString(36)}-${placementIdCounter.toString(36)}`
}

function findPlacementAtSlot(
  placements: EventEditorPlacement[],
  slotId: string,
): EventEditorPlacement | null {
  return placements.find((p) => p.location.kind === 'slot' && p.location.slotId === slotId) ?? null
}

function reducer(state: EventEditorState, action: Action): EventEditorState {
  switch (action.type) {
    case 'load_start':
      return { ...state, loadState: 'loading', loadError: null }
    case 'load_error':
      return { ...state, loadState: 'error', loadError: action.error }
    case 'load_success': {
      const platforms = action.platforms
      const fallbackPlatformId =
        platforms.find((p) => p.id === DEFAULT_PLATFORM_ID)?.id ?? platforms[0]?.id ?? DEFAULT_PLATFORM_ID
      const platformId = action.initialPlatformId ?? fallbackPlatformId
      const defaults = pickDefaultsForPlatform(platforms, platformId)
      return {
        ...state,
        loadState: 'ready',
        loadError: null,
        platforms,
        platformId,
        variantId: defaults.variantId,
        vocabPackId: defaults.vocabPackId,
        toolTypeId: defaults.toolTypeId,
        assistPipetteId: null,
      }
    }
    case 'set_platform': {
      if (action.platformId === state.platformId) return state
      const defaults = pickDefaultsForPlatform(state.platforms, action.platformId)
      // Switching platforms wipes placements — slot IDs aren't comparable across decks.
      return {
        ...state,
        platformId: action.platformId,
        variantId: defaults.variantId,
        vocabPackId: defaults.vocabPackId,
        toolTypeId: defaults.toolTypeId,
        assistPipetteId: null,
        labwares: {},
        placements: [],
        focusPlacementId: null,
        selection: null,
        events: [],
        tipState: { kind: 'empty' },
      }
    }
    case 'set_variant':
      // Variant change keeps labwares but drops slot placements that no longer exist.
      // We don't know the new variant's slots here, so the DeckStage will reconcile —
      // for now, keep placements; orphaned ones simply won't render.
      return { ...state, variantId: action.variantId }
    case 'set_vocab':
      return { ...state, vocabPackId: action.vocabPackId }
    case 'set_tool':
      return {
        ...state,
        toolTypeId: action.toolTypeId,
        assistPipetteId: action.assistPipetteId,
      }
    case 'set_run':
      return { ...state, runId: action.runId }
    case 'place_new_labware': {
      const placement: EventEditorPlacement = {
        placementId: nextPlacementId(),
        labwareId: action.labware.labwareId,
        location: action.location,
        orientation: action.orientation,
      }
      // If dropping onto an occupied slot, displace the existing occupant to the lawn.
      let placements = state.placements
      if (action.location.kind === 'slot') {
        const existing = findPlacementAtSlot(placements, action.location.slotId)
        if (existing) {
          placements = placements.map((p) =>
            p.placementId === existing.placementId
              ? { ...p, location: { kind: 'lawn', xMm: 20, yMm: 20 } }
              : p,
          )
        }
      }
      return {
        ...state,
        labwares: { ...state.labwares, [action.labware.labwareId]: action.labware },
        placements: [...placements, placement],
      }
    }
    case 'move_placement': {
      const moving = state.placements.find((p) => p.placementId === action.placementId)
      if (!moving) return state
      let placements = state.placements

      if (action.location.kind === 'slot') {
        const occupant = findPlacementAtSlot(placements, action.location.slotId)
        if (occupant && occupant.placementId !== action.placementId) {
          // Swap: occupant goes to displaceTo (lawn) or to moving's previous slot if it was a slot.
          const occupantNextLocation: PlacementLocation =
            moving.location.kind === 'slot'
              ? { kind: 'slot', slotId: moving.location.slotId }
              : action.displaceTo
                ? { kind: 'lawn', xMm: action.displaceTo.xMm, yMm: action.displaceTo.yMm }
                : { kind: 'lawn', xMm: 20, yMm: 20 }
          placements = placements.map((p) =>
            p.placementId === occupant.placementId
              ? { ...p, location: occupantNextLocation }
              : p,
          )
        }
      }
      placements = placements.map((p) =>
        p.placementId === action.placementId
          ? { ...p, location: action.location, orientation: action.orientation }
          : p,
      )
      return { ...state, placements }
    }
    case 'remove_placement': {
      const target = state.placements.find((p) => p.placementId === action.placementId)
      if (!target) return state
      const placements = state.placements.filter((p) => p.placementId !== action.placementId)
      const stillReferenced = placements.some((p) => p.labwareId === target.labwareId)
      const labwares = { ...state.labwares }
      if (!stillReferenced) delete labwares[target.labwareId]
      const focusPlacementId = state.focusPlacementId === action.placementId ? null : state.focusPlacementId
      return { ...state, placements, labwares, focusPlacementId }
    }
    case 'set_focus': {
      // Drop selection when focus changes — selection is labware-scoped and a
      // different focus means a different (or no) labware.
      const focusedPlacement = action.placementId
        ? state.placements.find((p) => p.placementId === action.placementId)
        : null
      const focusedLabwareId = focusedPlacement?.labwareId ?? null
      const keepSelection =
        state.selection !== null &&
        focusedLabwareId !== null &&
        state.selection.labwareId === focusedLabwareId
      return {
        ...state,
        focusPlacementId: action.placementId,
        selection: keepSelection ? state.selection : null,
      }
    }
    case 'set_selection':
      return { ...state, selection: action.selection }
    case 'append_event':
      return { ...state, events: [...state.events, action.event] }
    case 'set_tip':
      return { ...state, tipState: action.tipState }
    case 'dispense_commit': {
      const tip = state.tipState
      if (tip.kind !== 'loaded') return state
      const transferEvent: PlateEvent = {
        eventId: generateEventId(),
        event_type: 'transfer',
        details: {
          source_labwareId: tip.sourceLabwareId,
          source_wells: tip.sourceWells,
          dest_labwareId: action.destLabwareId,
          dest_wells: action.destWells,
          volume: { value: tip.volume_uL, unit: 'uL' },
        },
      }
      return {
        ...state,
        events: [...state.events, transferEvent],
        tipState: { kind: 'empty' },
      }
    }
    default:
      return state
  }
}

export interface EventEditorActions {
  setPlatform: (platformId: string) => void
  setVariant: (variantId: string) => void
  setVocab: (vocabPackId: string) => void
  setTool: (selection: { toolTypeId: string | null; assistPipetteId?: string | null }) => void
  placeNewLabware: (
    labware: Labware,
    location: PlacementLocation,
    orientation: LabwareOrientation,
  ) => void
  movePlacement: (
    placementId: string,
    location: PlacementLocation,
    orientation: LabwareOrientation,
  ) => void
  removePlacement: (placementId: string) => void
  setFocus: (placementId: string | null) => void
  setSelection: (selection: WellSelection | null) => void
  clearSelection: () => void
  applyAddMaterial: (input: {
    labwareId: string
    wells: WellId[]
    materialRef: string
    volume_uL: number
  }) => void
  applyAspirate: (input: {
    labwareId: string
    wells: WellId[]
    volume_uL: number
    sourceLabel: string
  }) => void
  applyDispense: (input: {
    destLabwareId: string
    destWells: WellId[]
  }) => void
  clearTip: () => void
  appendEvent: (event: PlateEvent) => void
}

interface ContextValue {
  state: EventEditorState
  actions: EventEditorActions
}

const EventEditorContext = createContext<ContextValue | null>(null)

interface ProviderProps {
  runId?: string
  children: ReactNode
}

export function EventEditorProvider({ runId, children }: ProviderProps) {
  const [state, dispatch] = useReducer(reducer, initialState)

  useEffect(() => {
    let cancelled = false
    dispatch({ type: 'load_start' })
    apiClient
      .getPlatforms()
      .then((platforms) => {
        if (cancelled) return
        dispatch({ type: 'load_success', platforms })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const message = error instanceof Error ? error.message : String(error)
        dispatch({ type: 'load_error', error: message })
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    dispatch({ type: 'set_run', runId: runId ?? null })
  }, [runId])

  const actions = useMemo<EventEditorActions>(
    () => ({
      setPlatform: (platformId) => dispatch({ type: 'set_platform', platformId }),
      setVariant: (variantId) => dispatch({ type: 'set_variant', variantId }),
      setVocab: (vocabPackId) => dispatch({ type: 'set_vocab', vocabPackId }),
      setTool: ({ toolTypeId, assistPipetteId }) =>
        dispatch({
          type: 'set_tool',
          toolTypeId,
          assistPipetteId: assistPipetteId ?? null,
        }),
      placeNewLabware: (labware, location, orientation) =>
        dispatch({ type: 'place_new_labware', labware, location, orientation }),
      movePlacement: (placementId, location, orientation) =>
        dispatch({ type: 'move_placement', placementId, location, orientation }),
      removePlacement: (placementId) => dispatch({ type: 'remove_placement', placementId }),
      setFocus: (placementId) => dispatch({ type: 'set_focus', placementId }),
      setSelection: (selection) => dispatch({ type: 'set_selection', selection }),
      clearSelection: () => dispatch({ type: 'set_selection', selection: null }),
      appendEvent: (event) => dispatch({ type: 'append_event', event }),
      applyAddMaterial: ({ labwareId, wells, materialRef, volume_uL }) => {
        dispatch({
          type: 'append_event',
          event: {
            eventId: generateEventId(),
            event_type: 'add_material',
            details: {
              labwareId,
              wells,
              material_ref: materialRef,
              volume: { value: volume_uL, unit: 'uL' },
            },
          },
        })
      },
      applyAspirate: ({ labwareId, wells, volume_uL, sourceLabel }) => {
        dispatch({
          type: 'set_tip',
          tipState: {
            kind: 'loaded',
            sourceLabwareId: labwareId,
            sourceWells: wells,
            volume_uL,
            sourceLabel,
          },
        })
      },
      applyDispense: ({ destLabwareId, destWells }) =>
        dispatch({ type: 'dispense_commit', destLabwareId, destWells }),
      clearTip: () => dispatch({ type: 'set_tip', tipState: { kind: 'empty' } }),
    }),
    [],
  )

  const value = useMemo<ContextValue>(() => ({ state, actions }), [state, actions])

  return <EventEditorContext.Provider value={value}>{children}</EventEditorContext.Provider>
}

export function useEventEditor(): ContextValue {
  const ctx = useContext(EventEditorContext)
  if (!ctx) {
    throw new Error('useEventEditor must be used inside <EventEditorProvider>')
  }
  return ctx
}
