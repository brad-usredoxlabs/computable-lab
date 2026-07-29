/**
 * Tests for useExecutionState hook.
 *
 * Verifies:
 * - Step start/completion with timestamps
 * - Editable run name
 * - Mode switching (plan ↔ execute)
 * - Event timestamp updates
 * - playAll sequential execution
 * - Skip step behavior
 * - Deviated step recording
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, act } from '@testing-library/react'
import { useExecutionState } from '../useExecutionState'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createPlannedGraph(stepCount: number) {
  return Array.from({ length: stepCount }, (_, i) => ({
    eventId: `step-${i}`,
    event_type: 'add_material',
  }))
}

function renderExecutionHook(runName = 'Test Run', graph = createPlannedGraph(3)) {
  return renderHook(() => useExecutionState('run-1', runName, graph))
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('initial state', () => {
  it('creates state with correct runId and runName', () => {
    const { result } = renderExecutionHook('My Run', createPlannedGraph(2))
    const { state } = result.current

    expect(state.runId).toBe('run-1')
    expect(state.runName).toBe('My Run')
    expect(state.isRunNameEditable).toBe(true)
    expect(state.mode).toBe('plan')
  })

  it('initializes all step statuses as pending', () => {
    const { result } = renderExecutionHook('Run', createPlannedGraph(3))
    const { state } = result.current

    expect(state.stepStatuses).toEqual({
      'step-0': 'pending',
      'step-1': 'pending',
      'step-2': 'pending',
    })
  })

  it('clones plannedGraph into executedGraph', () => {
    const { result } = renderExecutionHook('Run', createPlannedGraph(2))
    const { state } = result.current

    expect(state.plannedGraph).toEqual(state.executedGraph)
    expect(state.plannedGraph).not.toBe(state.executedGraph) // different references
  })

  it('starts with currentStepIndex at -1', () => {
    const { result } = renderExecutionHook()
    expect(result.current.state.currentStepIndex).toBe(-1)
  })
})

// ---------------------------------------------------------------------------
// Run name editing
// ---------------------------------------------------------------------------

describe('setRunName', () => {
  it('updates the run name', () => {
    const { result } = renderExecutionHook()
    act(() => {
      result.current.setRunName('Renamed Run')
    })
    expect(result.current.state.runName).toBe('Renamed Run')
  })

  it('keeps runId unchanged when name changes', () => {
    const { result } = renderExecutionHook()
    act(() => {
      result.current.setRunName('New Name')
    })
    expect(result.current.state.runId).toBe('run-1')
  })

  it('allows editing with empty string', () => {
    const { result } = renderExecutionHook()
    act(() => {
      result.current.setRunName('')
    })
    expect(result.current.state.runName).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Mode switching
// ---------------------------------------------------------------------------

describe('setMode', () => {
  it('switches to execute mode', () => {
    const { result } = renderExecutionHook()
    act(() => {
      result.current.setMode('execute')
    })
    expect(result.current.state.mode).toBe('execute')
  })

  it('switches back to plan mode', () => {
    const { result } = renderExecutionHook()
    act(() => {
      result.current.setMode('execute')
      result.current.setMode('plan')
    })
    expect(result.current.state.mode).toBe('plan')
  })

  it('is idempotent — no change if mode already set', () => {
    const { result } = renderExecutionHook()
    act(() => {
      result.current.setMode('plan')
    })
    expect(result.current.state.mode).toBe('plan')
  })
})

// ---------------------------------------------------------------------------
// Step start / completion
// ---------------------------------------------------------------------------

describe('startStep', () => {
  it('sets step status to in_progress and records startedAt', () => {
    const { result } = renderExecutionHook()
    act(() => {
      result.current.startStep('step-0')
    })

    const { state } = result.current
    expect(state.stepStatuses['step-0']).toBe('in_progress')
    expect(state.stepTimestamps['step-0'].startedAt).toBeDefined()
    expect(typeof state.stepTimestamps['step-0'].startedAt).toBe('string')
  })

  it('updates currentStepIndex to the started step', () => {
    const { result } = renderExecutionHook()
    act(() => {
      result.current.startStep('step-1')
    })
    expect(result.current.state.currentStepIndex).toBe(1)
  })

  it('is idempotent — does not restart an already in_progress step', () => {
    const { result } = renderExecutionHook()
    vi.useFakeTimers()

    act(() => {
      result.current.startStep('step-0')
    })
    const firstStartedAt = result.current.state.stepTimestamps['step-0'].startedAt

    vi.advanceTimersByTime(1000)

    act(() => {
      result.current.startStep('step-0')
    })

    expect(result.current.state.stepTimestamps['step-0'].startedAt).toBe(firstStartedAt)
    vi.restoreAllMocks()
  })

  it('does not double-start a completed step', () => {
    const { result } = renderExecutionHook()

    // Start and complete a step
    act(() => {
      result.current.startStep('step-0')
      result.current.completeStep('step-0')
    })

    // Attempting to restart should not work
    act(() => {
      result.current.startStep('step-0')
    })
    expect(result.current.state.stepStatuses['step-0']).toBe('completed')
  })
})

describe('completeStep', () => {
  it('sets step status to completed and records completedAt', () => {
    const { result } = renderExecutionHook()

    act(() => {
      result.current.startStep('step-0')
      result.current.completeStep('step-0')
    })

    const { state } = result.current
    expect(state.stepStatuses['step-0']).toBe('completed')
    expect(state.stepTimestamps['step-0'].completedAt).toBeDefined()
  })

  it('marks step as deviated when deviations provided', () => {
    const { result } = renderExecutionHook()
    const deviation = {
      code: 'TEMP_OFFSET',
      message: 'Temperature was 2°C off',
      severity: 'warning' as const,
      reportedBy: 'operator',
      reportedAt: new Date().toISOString(),
    }

    act(() => {
      result.current.startStep('step-0')
      result.current.completeStep('step-0', deviation)
    })

    const { state } = result.current
    expect(state.stepStatuses['step-0']).toBe('deviated')
    expect(state.stepDeviations['step-0']).toEqual(deviation)
  })

  it('is idempotent — does not re-complete an already completed step', () => {
    const { result } = renderExecutionHook()
    vi.useFakeTimers()

    act(() => {
      result.current.startStep('step-0')
      result.current.completeStep('step-0')
    })
    const firstCompletedAt = result.current.state.stepTimestamps['step-0'].completedAt

    vi.advanceTimersByTime(5000)

    act(() => {
      result.current.completeStep('step-0')
    })

    // Status should still be 'completed', timestamp unchanged
    expect(result.current.state.stepStatuses['step-0']).toBe('completed')
    expect(result.current.state.stepTimestamps['step-0'].completedAt).toBe(firstCompletedAt)
    vi.restoreAllMocks()
  })
})

// ---------------------------------------------------------------------------
// Skip step
// ---------------------------------------------------------------------------

describe('skipStep', () => {
  it('marks a pending step as skipped', () => {
    const { result } = renderExecutionHook()
    act(() => {
      result.current.skipStep('step-1')
    })
    expect(result.current.state.stepStatuses['step-1']).toBe('skipped')
  })

  it('is idempotent — does not change an already skipped step', () => {
    const { result } = renderExecutionHook()
    act(() => {
      result.current.skipStep('step-1')
      result.current.skipStep('step-1')
    })
    expect(result.current.state.stepStatuses['step-1']).toBe('skipped')
  })
})

// ---------------------------------------------------------------------------
// Event timestamp updates
// ---------------------------------------------------------------------------

describe('updateEventTimestamp', () => {
  it('updates the at timestamp on an event in the executed graph', () => {
    const { result } = renderExecutionHook()
    const now = '2026-07-29T10:00:00.000Z'

    act(() => {
      result.current.updateEventTimestamp('step-0', now)
    })

    const event = result.current.state.executedGraph.find((e) => e.eventId === 'step-0')
    expect(event?.at).toBe(now)
  })

  it('does not affect the planned graph', () => {
    const graph = createPlannedGraph(2)
    const { result } = renderExecutionHook('Run', graph)

    act(() => {
      result.current.updateEventTimestamp('step-0', '2026-07-29T10:00:00.000Z')
    })

    const plannedEvent = result.current.state.plannedGraph.find((e) => e.eventId === 'step-0')
    expect(plannedEvent?.at).toBeUndefined()
  })

  it('does not modify non-matching events', () => {
    const { result } = renderExecutionHook()

    act(() => {
      result.current.updateEventTimestamp('step-0', '2026-07-29T10:00:00.000Z')
    })

    const event1 = result.current.state.executedGraph.find((e) => e.eventId === 'step-1')
    expect(event1?.at).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// playAll
// ---------------------------------------------------------------------------

describe('playAll', () => {
  it('marks all pending steps as completed', async () => {
    const { result } = renderExecutionHook()

    await act(async () => {
      await result.current.playAll()
    })

    const { state } = result.current
    expect(state.stepStatuses['step-0']).toBe('completed')
    expect(state.stepStatuses['step-1']).toBe('completed')
    expect(state.stepStatuses['step-2']).toBe('completed')
  })

  it('records timestamps for all steps', async () => {
    const { result } = renderExecutionHook()

    await act(async () => {
      await result.current.playAll()
    })

    for (const i of [0, 1, 2]) {
      const id = `step-${i}`
      expect(result.current.state.stepTimestamps[id].startedAt).toBeDefined()
      expect(result.current.state.stepTimestamps[id].completedAt).toBeDefined()
    }
  })

  it('updates currentStepIndex to last step', async () => {
    const { result } = renderExecutionHook()

    await act(async () => {
      await result.current.playAll()
    })

    expect(result.current.state.currentStepIndex).toBe(2)
  })

  it('does nothing if no pending steps', async () => {
    const { result } = renderExecutionHook()

    // Complete all steps manually first
    act(() => {
      result.current.startStep('step-0')
      result.current.completeStep('step-0')
      result.current.startStep('step-1')
      result.current.completeStep('step-1')
      result.current.startStep('step-2')
      result.current.completeStep('step-2')
    })

    await act(async () => {
      await result.current.playAll()
    })

    // All should still be completed
    for (const i of [0, 1, 2]) {
      expect(result.current.state.stepStatuses[`step-${i}`]).toBe('completed')
    }
  })
})
