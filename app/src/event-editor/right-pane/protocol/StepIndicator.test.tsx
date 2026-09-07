/**
 * StepIndicator tests — the very visible "which concept am I realizing?"
 * indicator shown when a protocol step is focused for investigation.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StepIndicator } from './StepIndicator'

afterEach(cleanup)

describe('StepIndicator', () => {
  it('renders "Editing STEP N: {concept}" with high-contrast marker', () => {
    render(
      <StepIndicator
        stepId="S2"
        ordinal={2}
        label="Wash the media off the cells"
      />,
    )
    expect(screen.getByTestId('step-indicator').textContent).toContain('STEP 2')
    expect(screen.getByTestId('step-indicator').textContent).toContain('Wash the media off the cells')
  })

  it('renders the deck-banner copy that events belong to this step', () => {
    render(
      <StepIndicator
        stepId="S2"
        ordinal={2}
        label="Wash the media off the cells"
      />,
    )
    expect(screen.getByTestId('step-indicator').textContent).toContain('events you add now realize this step')
  })

  it('offers a clear-focus affordance that calls onClearFocus', () => {
    const onClearFocus = vi.fn()
    render(
      <StepIndicator
        stepId="S2"
        ordinal={2}
        label="Wash the media off the cells"
        onClearFocus={onClearFocus}
      />,
    )
    fireEvent.click(screen.getByTestId('step-indicator-clear'))
    expect(onClearFocus).toHaveBeenCalled()
  })

  it('omits ordinal when absent and falls back to the label', () => {
    render(<StepIndicator stepId="S9" label="Read the plate" />)
    expect(screen.getByTestId('step-indicator').textContent).toContain('STEP ?')
    expect(screen.getByTestId('step-indicator').textContent).toContain('Read the plate')
  })
})