import { describe, it, expect } from 'vitest'
import { buildStepLocalizePrompt, composeFullLocalizePrompt } from './protocolStepSelection'

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

describe('composeFullLocalizePrompt', () => {
  it('embeds editable title, full text, and instruction', () => {
    const prompt = composeFullLocalizePrompt({
      step: { stepId: 'step-3', label: 'Read fluorescence' },
      titleText: 'Read fluorescence at 485/528',
      fullText: 'Place the plate in the reader. Read at Ex/Em 485/528.',
      instruction: 'use the SpectraMax i3',
    })
    expect(prompt).toContain('step-3')
    expect(prompt).toContain('Read fluorescence at 485/528')      // editable title wins
    expect(prompt).toContain('Place the plate in the reader')
    expect(prompt).toContain('SpectraMax i3')
    expect(prompt).toContain('Draft')
  })

  it('falls back to the step label when the editable title is empty', () => {
    const prompt = composeFullLocalizePrompt({
      step: { stepId: 'step-2', label: 'Incubate' },
      titleText: '',
      fullText: 'Incubate cells at 37C',
      instruction: 'ghost it',
    })
    expect(prompt).toContain('Incubate')
    expect(prompt).toContain('ghost it')
  })

  it('omits the full text line when empty', () => {
    const prompt = composeFullLocalizePrompt({
      step,
      titleText: 'Incubate',
      fullText: '',
      instruction: 'localize',
    })
    expect(prompt).not.toContain('Full step text')
    expect(prompt).toContain('localize')
  })

  it('omits the instruction line when empty or whitespace-only', () => {
    for (const instruction of ['', '   ']) {
      const prompt = composeFullLocalizePrompt({ step, titleText: 'Incubate', fullText: 'x', instruction })
      expect(prompt).not.toContain('User instruction')
    }
  })

  it('returns a single string joined by double-newlines', () => {
    const prompt = composeFullLocalizePrompt({
      step: { stepId: 'step-5', label: 'Wash' },
      titleText: 'Wash',
      fullText: 'Wash 3x with PBS.',
      instruction: 'we have limited PBS',
    })
    const parts = prompt.split('\n\n')
    expect(parts).toHaveLength(4)
    expect(parts[0]).toContain('step-5')
    expect(parts[1]).toContain('Wash 3x with PBS.')
    expect(parts[2]).toContain('limited PBS')
    expect(parts[3]).toContain('Draft')
  })
})
