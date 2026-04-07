/**
 * SelectionContext - React Context for managing well selection state.
 * Provides selection state and actions to all plate components.
 */

import { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react'
import type { WellId, SelectionState, SelectionAction, PlateConfig } from '../../types/plate'
import { expandWellRange } from '../utils/wellUtils'

/**
 * Selection context value
 */
interface SelectionContextValue {
  state: SelectionState
  // Actions
  selectWell: (wellId: WellId, mode: 'single' | 'add' | 'range') => void
  selectWells: (wellIds: WellId[]) => void
  deselectWell: (wellId: WellId) => void
  clearSelection: () => void
  highlightWells: (wellIds: WellId[]) => void
  clearHighlight: () => void
  // Helpers
  isSelected: (wellId: WellId) => boolean
  isHighlighted: (wellId: WellId) => boolean
  selectedCount: number
}

const SelectionContext = createContext<SelectionContextValue | null>(null)

/**
 * Initial selection state
 */
const initialState: SelectionState = {
  selectedWells: new Set(),
  highlightedWells: new Set(),
  lastClickedWell: null,
}

/**
 * Selection reducer - handles all selection state changes
 */
function selectionReducer(
  state: SelectionState,
  action: SelectionAction & { plateConfig?: PlateConfig }
): SelectionState {
  switch (action.type) {
    case 'SELECT_WELL': {
      const { wellId, mode } = action
      const newSelected = new Set(state.selectedWells)

      if (mode === 'single') {
        // Single click: replace selection
        newSelected.clear()
        newSelected.add(wellId)
      } else if (mode === 'add') {
        // Ctrl+click: toggle well in selection
        if (newSelected.has(wellId)) {
          newSelected.delete(wellId)
        } else {
          newSelected.add(wellId)
        }
      } else if (mode === 'range' && state.lastClickedWell && action.plateConfig) {
        // Shift+click: select rectangle from last clicked to current
        const rangeWells = expandWellRange(state.lastClickedWell, wellId, action.plateConfig)
        rangeWells.forEach(w => newSelected.add(w))
      }

      return {
        ...state,
        selectedWells: newSelected,
        lastClickedWell: wellId,
      }
    }

    case 'SELECT_WELLS': {
      const newSelected = new Set(action.wellIds)
      return {
        ...state,
        selectedWells: newSelected,
        lastClickedWell: action.wellIds[action.wellIds.length - 1] ?? null,
      }
    }

    case 'DESELECT_WELL': {
      const newSelected = new Set(state.selectedWells)
      newSelected.delete(action.wellId)
      return {
        ...state,
        selectedWells: newSelected,
      }
    }

    case 'CLEAR_SELECTION':
      return {
        ...state,
        selectedWells: new Set(),
        lastClickedWell: null,
      }

    case 'HIGHLIGHT_WELLS':
      return {
        ...state,
        highlightedWells: new Set(action.wellIds),
      }

    case 'CLEAR_HIGHLIGHT':
      return {
        ...state,
        highlightedWells: new Set(),
      }

    default:
      return state
  }
}

/**
 * Props for SelectionProvider
 */
interface SelectionProviderProps {
  children: ReactNode
  plateConfig: PlateConfig
}

/**
 * SelectionProvider - Provides selection context to children
 */
export function SelectionProvider({ children, plateConfig }: SelectionProviderProps) {
  const [state, dispatch] = useReducer(selectionReducer, initialState)

  const selectWell = useCallback(
    (wellId: WellId, mode: 'single' | 'add' | 'range') => {
      dispatch({ type: 'SELECT_WELL', wellId, mode, plateConfig })
    },
    [plateConfig]
  )

  const selectWells = useCallback((wellIds: WellId[]) => {
    dispatch({ type: 'SELECT_WELLS', wellIds })
  }, [])

  const deselectWell = useCallback((wellId: WellId) => {
    dispatch({ type: 'DESELECT_WELL', wellId })
  }, [])

  const clearSelection = useCallback(() => {
    dispatch({ type: 'CLEAR_SELECTION' })
  }, [])

  const highlightWells = useCallback((wellIds: WellId[]) => {
    dispatch({ type: 'HIGHLIGHT_WELLS', wellIds })
  }, [])

  const clearHighlight = useCallback(() => {
    dispatch({ type: 'CLEAR_HIGHLIGHT' })
  }, [])

  const isSelected = useCallback(
    (wellId: WellId) => state.selectedWells.has(wellId),
    [state.selectedWells]
  )

  const isHighlighted = useCallback(
    (wellId: WellId) => state.highlightedWells.has(wellId),
    [state.highlightedWells]
  )

  const value: SelectionContextValue = {
    state,
    selectWell,
    selectWells,
    deselectWell,
    clearSelection,
    highlightWells,
    clearHighlight,
    isSelected,
    isHighlighted,
    selectedCount: state.selectedWells.size,
  }

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  )
}

/**
 * Hook to access selection context
 */
export function useSelection(): SelectionContextValue {
  const context = useContext(SelectionContext)
  if (!context) {
    throw new Error('useSelection must be used within a SelectionProvider')
  }
  return context
}
