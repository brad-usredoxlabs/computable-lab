/**
 * FocusModalsProvider — host for cross-pane modal coordination on a
 * focused plate. Phase 13 moved the PlateRail out of LabwareFocus and
 * into a right-pane Details tab, so the "Add material" flow has two
 * call sites (the left pane's well context menu, the right pane's
 * Materials section) that both need to open the same modal instance.
 *
 * The provider hosts the modal once and exposes `openAddMaterial(wells)`
 * via context. The modal's `labware` is derived from
 * `state.focusPlacementId` in EventEditorContext, so it always targets
 * the plate the user is currently focused on.
 *
 * Mount inside `EventEditorProvider` (only the deck-tab arm in
 * `ProjectWorkspacePage`). Outside that arm, the deck workflow isn't
 * relevant.
 */

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useEventEditor } from '../EventEditorContext'
import { AddMaterialModal } from '../material/AddMaterialModal'
import type { WellId } from '../../types/plate'

interface FocusModalsValue {
  /** Open AddMaterialModal targeting the focused plate's labware. */
  openAddMaterial: (wells: WellId[]) => void
}

const FocusModalsContext = createContext<FocusModalsValue | null>(null)

export function FocusModalsProvider({ children }: { children: ReactNode }) {
  const { state } = useEventEditor()
  const [addMaterialWells, setAddMaterialWells] = useState<WellId[] | null>(
    null,
  )

  const value = useMemo<FocusModalsValue>(
    () => ({
      openAddMaterial: (wells) => setAddMaterialWells(wells),
    }),
    [],
  )

  // Resolve the labware backing the currently-focused placement. The
  // modal only renders when a focus is active AND the consumer has
  // requested to open it; both gates protect against a stale call from
  // a pane that has since lost focus.
  const focusedLabware = (() => {
    if (!state.focusPlacementId) return null
    const placement = state.placements.find(
      (p) => p.placementId === state.focusPlacementId,
    )
    if (!placement) return null
    return state.labwares[placement.labwareId] ?? null
  })()

  return (
    <FocusModalsContext.Provider value={value}>
      {children}
      {focusedLabware ? (
        <AddMaterialModal
          isOpen={addMaterialWells !== null}
          labware={focusedLabware}
          wells={addMaterialWells ?? []}
          onClose={() => setAddMaterialWells(null)}
        />
      ) : null}
    </FocusModalsContext.Provider>
  )
}

export function useFocusModals(): FocusModalsValue {
  const value = useContext(FocusModalsContext)
  if (!value) {
    throw new Error(
      'useFocusModals must be called inside <FocusModalsProvider>. ' +
        'In Phase 13 the provider wraps the deck-tab branch of ' +
        'ProjectWorkspacePage; calling this from a non-deck context ' +
        'is a wiring bug.',
    )
  }
  return value
}

/**
 * Non-throwing variant for callers that may render outside the
 * provider — e.g. PlateRail's MaterialsRailSection mounted from the
 * Details tab when the active workspace tab isn't a deck. Returns a
 * no-op so the section renders disabled rather than crashing.
 */
export function useOptionalFocusModals(): FocusModalsValue {
  return (
    useContext(FocusModalsContext) ?? {
      openAddMaterial: () => undefined,
    }
  )
}

