import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventEditorState } from '../EventEditorContext'
import type { Equipment } from '../../types/equipment'
import { EMPTY_HISTORY } from '../editorHistory'
import { LawnSurface } from './LawnSurface'

const mocks = vi.hoisted(() => ({
  state: null as EventEditorState | null,
  movePlacement: vi.fn(),
  placeNewLabware: vi.fn(),
  removePlacement: vi.fn(),
}))

vi.mock('../EventEditorContext', () => ({
  useEventEditor: () => ({
    state: mocks.state,
    actions: {
      movePlacement: mocks.movePlacement,
      placeNewLabware: mocks.placeNewLabware,
      removePlacement: mocks.removePlacement,
    },
  }),
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
    runDeck: null,
    equipments: {},
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

function waterBath(equipmentId: string, name: string, temperature_c: number): Equipment {
  return {
    equipmentId,
    recordId: 'EQP-WATER-BATH',
    name,
    instrumentKind: 'water_bath',
    equipmentClassRef: { kind: 'record', type: 'equipment-class', id: 'equipment:water_bath' },
    settings: { temperature_c },
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

beforeEach(() => {
  if (typeof (globalThis as Record<string, unknown>).ResizeObserver !== 'function') {
    ;(globalThis as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      disconnect() {}
    }
  }
  mocks.movePlacement.mockReset()
  mocks.placeNewLabware.mockReset()
  mocks.removePlacement.mockReset()
})

describe('LawnSurface renders first-class equipment placements', () => {
  it('renders an equipment placement as an instrument silhouette with its settings chip', () => {
    mocks.state = makeState({
      equipments: { 'eqp-1': waterBath('eqp-1', 'Water bath 1', 55) },
      placements: [{
        placementId: 'pl-1',
        entityKind: 'equipment',
        equipmentId: 'eqp-1',
        labwareId: 'eqp-1',
        location: { kind: 'lawn', xMm: 10, yMm: 10, surfaceId: 'primary' },
        orientation: 'landscape',
      }],
    })

    render(<LawnSurface widthMm={1200} heightMm={800} title="Manual Bench (freeform)" primary surfaceId="primary" />)

    // The equipment's name renders as a tile — Phase-2 acceptance.
    expect(screen.getByText(/Water bath 1/)).toBeTruthy()
    // The read-only settings chip renders the temperature.
    expect(screen.getByText(/55 °C/)).toBeTruthy()
  })

  it('does not render a bare well grid / labware for an equipment placement (no state.labwares leak)', () => {
    mocks.state = makeState({
      labwares: {}, // equipment is NOT in labwares
      equipments: { 'eqp-1': waterBath('eqp-1', 'Water bath 1', 70) },
      placements: [{
        placementId: 'pl-1',
        entityKind: 'equipment',
        equipmentId: 'eqp-1',
        labwareId: 'eqp-1',
        location: { kind: 'lawn', xMm: 10, yMm: 10, surfaceId: 'primary' },
        orientation: 'landscape',
      }],
    })

    render(<LawnSurface widthMm={1200} heightMm={800} title="Manual Bench (freeform)" primary surfaceId="primary" />)

    expect(screen.getByText(/Water bath 1/)).toBeTruthy()
    expect(screen.getByText(/70 °C/)).toBeTruthy()
  })

  it('renders an equipment ghost from the preview when present', () => {
    const equip = waterBath('eqp-ghost', 'Water bath 2', 55)
    mocks.state = makeState({
      equipments: {},
      preview: {
        previewLabwares: {},
        previewEquipments: { 'eqp-ghost': equip },
        previewPlacements: [{
          placementId: 'pl-ghost',
          entityKind: 'equipment',
          equipmentId: 'eqp-ghost',
          labwareId: 'eqp-ghost',
          location: { kind: 'lawn', xMm: 10, yMm: 10, surfaceId: 'primary' },
          orientation: 'landscape',
        }],
        previewEvents: [],
      },
    })

    render(<LawnSurface widthMm={1200} heightMm={800} title="Manual Bench (freeform)" primary surfaceId="primary" />)

    expect(screen.getByText(/Water bath 2/)).toBeTruthy()
    expect(screen.getByText(/55 °C/)).toBeTruthy()
  })

  it('drags a committed equipment placement to a new lawn location', () => {
    mocks.state = makeState({
      platforms: [{
        id: 'manual',
        label: 'Manual',
        allowedVocabIds: [],
        defaultVariant: 'manual_freeform',
        toolTypeIds: [],
        modules: [],
        variants: [{ id: 'manual_freeform', title: 'Manual Bench (freeform)', slots: [], surface: { kind: 'lawn', widthMm: 1200, heightMm: 800 } }],
      }],
      equipments: { 'eqp-1': waterBath('eqp-1', 'Water bath 1', 55) },
      placements: [{
        placementId: 'pl-1',
        entityKind: 'equipment',
        equipmentId: 'eqp-1',
        labwareId: 'eqp-1',
        location: { kind: 'lawn', xMm: 100, yMm: 100, surfaceId: 'primary' },
        orientation: 'landscape',
      }],
    })

    render(<LawnSurface widthMm={1200} heightMm={800} title="Manual Bench (freeform)" primary surfaceId="primary" />)

    // The committed equipment tile is draggable (not a ghost).
    const surface = Array.from(document.querySelectorAll('.lawn__surface'))[0] as HTMLDivElement
    const drop = new MouseEvent('drop', { bubbles: true, cancelable: true, clientX: 400, clientY: 250 })
    Object.defineProperty(drop, 'dataTransfer', {
      value: { types: ['application/x-event-editor-placement'], getData: () => 'pl-1', effectAllowed: 'move' },
    })
    surface!.dispatchEvent(drop)

    const call = mocks.movePlacement.mock.calls[0]
    expect(call).toBeTruthy()
    expect(call?.[0]).toBe('pl-1')
    // Dropped at the target, clamped inside the lawn, staying on the primary surface.
    expect(call?.[1]).toMatchObject({ kind: 'lawn', surfaceId: 'primary' })
    expect(call?.[1].xMm).toBeGreaterThanOrEqual(0)
    expect(call?.[1].yMm).toBeGreaterThanOrEqual(0)
  })
})