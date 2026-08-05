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
})
