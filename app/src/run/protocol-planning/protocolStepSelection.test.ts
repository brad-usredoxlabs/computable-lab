import { describe, it, expect, vi } from 'vitest'
import {
  buildProtocolStepPrompt,
  dispatchProtocolStepSelection,
  PROTOCOL_STEP_SELECTION_EVENT,
  type ProtocolStepSelectionDetail,
} from './protocolStepSelection'

describe('protocolStepSelection', () => {
  it('builds a self-contained prompt from a step selection', () => {
    const detail: ProtocolStepSelectionDetail = {
      runId: 'RUN-1',
      stepId: 'step-2',
      stepLabel: 'Seal and read',
      highlightedSection: 'Seal the plate and read fluorescence over 60 min.',
      surface: 'protocol-planning',
    }
    const prompt = buildProtocolStepPrompt(detail)
    expect(prompt).toContain('Adapt step step-2 ("Seal and read") to this lab.')
    expect(prompt).toContain('User-highlighted detail: "Seal the plate and read fluorescence over 60 min."')
    expect(prompt).toContain('Ghost the events for this step onto the editor.')
  })

  it('dispatches the protocol-step-selection event with the detail', () => {
    const detail: ProtocolStepSelectionDetail = {
      runId: 'RUN-1',
      stepId: 'step-1',
      stepLabel: 'Add cells',
      highlightedSection: 'Seed 96-well plate',
    }
    const dispatchFn = vi.fn()
    dispatchProtocolStepSelection(detail, dispatchFn)
    expect(dispatchFn).toHaveBeenCalledTimes(1)
    const event = dispatchFn.mock.calls[0][0] as CustomEvent<ProtocolStepSelectionDetail>
    expect(event.type).toBe(PROTOCOL_STEP_SELECTION_EVENT)
    expect(event.detail).toEqual(detail)
  })
})
