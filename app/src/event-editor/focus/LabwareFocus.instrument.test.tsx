import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventEditorState } from '../EventEditorContext'
import type { Labware } from '../../types/labware'
import { createLabware } from '../../types/labware'
import { EMPTY_HISTORY } from '../editorHistory'
import { LabwareFocus } from './LabwareFocus'

const mocks = vi.hoisted(() => ({
  state: null as EventEditorState | null,
  setFocus: vi.fn(),
  openAddMaterial: vi.fn(),
}))

vi.mock('../EventEditorContext', () => ({
  useEventEditor: () => ({
    state: mocks.state,
    actions: { setFocus: mocks.setFocus },
  }),
}))

vi.mock('./FocusModalsProvider', () => ({
  useFocusModals: () => ({ openAddMaterial: mocks.openAddMaterial }),
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
    eventGraphId: null,
    eventGraphSave: null,
    labwares: {},
    placements: [],
    focusPlacementId: null,
    selection: null,
    events: [],
    tipState: { kind: 'empty' },
    preview: null,
    graphLemurSource: null,
    runDeckLock: null,
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

function instrumentFixture(): Labware {
  const instrument = createLabware('instrument', 'Eppendorf ThermoMixer C')
  instrument.sourceRecordId = 'EQP-EPPENDORF-THERMOMIXER'
  instrument.notes = 'Imported from Exa equipment search'
  return instrument
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

beforeEach(() => {
  mocks.setFocus.mockReset()
  mocks.openAddMaterial.mockReset()
  if (typeof (globalThis as Record<string, unknown>).ResizeObserver !== 'function') {
    ;(globalThis as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      disconnect() {}
    }
  }
})

describe('LabwareFocus — instrument tap', () => {
  it('focusing an instrument shows an equipment detail pane instead of a well grid', async () => {
    const instrument = instrumentFixture()
    mocks.state = makeState({
      focusPlacementId: 'pl-inst',
      labwares: { 'ins-1': instrument },
      placements: [{
        placementId: 'pl-inst',
        labwareId: 'ins-1',
        location: { kind: 'lawn', xMm: 10, yMm: 10 },
        orientation: 'landscape',
      }],
    })

    render(<LabwareFocus />)

    // Instrument detail pane, not a well grid.
    await waitFor(() => expect(screen.getByTestId('focus-instrument')).toBeTruthy())
    expect(screen.queryByTestId('focus-instrument')).toBeTruthy()
    expect(screen.queryByTestId('well-grid')).toBeNull()
    // Shows the bench object name + the canonical EQP record identity.
    expect(screen.getByTestId('focus-instrument').textContent).toContain('Eppendorf ThermoMixer C')
    expect(screen.getByTestId('focus-instrument').textContent).toContain('EQP-EPPENDORF-THERMOMIXER')
    // Shows the silhouette kind label (defaults to generic when untagged).
    expect(screen.getByTestId('focus-instrument-kind').textContent).toBe('Other / generic')
  })

  it('Close exits the instrument focus back to the bench', async () => {
    const instrument = instrumentFixture()
    mocks.state = makeState({
      focusPlacementId: 'pl-inst',
      labwares: { 'ins-1': instrument },
      placements: [{
        placementId: 'pl-inst',
        labwareId: 'ins-1',
        location: { kind: 'lawn', xMm: 10, yMm: 10 },
        orientation: 'landscape',
      }],
    })

    render(<LabwareFocus />)
    await waitFor(() => expect(screen.getByTestId('focus-instrument')).toBeTruthy())
    screen.getByRole('button', { name: /close/i }).click()
    expect(mocks.setFocus).toHaveBeenCalledWith(null)
  })
})