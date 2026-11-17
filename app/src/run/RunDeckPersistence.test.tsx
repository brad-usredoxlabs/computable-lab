/**
 * d2persist (L2-PROMPT1b-GATE-1 u1) — RED first.
 *
 * A labware placement made on the RUN deck (/runs/:runId, plan mode) must go
 * through the existing governed save (`persistAcceptedEventGraph` ->
 * `apiClient.saveEventGraph`) exactly once, with the placement carried in the
 * saved graph's `editorLayout` — the ONE placement authority. A failed save
 * must surface a VISIBLE error: a placement that only lives in editor memory
 * vanishes on reload (gate r2 §D2).
 *
 * The run surface mounts `RunDeckPersistence` inside its EventEditorProvider;
 * these locks drive the real hook + real persistence helper against a stubbed
 * apiClient, so the assertion is on the actual governed write, not on a
 * parallel seam.
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventEditorState } from '../event-editor/EventEditorContext'
import { EventGraphChip } from '../event-editor/topbar/EventGraphChip'
import { RunDeckPersistence } from './RunDeckPersistence'

const mocks = vi.hoisted(() => ({
  state: null as unknown as EventEditorState,
  saveEventGraph: vi.fn(),
  getRecord: vi.fn(async () => ({ payload: { kind: 'run', title: 'Run' } })),
  updateRecord: vi.fn(async () => ({ ok: true })),
  saveCorpusEntry: vi.fn(async () => ({ ok: true })),
}))

vi.mock('../event-editor/EventEditorContext', () => ({
  useEventEditor: () => ({ state: mocks.state, actions: {} }),
  useOptionalEventEditor: () => ({ state: mocks.state, actions: {} }),
}))

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getRecord: mocks.getRecord,
    updateRecord: mocks.updateRecord,
    saveEventGraph: mocks.saveEventGraph,
    saveCorpusEntry: mocks.saveCorpusEntry,
  },
  ApiError: class extends Error {},
}))

// (all apiClient members are declared inside the hoisted mock above)

function baseState(overrides: Partial<Record<string, unknown>> = {}): EventEditorState {
  return {
    eventGraphId: 'EG-1',
    runId: 'RUN-1',
    loadState: 'ready',
    platformId: 'PLT-1',
    variantId: 'VAR-1',
    labwares: {},
    equipments: {},
    placements: [],
    events: [],
    ...overrides,
  } as unknown as EventEditorState
}

const PLACEMENT = {
  placementId: 'PL-1',
  labwareId: 'LB-1',
  location: { kind: 'slot', slotId: 'A1' },
  orientation: 'landscape',
}

const LABWARE = { labwareId: 'LB-1', labwareType: 'plate96', name: 'Plate' }

async function flushIdle(): Promise<void> {
  // Past the 1.4s idle debounce, then drain the persistence chain's
  // microtasks (deck-lock read/write -> saveEventGraph -> adoption/error).
  await act(async () => {
    vi.advanceTimersByTime(1500)
  })
  for (let i = 0; i < 12; i += 1) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

describe('RunDeckPersistence — a run-deck placement commits to the graph', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.saveEventGraph.mockReset()
    mocks.saveEventGraph.mockResolvedValue({
      record: { id: 'EG-1' },
      validation: { valid: true },
      commit: { sha: 'sha-deck', message: 'deck placement', timestamp: '2026-11-17T00:00:00Z' },
    })
    mocks.state = baseState()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('issues exactly ONE saveEventGraph whose editorLayout carries the placement', async () => {
    const view = () => (
      <MemoryRouter>
        <RunDeckPersistence />
        <EventGraphChip />
      </MemoryRouter>
    )
    const { rerender } = render(view())

    // The first observation is the loaded deck (not an edit) — the placement
    // arrives after mount, exactly as a slot click does.
    mocks.state = baseState({ labwares: { 'LB-1': LABWARE }, placements: [PLACEMENT] })
    rerender(view())
    await flushIdle()

    expect(mocks.saveEventGraph).toHaveBeenCalledTimes(1)
    const [id, payload] = mocks.saveEventGraph.mock.calls[0] as [string | null, {
      editorLayout?: { placements?: Array<Record<string, unknown>> }
    }]
    expect(id).toBe('EG-1')
    expect(payload.editorLayout?.placements).toEqual([
      { placementId: 'PL-1', labwareId: 'LB-1', location: { kind: 'slot', slotId: 'A1' }, orientation: 'landscape' },
    ])
    // The graph id is already adopted on this surface, so the topbar chip is
    // NOT in its "Unsaved graph" state after the write resolves.
    // The surface's chip is bound to the SAME editor state: a saved graph is
    // not the "Unsaved graph" state (acceptance D2).
    expect(screen.queryByText('Unsaved graph')).toBeNull()
    expect(screen.getByText(/^Graph /)).toBeTruthy()
    expect(screen.queryByTestId('run-deck-save-error')).toBeNull()
  })

  it('surfaces a VISIBLE error when the save fails (never a silent unsaved placement)', async () => {
    mocks.saveEventGraph.mockRejectedValue(new Error('network down'))
    const { rerender } = render(<RunDeckPersistence />)

    mocks.state = baseState({ labwares: { 'LB-1': LABWARE }, placements: [PLACEMENT] })
    rerender(<RunDeckPersistence />)
    await flushIdle()

    expect(screen.getByTestId('run-deck-save-error').textContent).toContain('network down')
    // No save storm: a failure stays ONE attempt per edit.
    expect(mocks.saveEventGraph).toHaveBeenCalledTimes(1)
  })

  it('never writes a phantom graph when the run has no event graph yet', async () => {
    mocks.state = baseState({ eventGraphId: null, placements: [PLACEMENT], labwares: { 'LB-1': LABWARE } })
    render(<RunDeckPersistence />)
    await flushIdle()

    expect(mocks.saveEventGraph).not.toHaveBeenCalled()
  })
})
