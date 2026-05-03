/**
 * LabwareEditorContext - State management for multi-labware event editor.
 * 
 * Manages:
 * - Multiple labware instances
 * - Well selection across labwares
 * - Event list
 * - Active labware focus
 */

import { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react'
import type { WellId } from '../../types/plate'
import type { PlateEvent } from '../../types/events'
import type { Labware, LabwareType, LabwareRecordPayload } from '../../types/labware'
import {
  clampLabwareOrientation,
  createLabware,
  getLabwareDefaultOrientation,
  labwareRecordToEditorLabware,
  normalizeLabwareWithDefinition,
} from '../../types/labware'

export type LabwareOrientation = 'portrait' | 'landscape'

interface LabwarePose {
  orientation: LabwareOrientation
}

/**
 * Selection state for a single labware
 */
interface LabwareSelection {
  selectedWells: Set<WellId>
  highlightedWells: Set<WellId>
  lastClickedWell: WellId | null
}

/**
 * Pane role for dual-pane layout
 */
export type PaneRole = 'source' | 'target' | 'none'

/**
 * Editor state
 */
export interface LabwareEditorState {
  /** All labwares in the editor */
  labwares: Map<string, Labware>
  /** Currently active/focused labware */
  activeLabwareId: string | null
  /** Selection state per labware */
  selections: Map<string, LabwareSelection>
  /** Per-labware pose (view orientation) */
  labwarePoses: Map<string, LabwarePose>
  /** All events in the event graph */
  events: PlateEvent[]
  /** Currently selected event */
  selectedEventId: string | null
  /** Event being edited */
  editingEventId: string | null
  /** Whether there are unsaved changes */
  isDirty: boolean
  
  // Dual-pane layout state
  /** Labware shown in the source (left) pane */
  sourceLabwareId: string | null
  /** Labware shown in the target (right) pane */
  targetLabwareId: string | null
}

/**
 * Editor actions
 */
export type LabwareEditorAction =
  // Labware actions
  | { type: 'ADD_LABWARE'; labware: Labware }
  | { type: 'REMOVE_LABWARE'; labwareId: string }
  | { type: 'UPDATE_LABWARE'; labwareId: string; updates: Partial<Labware> }
  | { type: 'SET_ACTIVE_LABWARE'; labwareId: string | null }
  // Selection actions
  | { type: 'SELECT_WELLS'; labwareId: string; wells: WellId[]; mode: 'replace' | 'add' | 'toggle' }
  | { type: 'CLEAR_LABWARE_SELECTION'; labwareId: string }
  | { type: 'CLEAR_ALL_SELECTION' }
  | { type: 'HIGHLIGHT_WELLS'; labwareId: string; wells: WellId[] }
  | { type: 'CLEAR_HIGHLIGHT'; labwareId?: string }
  // Event actions
  | { type: 'ADD_EVENT'; event: PlateEvent }
  | { type: 'UPDATE_EVENT'; event: PlateEvent }
  | { type: 'DELETE_EVENT'; eventId: string }
  | { type: 'REORDER_EVENTS'; events: PlateEvent[] }
  | { type: 'SELECT_EVENT'; eventId: string | null }
  | { type: 'EDIT_EVENT'; eventId: string | null }
  // Dual-pane actions
  | { type: 'SET_SOURCE_LABWARE'; labwareId: string | null }
  | { type: 'SET_TARGET_LABWARE'; labwareId: string | null }
  | { type: 'SWAP_SOURCE_TARGET' }
  | { type: 'SET_LABWARE_PANE_ROLE'; labwareId: string; role: PaneRole }
  | { type: 'SET_LABWARE_ORIENTATION'; labwareId: string; orientation: LabwareOrientation }
  | { type: 'ROTATE_LABWARE'; labwareId: string }
  // State actions
  | { type: 'MARK_CLEAN' }
  | { type: 'RESET_EDITOR' }
  | { type: 'LOAD_STATE'; state: Partial<LabwareEditorState> }

/**
 * Initial selection state for a labware
 */
function createEmptySelection(): LabwareSelection {
  return {
    selectedWells: new Set(),
    highlightedWells: new Set(),
    lastClickedWell: null,
  }
}

/**
 * Initial editor state
 */
const initialState: LabwareEditorState = {
  labwares: new Map(),
  activeLabwareId: null,
  selections: new Map(),
  labwarePoses: new Map(),
  events: [],
  selectedEventId: null,
  editingEventId: null,
  isDirty: false,
  sourceLabwareId: null,
  targetLabwareId: null,
}

/**
 * Reducer for editor state
 */
function editorReducer(state: LabwareEditorState, action: LabwareEditorAction): LabwareEditorState {
  switch (action.type) {
    // === Labware actions ===
    case 'ADD_LABWARE': {
      const normalizedLabware = normalizeLabwareWithDefinition(action.labware)
      const newLabwares = new Map(state.labwares)
      newLabwares.set(normalizedLabware.labwareId, normalizedLabware)
      
      const newSelections = new Map(state.selections)
      newSelections.set(normalizedLabware.labwareId, createEmptySelection())
      const newPoses = new Map(state.labwarePoses)
      newPoses.set(normalizedLabware.labwareId, {
        orientation: getLabwareDefaultOrientation(normalizedLabware),
      })
      
      return {
        ...state,
        labwares: newLabwares,
        selections: newSelections,
        labwarePoses: newPoses,
        activeLabwareId: state.activeLabwareId || normalizedLabware.labwareId,
        isDirty: true,
      }
    }

    case 'REMOVE_LABWARE': {
      const newLabwares = new Map(state.labwares)
      newLabwares.delete(action.labwareId)
      
      const newSelections = new Map(state.selections)
      newSelections.delete(action.labwareId)
      const newPoses = new Map(state.labwarePoses)
      newPoses.delete(action.labwareId)
      
      // Filter out events that reference this labware
      const newEvents = state.events.filter(e => {
        const details = e.details as Record<string, unknown>
        return details.labwareId !== action.labwareId &&
               details.source_labwareId !== action.labwareId &&
               details.dest_labwareId !== action.labwareId
      })
      
      return {
        ...state,
        labwares: newLabwares,
        selections: newSelections,
        labwarePoses: newPoses,
        events: newEvents,
        activeLabwareId: state.activeLabwareId === action.labwareId 
          ? (newLabwares.keys().next().value ?? null)
          : state.activeLabwareId,
        isDirty: true,
      }
    }

    case 'UPDATE_LABWARE': {
      const labware = state.labwares.get(action.labwareId)
      if (!labware) return state
      
      const newLabwares = new Map(state.labwares)
      newLabwares.set(action.labwareId, { ...labware, ...action.updates })
      
      return {
        ...state,
        labwares: newLabwares,
        isDirty: true,
      }
    }

    case 'SET_ACTIVE_LABWARE': {
      return {
        ...state,
        activeLabwareId: action.labwareId,
      }
    }

    // === Selection actions ===
    case 'SELECT_WELLS': {
      const selection = state.selections.get(action.labwareId) || createEmptySelection()
      let newSelected: Set<WellId>
      
      if (action.mode === 'replace') {
        newSelected = new Set(action.wells)
      } else if (action.mode === 'add') {
        newSelected = new Set([...selection.selectedWells, ...action.wells])
      } else { // toggle
        newSelected = new Set(selection.selectedWells)
        for (const well of action.wells) {
          if (newSelected.has(well)) {
            newSelected.delete(well)
          } else {
            newSelected.add(well)
          }
        }
      }
      
      const newSelections = new Map(state.selections)
      newSelections.set(action.labwareId, {
        ...selection,
        selectedWells: newSelected,
        lastClickedWell: action.wells[action.wells.length - 1] || null,
      })
      
      return {
        ...state,
        selections: newSelections,
        activeLabwareId: action.labwareId,
      }
    }

    case 'CLEAR_LABWARE_SELECTION': {
      const newSelections = new Map(state.selections)
      newSelections.set(action.labwareId, createEmptySelection())
      
      return {
        ...state,
        selections: newSelections,
      }
    }

    case 'CLEAR_ALL_SELECTION': {
      const newSelections = new Map<string, LabwareSelection>()
      for (const labwareId of state.labwares.keys()) {
        newSelections.set(labwareId, createEmptySelection())
      }
      
      return {
        ...state,
        selections: newSelections,
      }
    }

    case 'HIGHLIGHT_WELLS': {
      const selection = state.selections.get(action.labwareId) || createEmptySelection()
      
      const newSelections = new Map(state.selections)
      newSelections.set(action.labwareId, {
        ...selection,
        highlightedWells: new Set(action.wells),
      })
      
      return {
        ...state,
        selections: newSelections,
      }
    }

    case 'CLEAR_HIGHLIGHT': {
      if (action.labwareId) {
        const selection = state.selections.get(action.labwareId)
        if (!selection) return state
        
        const newSelections = new Map(state.selections)
        newSelections.set(action.labwareId, {
          ...selection,
          highlightedWells: new Set(),
        })
        
        return {
          ...state,
          selections: newSelections,
        }
      } else {
        // Clear all highlights
        const newSelections = new Map(state.selections)
        for (const [labwareId, selection] of newSelections) {
          newSelections.set(labwareId, {
            ...selection,
            highlightedWells: new Set(),
          })
        }
        
        return {
          ...state,
          selections: newSelections,
        }
      }
    }

    // === Event actions ===
    case 'ADD_EVENT': {
      if (state.events.some((event) => event.eventId === action.event.eventId)) {
        return state
      }
      return {
        ...state,
        events: [...state.events, action.event],
        isDirty: true,
      }
    }

    case 'UPDATE_EVENT': {
      return {
        ...state,
        events: state.events.map(e => 
          e.eventId === action.event.eventId ? action.event : e
        ),
        isDirty: true,
      }
    }

    case 'DELETE_EVENT': {
      return {
        ...state,
        events: state.events.filter(e => e.eventId !== action.eventId),
        selectedEventId: state.selectedEventId === action.eventId ? null : state.selectedEventId,
        editingEventId: state.editingEventId === action.eventId ? null : state.editingEventId,
        isDirty: true,
      }
    }

    case 'REORDER_EVENTS': {
      return {
        ...state,
        events: action.events,
        isDirty: true,
      }
    }

    case 'SELECT_EVENT': {
      return {
        ...state,
        selectedEventId: action.eventId,
      }
    }

    case 'EDIT_EVENT': {
      return {
        ...state,
        editingEventId: action.eventId,
      }
    }

    // === State actions ===
    case 'MARK_CLEAN': {
      return {
        ...state,
        isDirty: false,
      }
    }

    case 'RESET_EDITOR': {
      return initialState
    }

    case 'LOAD_STATE': {
      const loadedLabwares = action.state.labwares
      let normalizedLabwares = loadedLabwares
      if (loadedLabwares instanceof Map) {
        normalizedLabwares = new Map(
          Array.from(loadedLabwares.entries()).map(([id, labware]) => [
            id,
            normalizeLabwareWithDefinition(labware),
          ])
        )
      }
      const loadedPoses = action.state.labwarePoses
      let normalizedPoses = loadedPoses
      if (normalizedLabwares instanceof Map) {
        const poseMap = new Map<string, LabwarePose>()
        const inputPoses = loadedPoses instanceof Map ? loadedPoses : new Map<string, LabwarePose>()
        for (const [id, labware] of normalizedLabwares.entries()) {
          const requested = inputPoses.get(id)?.orientation || getLabwareDefaultOrientation(labware)
          poseMap.set(id, { orientation: clampLabwareOrientation(labware, requested) })
        }
        normalizedPoses = poseMap
      }
      return {
        ...state,
        ...action.state,
        ...(normalizedLabwares ? { labwares: normalizedLabwares } : {}),
        ...(normalizedPoses ? { labwarePoses: normalizedPoses } : {}),
        isDirty: typeof action.state.isDirty === 'boolean' ? action.state.isDirty : false,
      }
    }

    // === Dual-pane actions ===
    case 'SET_SOURCE_LABWARE': {
      // Allow same labware as both source and target for within-plate transfers
      return {
        ...state,
        sourceLabwareId: action.labwareId,
      }
    }

    case 'SET_TARGET_LABWARE': {
      // Allow same labware as both source and target for within-plate transfers
      return {
        ...state,
        targetLabwareId: action.labwareId,
      }
    }

    case 'SWAP_SOURCE_TARGET': {
      return {
        ...state,
        sourceLabwareId: state.targetLabwareId,
        targetLabwareId: state.sourceLabwareId,
      }
    }

    case 'SET_LABWARE_PANE_ROLE': {
      const { labwareId, role } = action
      if (role === 'source') {
        // Setting as source - clear if currently target
        return {
          ...state,
          sourceLabwareId: labwareId,
          targetLabwareId: state.targetLabwareId === labwareId ? null : state.targetLabwareId,
        }
      } else if (role === 'target') {
        // Setting as target - clear if currently source
        return {
          ...state,
          sourceLabwareId: state.sourceLabwareId === labwareId ? null : state.sourceLabwareId,
          targetLabwareId: labwareId,
        }
      } else {
        // Setting to none - clear from both if present
        return {
          ...state,
          sourceLabwareId: state.sourceLabwareId === labwareId ? null : state.sourceLabwareId,
          targetLabwareId: state.targetLabwareId === labwareId ? null : state.targetLabwareId,
        }
      }
    }

    case 'SET_LABWARE_ORIENTATION': {
      const labware = state.labwares.get(action.labwareId)
      if (!labware) return state
      const next = new Map(state.labwarePoses)
      const current = next.get(action.labwareId) || { orientation: 'landscape' as LabwareOrientation }
      next.set(action.labwareId, { ...current, orientation: clampLabwareOrientation(labware, action.orientation) })
      return {
        ...state,
        labwarePoses: next,
      }
    }

    case 'ROTATE_LABWARE': {
      const labware = state.labwares.get(action.labwareId)
      if (!labware) return state
      const next = new Map(state.labwarePoses)
      const current = next.get(action.labwareId) || { orientation: getLabwareDefaultOrientation(labware) }
      const toggled = current.orientation === 'portrait' ? 'landscape' : 'portrait'
      next.set(action.labwareId, {
        ...current,
        orientation: clampLabwareOrientation(labware, toggled),
      })
      return {
        ...state,
        labwarePoses: next,
      }
    }

    default:
      return state
  }
}

/**
 * Context value type
 */
interface LabwareEditorContextValue {
  state: LabwareEditorState
  dispatch: React.Dispatch<LabwareEditorAction>
  
  // Convenience methods
  addLabware: (labwareType: LabwareType, name?: string) => Labware
  addLabwareFromRecord: (record: LabwareRecordPayload) => Labware
  removeLabware: (labwareId: string) => void
  setActiveLabware: (labwareId: string | null) => void
  
  selectWells: (labwareId: string, wells: WellId[], mode?: 'replace' | 'add' | 'toggle') => void
  clearSelection: (labwareId?: string) => void
  highlightWells: (labwareId: string, wells: WellId[]) => void
  clearHighlight: (labwareId?: string) => void
  
  addEvent: (event: PlateEvent) => void
  updateEvent: (event: PlateEvent) => void
  deleteEvent: (eventId: string) => void
  selectEvent: (eventId: string | null) => void
  editEvent: (eventId: string | null) => void
  
  // Dual-pane methods
  setSourceLabware: (labwareId: string | null) => void
  setTargetLabware: (labwareId: string | null) => void
  swapSourceTarget: () => void
  setLabwarePaneRole: (labwareId: string, role: PaneRole) => void
  getLabwarePaneRole: (labwareId: string) => PaneRole
  getLabwareOrientation: (labwareId: string) => LabwareOrientation
  setLabwareOrientation: (labwareId: string, orientation: LabwareOrientation) => void
  rotateLabware: (labwareId: string) => void
  
  // Computed values
  activeLabware: Labware | null
  activeSelection: LabwareSelection | null
  selectedWellCount: number
  
  // Dual-pane computed values
  sourceLabware: Labware | null
  targetLabware: Labware | null
  sourceSelection: LabwareSelection | null
  targetSelection: LabwareSelection | null
}

const LabwareEditorContext = createContext<LabwareEditorContextValue | null>(null)

/**
 * Provider component
 */
export function LabwareEditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(editorReducer, initialState)
  
  // Convenience methods
  const addLabware = useCallback((labwareType: LabwareType, name?: string): Labware => {
    const labware = createLabware(labwareType, name)
    dispatch({ type: 'ADD_LABWARE', labware })
    return labware
  }, [])
  
  const addLabwareFromRecord = useCallback((record: LabwareRecordPayload): Labware => {
    const labware = labwareRecordToEditorLabware(record)
    dispatch({ type: 'ADD_LABWARE', labware })
    return labware
  }, [])
  
  const removeLabware = useCallback((labwareId: string) => {
    dispatch({ type: 'REMOVE_LABWARE', labwareId })
  }, [])
  
  const setActiveLabware = useCallback((labwareId: string | null) => {
    dispatch({ type: 'SET_ACTIVE_LABWARE', labwareId })
  }, [])
  
  const selectWells = useCallback((labwareId: string, wells: WellId[], mode: 'replace' | 'add' | 'toggle' = 'replace') => {
    dispatch({ type: 'SELECT_WELLS', labwareId, wells, mode })
  }, [])
  
  const clearSelection = useCallback((labwareId?: string) => {
    if (labwareId) {
      dispatch({ type: 'CLEAR_LABWARE_SELECTION', labwareId })
    } else {
      dispatch({ type: 'CLEAR_ALL_SELECTION' })
    }
  }, [])
  
  const highlightWells = useCallback((labwareId: string, wells: WellId[]) => {
    dispatch({ type: 'HIGHLIGHT_WELLS', labwareId, wells })
  }, [])
  
  const clearHighlight = useCallback((labwareId?: string) => {
    dispatch({ type: 'CLEAR_HIGHLIGHT', labwareId })
  }, [])
  
  const addEvent = useCallback((event: PlateEvent) => {
    dispatch({ type: 'ADD_EVENT', event })
  }, [])
  
  const updateEvent = useCallback((event: PlateEvent) => {
    dispatch({ type: 'UPDATE_EVENT', event })
  }, [])
  
  const deleteEvent = useCallback((eventId: string) => {
    dispatch({ type: 'DELETE_EVENT', eventId })
  }, [])
  
  const selectEvent = useCallback((eventId: string | null) => {
    dispatch({ type: 'SELECT_EVENT', eventId })
  }, [])
  
  const editEvent = useCallback((eventId: string | null) => {
    dispatch({ type: 'EDIT_EVENT', eventId })
  }, [])
  
  // Dual-pane methods
  const setSourceLabware = useCallback((labwareId: string | null) => {
    dispatch({ type: 'SET_SOURCE_LABWARE', labwareId })
  }, [])
  
  const setTargetLabware = useCallback((labwareId: string | null) => {
    dispatch({ type: 'SET_TARGET_LABWARE', labwareId })
  }, [])
  
  const swapSourceTarget = useCallback(() => {
    dispatch({ type: 'SWAP_SOURCE_TARGET' })
  }, [])
  
  const setLabwarePaneRole = useCallback((labwareId: string, role: PaneRole) => {
    dispatch({ type: 'SET_LABWARE_PANE_ROLE', labwareId, role })
  }, [])
  
  const getLabwareOrientation = useCallback((labwareId: string): LabwareOrientation => {
    const poseOrientation = state.labwarePoses.get(labwareId)?.orientation
    if (poseOrientation) return poseOrientation

    const labware = state.labwares.get(labwareId)
    if (!labware) return 'landscape'

    return getLabwareDefaultOrientation(labware)
  }, [state.labwarePoses, state.labwares])
  
  const setLabwareOrientation = useCallback((labwareId: string, orientation: LabwareOrientation) => {
    dispatch({ type: 'SET_LABWARE_ORIENTATION', labwareId, orientation })
  }, [])
  
  const rotateLabware = useCallback((labwareId: string) => {
    dispatch({ type: 'ROTATE_LABWARE', labwareId })
  }, [])
  
  const getLabwarePaneRole = useCallback((labwareId: string): PaneRole => {
    if (state.sourceLabwareId === labwareId) return 'source'
    if (state.targetLabwareId === labwareId) return 'target'
    return 'none'
  }, [state.sourceLabwareId, state.targetLabwareId])
  
  // Computed values
  const activeLabware = state.activeLabwareId 
    ? state.labwares.get(state.activeLabwareId) || null 
    : null
  
  const activeSelection = state.activeLabwareId 
    ? state.selections.get(state.activeLabwareId) || null 
    : null
  
  const selectedWellCount = activeSelection?.selectedWells.size || 0
  
  // Dual-pane computed values
  const sourceLabware = state.sourceLabwareId
    ? state.labwares.get(state.sourceLabwareId) || null
    : null
  
  const targetLabware = state.targetLabwareId
    ? state.labwares.get(state.targetLabwareId) || null
    : null
  
  const sourceSelection = state.sourceLabwareId
    ? state.selections.get(state.sourceLabwareId) || null
    : null
  
  const targetSelection = state.targetLabwareId
    ? state.selections.get(state.targetLabwareId) || null
    : null
  
  const value: LabwareEditorContextValue = {
    state,
    dispatch,
    addLabware,
    addLabwareFromRecord,
    removeLabware,
    setActiveLabware,
    selectWells,
    clearSelection,
    highlightWells,
    clearHighlight,
    addEvent,
    updateEvent,
    deleteEvent,
    selectEvent,
    editEvent,
    setSourceLabware,
    setTargetLabware,
    swapSourceTarget,
    setLabwarePaneRole,
    getLabwarePaneRole,
    getLabwareOrientation,
    setLabwareOrientation,
    rotateLabware,
    activeLabware,
    activeSelection,
    selectedWellCount,
    sourceLabware,
    targetLabware,
    sourceSelection,
    targetSelection,
  }
  
  return (
    <LabwareEditorContext.Provider value={value}>
      {children}
    </LabwareEditorContext.Provider>
  )
}

/**
 * Hook to use the editor context
 */
export function useLabwareEditor(): LabwareEditorContextValue {
  const context = useContext(LabwareEditorContext)
  if (!context) {
    throw new Error('useLabwareEditor must be used within a LabwareEditorProvider')
  }
  return context
}

export function useOptionalLabwareEditor(): LabwareEditorContextValue | null {
  return useContext(LabwareEditorContext)
}
