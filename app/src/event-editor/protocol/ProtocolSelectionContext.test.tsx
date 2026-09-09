import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { ProtocolSelectionProvider, useProtocolSelection } from './ProtocolSelectionContext'

afterEach(() => {
  cleanup()
})

function renderSelection() {
  return renderHook(() => useProtocolSelection(), {
    wrapper: ({ children }) => <ProtocolSelectionProvider>{children}</ProtocolSelectionProvider>,
  })
}

describe('ProtocolSelectionContext', () => {
  it('defaults currentStepId to null (flat ghosting preserved)', () => {
    const { result } = renderSelection()
    expect(result.current?.currentStepId).toBeNull()
  })

  it('sets currentStepId to a step id', () => {
    const { result } = renderSelection()
    act(() => {
      result.current?.setCurrentStepId('step-2')
    })
    expect(result.current?.currentStepId).toBe('step-2')
  })

  it('restores flat behavior by setting currentStepId back to null', () => {
    const { result } = renderSelection()
    act(() => {
      result.current?.setCurrentStepId('step-2')
      result.current?.setCurrentStepId(null)
    })
    expect(result.current?.currentStepId).toBeNull()
  })

  it('tracks visible steps independently of currentStepId', () => {
    const { result } = renderSelection()
    act(() => {
      result.current?.setVisibleSteps(['step-1', 'step-2'])
      result.current?.setCurrentStepId('step-2')
    })
    expect([...result.current!.visibleSteps]).toEqual(['step-1', 'step-2'])
    expect(result.current?.currentStepId).toBe('step-2')
  })

  it('defaults focus to null (flat ghosting preserved)', () => {
    const { result } = renderSelection()
    expect(result.current?.focusStepId).toBeNull()
    expect(result.current?.focusedStep).toBeNull()
  })

  it('sets focus to isolate a single step realization (carries the concept)', () => {
    const { result } = renderSelection()
    act(() => {
      result.current?.setFocusedStep({ stepId: 'step-1', label: 'Wash the cells', ordinal: 1 })
    })
    expect(result.current?.focusStepId).toBe('step-1')
    expect(result.current?.focusedStep).toEqual({ stepId: 'step-1', label: 'Wash the cells', ordinal: 1 })
  })

  it('clears focus when set back to null', () => {
    const { result } = renderSelection()
    act(() => {
      result.current?.setFocusedStep({ stepId: 'step-1', label: 'Wash the cells', ordinal: 1 })
      result.current?.setFocusedStep(null)
    })
    expect(result.current?.focusStepId).toBeNull()
    expect(result.current?.focusedStep).toBeNull()
  })

  it('publishes and reads the step concept list (shared nav source)', () => {
    const { result } = renderSelection()
    expect(result.current?.steps).toEqual([])
    act(() => {
      result.current?.setSteps([
        { stepId: 's1', label: 'Wash the cells', ordinal: 1 },
        { stepId: 's2', label: 'Seed T25s', ordinal: 2 },
      ])
    })
    expect(result.current?.steps).toHaveLength(2)
    expect(result.current?.steps[0]?.label).toBe('Wash the cells')
    expect(result.current?.steps[1]?.ordinal).toBe(2)
  })
})
