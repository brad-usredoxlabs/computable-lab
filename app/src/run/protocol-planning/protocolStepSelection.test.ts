import { describe, it, expect } from 'vitest'
import { buildStepLocalizePrompt } from './protocolStepSelection'

const step = { stepId: 'step-2', label: 'Incubate 30 min' }

describe('buildStepLocalizePrompt', () => {
  it('includes the step id, label, and the user instruction', () => {
    const prompt = buildStepLocalizePrompt(step, 'use the QuantStudio 5 block')
    expect(prompt).toContain('step-2')
    expect(prompt).toContain('Incubate 30 min')
    expect(prompt).toContain('QuantStudio 5')
  })

  it('omits an empty instruction cleanly', () => {
    const prompt = buildStepLocalizePrompt(step, '   ')
    expect(prompt).not.toContain('User instruction')
    expect(prompt).toContain('Localize step step-2')
  })
})
