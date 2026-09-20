import { describe, expect, it } from 'vitest'
import { termClarifyPrompt, termConfirmPrompt } from './termFollowUpPrompt'

describe('the term panel sends ordinary turns, not a private channel', () => {
  it('confirms a resolved pick as the mention the loop already understands', () => {
    const prompt = termConfirmPrompt({
      label: 'fenofibrate',
      mention: { type: 'material', entityKind: 'material', id: 'MAT-ethanol-1', label: 'ethanol' },
    })
    expect(prompt).toBe('Use [[material:MAT-ethanol-1|ethanol]] for "fenofibrate".')
  })

  it('confirms a link to an existing local term by id', () => {
    expect(termConfirmPrompt({ label: 'F praus', existingTermId: 'TERM-fpraus-9z8y' })).toBe(
      'Use the existing term TERM-fpraus-9z8y for "F praus".',
    )
  })

  it('keeps a brand-new term without inventing a reference for it', () => {
    expect(termConfirmPrompt({ label: 'DMEM' })).toContain('new local term')
  })

  it('asks for a redraft carrying the biologist\'s sentence', () => {
    expect(
      termClarifyPrompt({ label: 'F praus', text: '  means F. prausnitzii, the gut commensal ' }),
    ).toBe('Redraft. On the term "F praus": means F. prausnitzii, the gut commensal')
  })
})
