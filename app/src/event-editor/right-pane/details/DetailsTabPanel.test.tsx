/**
 * DetailsTabPanel tests — Phase 13. The tab surfaces the per-plate
 * workflow rail (Materials / Groups / Notes / Read) inside the right
 * pane. Two render gates:
 *
 *   - active workspace tab must be a deck → otherwise placeholder
 *   - a placement must be focused → otherwise placeholder
 *
 * The PlateRail and FocusModalsProvider are mocked so the test exercises
 * only the gate logic and the placement-id wiring; PlateRail's own
 * sections (and the modal lifecycle) have their own dedicated tests.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { WorkspaceProvider } from '../../workspace/WorkspaceContext'
import {
  defaultWorkspaceState,
  type WorkspaceState,
  type WorkspaceTab,
} from '../../workspace/types'

// Hold a mutable handle so individual tests can override the focus state
// the panel sees on render.
const focusRef: {
  focusPlacementId: string | null
  placements: Array<{ placementId: string; labwareId: string }>
  selection: { labwareId: string; wells: string[] } | null
} = {
  focusPlacementId: null,
  placements: [],
  selection: null,
}

vi.mock('../../EventEditorContext', () => ({
  useEventEditor: () => ({
    state: {
      focusPlacementId: focusRef.focusPlacementId,
      placements: focusRef.placements,
      selection: focusRef.selection,
    },
  }),
}))

const openAddMaterialSpy = vi.fn()
vi.mock('../../focus/FocusModalsProvider', () => ({
  useFocusModals: () => ({ openAddMaterial: openAddMaterialSpy }),
}))

vi.mock('../../rail/PlateRail', () => ({
  PlateRail: (props: {
    placementId: string
    selectedWells: string[]
    onAddMaterial: (wells: string[]) => void
  }) => (
    <div data-testid="plate-rail-mock">
      <span data-testid="plate-rail-placement-id">{props.placementId}</span>
      <span data-testid="plate-rail-selected">
        {props.selectedWells.join(',')}
      </span>
      <button
        type="button"
        data-testid="plate-rail-add-material"
        onClick={() => props.onAddMaterial(['A1', 'A2'])}
      >
        add material
      </button>
    </div>
  ),
}))

import { DetailsTabPanel } from './DetailsTabPanel'

function renderPanel(stateOverrides: Partial<WorkspaceState> = {}) {
  const base = defaultWorkspaceState('STU-000001')
  const state: WorkspaceState = { ...base, ...stateOverrides }
  return render(
    <MemoryRouter>
      <WorkspaceProvider
        studyId="STU-000001"
        saveDebounceMs={0}
        loadFn={async () => ({ state })}
        saveFn={async (_id, s) => ({ state: s })}
      >
        <DetailsTabPanel />
      </WorkspaceProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  openAddMaterialSpy.mockClear()
  focusRef.focusPlacementId = null
  focusRef.placements = []
  focusRef.selection = null
})

describe('DetailsTabPanel', () => {
  it('renders the not-a-deck placeholder when the active tab is project-details', async () => {
    // defaultWorkspaceState seeds a project-details tab as the active
    // one — no deck in sight, no plate to detail.
    renderPanel()
    await screen.findByTestId('details-tab')
    expect(screen.getByText('No plate open')).toBeTruthy()
    expect(screen.queryByTestId('plate-rail-mock')).toBeNull()
  })

  it('renders the no-focus placeholder when on a deck tab without a focused plate', async () => {
    const deckTab: WorkspaceTab = {
      id: 'deck-1',
      kind: 'deck',
      eventGraphId: 'eg-1',
      title: 'Deck',
    }
    focusRef.focusPlacementId = null
    renderPanel({
      tabs: [deckTab],
      activeTabId: 'deck-1',
    })
    await screen.findByTestId('details-tab')
    expect(screen.getByText('No plate focused')).toBeTruthy()
    expect(screen.queryByTestId('plate-rail-mock')).toBeNull()
  })

  it('renders the PlateRail with the focused placement id and selected wells', async () => {
    const deckTab: WorkspaceTab = {
      id: 'deck-1',
      kind: 'deck',
      eventGraphId: 'eg-1',
      title: 'Deck',
    }
    focusRef.focusPlacementId = 'pl-42'
    focusRef.placements = [{ placementId: 'pl-42', labwareId: 'lw-1' }]
    focusRef.selection = { labwareId: 'lw-1', wells: ['B3', 'B4'] }
    renderPanel({
      tabs: [deckTab],
      activeTabId: 'deck-1',
    })
    await screen.findByTestId('plate-rail-mock')
    expect(screen.getByTestId('plate-rail-placement-id').textContent).toBe(
      'pl-42',
    )
    expect(screen.getByTestId('plate-rail-selected').textContent).toBe(
      'B3,B4',
    )
  })

  it('omits selected wells when the selection is for a different labware', async () => {
    const deckTab: WorkspaceTab = {
      id: 'deck-1',
      kind: 'deck',
      eventGraphId: 'eg-1',
      title: 'Deck',
    }
    focusRef.focusPlacementId = 'pl-42'
    focusRef.placements = [{ placementId: 'pl-42', labwareId: 'lw-1' }]
    focusRef.selection = { labwareId: 'lw-2', wells: ['B3'] }
    renderPanel({
      tabs: [deckTab],
      activeTabId: 'deck-1',
    })
    await screen.findByTestId('plate-rail-mock')
    expect(screen.getByTestId('plate-rail-selected').textContent).toBe('')
  })

  it('Materials click reaches openAddMaterial via FocusModalsProvider', async () => {
    const deckTab: WorkspaceTab = {
      id: 'deck-1',
      kind: 'deck',
      eventGraphId: 'eg-1',
      title: 'Deck',
    }
    focusRef.focusPlacementId = 'pl-1'
    focusRef.placements = [{ placementId: 'pl-1', labwareId: 'lw-1' }]
    renderPanel({
      tabs: [deckTab],
      activeTabId: 'deck-1',
    })
    await screen.findByTestId('plate-rail-mock')
    fireEvent.click(screen.getByTestId('plate-rail-add-material'))
    expect(openAddMaterialSpy).toHaveBeenCalledWith(['A1', 'A2'])
  })
})
