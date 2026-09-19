import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventEditorState } from '../EventEditorContext'
import type { Labware } from '../../types/labware'
import { createLabware } from '../../types/labware'
import { EMPTY_HISTORY } from '../editorHistory'
import { LabwareFocus } from './LabwareFocus'

/**
 * The zoomed-in plate is the only surface that carries the well context menu.
 * These cover the three routes into it, because the regression that lost the
 * menu was a discoverability one: with the header toolbar gone, a right-click
 * that missed a well fell through to the browser's own menu and the plate
 * appeared to have no actions at all.
 */

const mocks = vi.hoisted(() => ({
  state: null as EventEditorState | null,
  actions: {
    setFocus: vi.fn(),
    clearSelection: vi.fn(),
    setSelection: vi.fn(),
    appendEvent: vi.fn(),
    movePlacement: vi.fn(),
  },
}))

vi.mock('../EventEditorContext', () => ({
  useEventEditor: () => ({ state: mocks.state, actions: mocks.actions }),
}))

vi.mock('./FocusModalsProvider', () => ({
  useFocusModals: () => ({ openAddMaterial: vi.fn() }),
}))

function makeState(overrides: Partial<EventEditorState> = {}): EventEditorState {
  return {
    loadState: 'ready',
    loadError: null,
    platforms: [],
    platformId: 'manual',
    variantId: 'manual_freeform',
    vocabPackId: 'liquid-handling/v1',
    toolTypeId: null,
    assistPipetteId: null,
    runId: null,
    runDeck: null,
    eventGraphId: null,
    eventGraphSave: null,
    labwares: {},
    equipments: {},
    placements: [],
    focusPlacementId: null,
    selection: null,
    events: [],
    tipState: { kind: 'empty' },
    preview: null,
    graphLemurSource: null,
    fixIt: {
      isOpen: false,
      seed: null,
      chat: [],
      streaming: false,
      stage: 'chatting',
      error: null,
      spec: null,
      applyStage: null,
      applyProgress: [],
      applyReasoning: '',
      applyResult: null,
      fixHistory: [],
      pendingRetryPrompt: null,
    },
    plateRail: {},
    history: EMPTY_HISTORY,
    ...overrides,
  }
}

function plateFixture(): Labware {
  return createLabware('plate_96', 'plate1')
}

/** Focused plate with wells A1/A2 already selected. */
function focusedPlate(plate: Labware, selection: EventEditorState['selection']): EventEditorState {
  return makeState({
    focusPlacementId: 'pl-1',
    labwares: { [plate.labwareId]: plate },
    placements: [{
      placementId: 'pl-1',
      labwareId: plate.labwareId,
      location: { kind: 'lawn', xMm: 10, yMm: 10 },
      orientation: 'landscape',
    }],
    selection,
  })
}

function openMenu(): HTMLElement | null {
  return screen.queryByRole('menu')
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

beforeEach(() => {
  mocks.state = null
  for (const fn of Object.values(mocks.actions)) fn.mockReset()
  if (typeof (globalThis as Record<string, unknown>).ResizeObserver !== 'function') {
    ;(globalThis as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      disconnect() {}
    }
  }
  // jsdom has no layout, so the point-based hit test can't resolve anything —
  // which is exactly the "missed the well" case these tests care about.
  document.elementFromPoint = () => null
})

describe('LabwareFocus — plate context menu', () => {
  it('offers the well actions when the plate is right-clicked with a selection standing', async () => {
    const plate = plateFixture()
    mocks.state = focusedPlate(plate, { labwareId: plate.labwareId, wells: ['A1', 'A2'], anchor: 'A1' })

    render(<LabwareFocus />)
    await waitFor(() => expect(document.querySelector('.well-grid')).toBeTruthy())

    // Right-click the stage itself — not a well. This is the near-miss that
    // used to open the browser menu instead.
    fireEvent.contextMenu(document.querySelector('.focus__stage')!, { clientX: 20, clientY: 20 })

    const menu = openMenu()
    expect(menu).toBeTruthy()
    const text = menu!.textContent ?? ''
    expect(text).toContain('2 wells')
    expect(text).toContain('Add material to all')
    // Plate-level actions still lead.
    expect(text).toContain('Rotate')
    expect(text).toContain('Read plate')
  })

  it('falls back to a plate-scoped menu when nothing is selected', async () => {
    const plate = plateFixture()
    mocks.state = focusedPlate(plate, null)

    render(<LabwareFocus />)
    await waitFor(() => expect(document.querySelector('.well-grid')).toBeTruthy())

    fireEvent.contextMenu(document.querySelector('.focus__stage')!, { clientX: 20, clientY: 20 })

    const menu = openMenu()
    expect(menu).toBeTruthy()
    const text = menu!.textContent ?? ''
    expect(text).toContain('Rotate')
    expect(text).toContain('Read plate')
    // No wells to act on ⇒ no well entries, and never a fabricated well title.
    expect(text).not.toContain('Add material')
    expect(text).not.toContain('Aspirate')
    expect(text).not.toContain('undefined')
    expect(text).toContain('plate1')
  })

  it('right-clicking a well acts on that well', async () => {
    const plate = plateFixture()
    mocks.state = focusedPlate(plate, null)

    render(<LabwareFocus />)
    await waitFor(() => expect(document.querySelector('.well-grid')).toBeTruthy())

    const well = document.querySelector('[data-well-id="A1"]')!
    fireEvent.contextMenu(well, { clientX: 30, clientY: 30 })

    const menu = openMenu()
    expect(menu).toBeTruthy()
    const text = menu!.textContent ?? ''
    expect(text).toContain('Well A1')
    expect(text).toContain('Add material')
  })

  it('the header Actions button opens the menu for the current selection', async () => {
    const plate = plateFixture()
    mocks.state = focusedPlate(plate, { labwareId: plate.labwareId, wells: ['A1'], anchor: 'A1' })

    render(<LabwareFocus />)
    await waitFor(() => expect(document.querySelector('.well-grid')).toBeTruthy())

    const button = screen.getByTestId('focus-actions') as HTMLButtonElement
    expect(button.disabled).toBe(false)
    expect(button.textContent).toContain('Actions')
    fireEvent.click(button)

    const menu = openMenu()
    expect(menu).toBeTruthy()
    expect(menu!.textContent).toContain('Well A1')
    expect(menu!.textContent).toContain('Add material')
  })

  it('disables the Actions button with nothing selected', async () => {
    const plate = plateFixture()
    mocks.state = focusedPlate(plate, null)

    render(<LabwareFocus />)
    await waitFor(() => expect(document.querySelector('.well-grid')).toBeTruthy())

    expect((screen.getByTestId('focus-actions') as HTMLButtonElement).disabled).toBe(true)
  })
})
