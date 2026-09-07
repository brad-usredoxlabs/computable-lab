import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StepChipPrompt } from './StepChipPrompt'

describe('StepChipPrompt', () => {
  it('hides the prompt box unless the step is active (highlighted)', () => {
    const onLocalize = vi.fn()
    const { rerender } = render(<StepChipPrompt active={false} stepText="Wash cells" onLocalize={onLocalize} />)
    expect(screen.queryByTestId('step-chip-prompt')).toBeNull()

    rerender(<StepChipPrompt active stepText="Wash cells" onLocalize={onLocalize} />)
    expect(screen.getByTestId('step-chip-prompt')).not.toBeNull()
  })

  it('Localize sends { prompt, stepText } — disabled while the prompt is empty', () => {
    const onLocalize = vi.fn()
    render(<StepChipPrompt active stepText="Wash the media off the cells" onLocalize={onLocalize} />)

    // Empty prompt → Localize disabled
    const btn = screen.getByTestId('step-localize-btn')
    expect(btn.hasAttribute('disabled')).toBe(true)

    fireEvent.change(screen.getByTestId('step-prompt-input'), {
      target: { value: 'use a deepwell plate, not the 96-well' },
    })
    expect(btn.hasAttribute('disabled')).toBe(false)
    fireEvent.click(btn)
    expect(onLocalize).toHaveBeenCalledWith({
      prompt: 'use a deepwell plate, not the 96-well',
      stepText: 'Wash the media off the cells',
    })
  })

  it('Enter in the prompt fires Localize', () => {
    const onLocalize = vi.fn()
    render(<StepChipPrompt active stepText="Read plate" onLocalize={onLocalize} />)
    fireEvent.change(screen.getByTestId('step-prompt-input'), { target: { value: 'use the QuantStudio 5' } })
    fireEvent.keyDown(screen.getByTestId('step-prompt-input'), { key: 'Enter', code: 'Enter' })
    expect(onLocalize).toHaveBeenCalledWith({ prompt: 'use the QuantStudio 5', stepText: 'Read plate' })
  })

  it('keeps the prompt text when the step collapses and re-expands (state lives in the component)', () => {
    const onLocalize = vi.fn()
    const { rerender } = render(<StepChipPrompt active stepText="Grow cells" onLocalize={onLocalize} />)
    fireEvent.change(screen.getByTestId('step-prompt-input'), { target: { value: 'use RPMI 1640' } })

    rerender(<StepChipPrompt active={false} stepText="Grow cells" onLocalize={onLocalize} />)
    expect(screen.queryByTestId('step-chip-prompt')).toBeNull()

    rerender(<StepChipPrompt active stepText="Grow cells" onLocalize={onLocalize} />)
    const restored = screen.getByTestId('step-prompt-input')
    expect((restored as HTMLInputElement).value).toBe('use RPMI 1640')
  })
})