import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventEditorState } from '../EventEditorContext'
import { createLabware } from '../../types/labware'
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

// Primary freeform bench (1200×800) + a side labware lawn (600×400), as the
// manual_freeform variant exposes after the manifest change. Each lawn is
// explicitly scoped to its own surface id.
function renderTwoLawns() {
  return render(
    <div>
      <LawnSurface widthMm={1200} heightMm={800} title="Manual Bench (freeform)" primary surfaceId="primary" />
      <LawnSurface widthMm={600} heightMm={400} title="Labware lawn" surfaceId="side" />
    </div>,
  )
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

describe('cross-lawn drag (two freebench surfaces)', () => {
  it('dropping a tile from the primary bench onto the side lawn moves the SAME placement there', () => {
    const plate = createLabware('plate_96', 'Plate 1')
    mocks.state = makeState({
      platforms: [{
        id: 'manual',
        label: 'Manual',
        allowedVocabIds: ['liquid-handling/v1', 'animal-handling/v1'],
        defaultVariant: 'manual_freeform',
        toolTypeIds: ['pipette_1ch'],
        modules: [],
        variants: [{
          id: 'manual_freeform',
          title: 'Manual Bench (freeform)',
          slots: [],
          surface: { kind: 'lawn', widthMm: 1200, heightMm: 800 },
          sideLawn: { widthMm: 600, heightMm: 400, label: 'Labware lawn' },
        }],
      }],
      labwares: { 'plate-1': plate },
      placements: [{
        placementId: 'pl-1',
        labwareId: 'plate-1',
        location: { kind: 'lawn', xMm: 10, yMm: 10 },
        orientation: 'landscape',
      }],
    })

    renderTwoLawns()
    // Both lawn surfaces render (`aria-label={title}` on each <section>).
    expect(screen.getAllByLabelText(/Manual Bench|Labware lawn/)).toHaveLength(2)

    // Surface-scoping regression: the placement (no surfaceId → primary) renders
    // as EXACTLY ONE tile, on the PRIMARY bench only — not doubled on both lawns.
    const tileAnchors = Array.from(document.querySelectorAll('.lawn__tile-anchor'))
    expect(tileAnchors).toHaveLength(1)
    const primaryTiles = document.querySelector('.lawn--primary .lawn__tile-anchor')
    const sideTiles = document.querySelectorAll<HTMLDivElement>('.lawn__surface')[1]?.querySelectorAll('.lawn__tile-anchor').length ?? 0
    expect(primaryTiles).toBeTruthy()
    expect(sideTiles).toBe(0)

    // The SIDE lawn's surface div is the drop target. Locate by CSS: the second
    // `.lawn__surface` belongs to the 600×400 side lawn (smaller).
    const surfaces = Array.from(document.querySelectorAll<HTMLDivElement>('.lawn__surface'))
    const sideDrop = surfaces[1]
    expect(sideDrop).toBeTruthy()

    // Simulate dropping the placement carried from the primary bench's tile.
    // A real MouseEvent so `clientX/clientY` are honored (fireEvent.drop drops
    // them from a DragEvent), with `dataTransfer` attached via defineProperty.
    const drop = new MouseEvent('drop', {
      bubbles: true,
      cancelable: true,
      clientX: 300,
      clientY: 200,
    })
    Object.defineProperty(drop, 'dataTransfer', {
      value: {
        types: ['application/x-event-editor-placement'],
        getData: () => 'pl-1',
        effectAllowed: 'move',
      },
    })
    sideDrop.dispatchEvent(drop)

    // The drop must MOVE the placement to the side lawn (not recreate or remove
    // it), and stamp surfaceId='side' so the SAME placement now belongs to the
    // side bench — this is what moving between two benches means.
    expect(mocks.removePlacement).not.toHaveBeenCalled()
    expect(mocks.placeNewLabware).not.toHaveBeenCalled()
    const call = mocks.movePlacement.mock.calls[0]
    expect(call).toBeTruthy()
    expect(call?.[0]).toBe('pl-1')
    expect(call?.[1]).toMatchObject({ kind: 'lawn', surfaceId: 'side' })
    // Coordinate clamped inside the side lawn's 600×400 mm bounds.
    expect(call?.[1].xMm).toBeGreaterThanOrEqual(0)
    expect(call?.[1].yMm).toBeGreaterThanOrEqual(0)
  })

  it('renders each placement only on its own surface (no double-render across benches)', () => {
    const plate = createLabware('plate_96', 'Plate 1')
    const sidePlate = createLabware('plate_96', 'Side Plate')
    mocks.state = makeState({
      labwares: { 'plate-1': plate, 'side-1': sidePlate },
      placements: [
        { placementId: 'pl-1', labwareId: 'plate-1', location: { kind: 'lawn', xMm: 10, yMm: 10, surfaceId: 'primary' }, orientation: 'landscape' },
        { placementId: 'pl-2', labwareId: 'side-1', location: { kind: 'lawn', xMm: 10, yMm: 10, surfaceId: 'side' }, orientation: 'landscape' },
      ],
    })

    renderTwoLawns()
    const surfaces = Array.from(document.querySelectorAll<HTMLDivElement>('.lawn__surface'))
    const primaryTiles = surfaces[0]!.querySelectorAll('.lawn__tile-anchor').length
    const sideTiles = surfaces[1]!.querySelectorAll('.lawn__tile-anchor').length
    expect(primaryTiles).toBe(1) // only the primary placement
    expect(sideTiles).toBe(1) // only the side placement
  })
})