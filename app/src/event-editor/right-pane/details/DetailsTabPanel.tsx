/**
 * DetailsTabPanel — Phase 13. The single-plate workflow rail (Materials
 * / Groups / Notes / Read) moved out of the focused-plate left pane and
 * into the right pane as its own tab. The left pane now renders ONLY
 * the well grid; this tab owns the semantic layer attached to it.
 *
 * Render gates:
 *   1. Active workspace tab must be a deck — otherwise the well grid
 *      doesn't exist and the PlateRail has nothing to attach to.
 *   2. A placement must be focused (`state.focusPlacementId`) — the
 *      rail is per-plate state keyed by placement id.
 *
 * Both gates render a friendly placeholder rather than crashing or
 * showing an empty rail, mirroring the right-pane convention used by
 * AI/Find/Search tabs when their precondition isn't met.
 *
 * The component is split so the outer function can call `useWorkspace`
 * unconditionally; the inner deck-only function is mounted in a path
 * where `useEventEditor` / `useFocusModals` are guaranteed to resolve.
 */

import { useWorkspace } from '../../workspace/WorkspaceContext'
import { useEventEditor } from '../../EventEditorContext'
import { useFocusModals } from '../../focus/FocusModalsProvider'
import { PlateRail } from '../../rail/PlateRail'
import './details.css'

export function DetailsTabPanel() {
  const ws = useWorkspace()
  const activeTab = ws.state.activeTabId
    ? ws.state.tabs.find((t) => t.id === ws.state.activeTabId) ?? null
    : null

  if (activeTab?.kind !== 'deck') {
    return (
      <div className="right-panel details-tab" data-testid="details-tab">
        <div className="details-tab__placeholder">
          <h3>No plate open</h3>
          <p>
            Open an event-graph from the <strong>Find</strong> tab to see a
            deck. Click a plate on the deck to load its materials,
            groups, notes and readout setup here.
          </p>
        </div>
      </div>
    )
  }

  return <DetailsTabPanelDeck />
}

function DetailsTabPanelDeck() {
  const { state } = useEventEditor()
  const { openAddMaterial } = useFocusModals()

  if (!state.focusPlacementId) {
    return (
      <div className="right-panel details-tab" data-testid="details-tab">
        <div className="details-tab__placeholder">
          <h3>No plate focused</h3>
          <p>
            Click a plate on the deck to load its materials, groups,
            notes and readout setup here.
          </p>
        </div>
      </div>
    )
  }

  const placement = state.placements.find(
    (p) => p.placementId === state.focusPlacementId,
  )
  const labwareId = placement?.labwareId ?? null
  const selectedWells =
    labwareId && state.selection?.labwareId === labwareId
      ? state.selection.wells
      : []

  return (
    <div className="right-panel details-tab" data-testid="details-tab">
      <PlateRail
        placementId={state.focusPlacementId}
        selectedWells={selectedWells}
        onAddMaterial={openAddMaterial}
      />
    </div>
  )
}
