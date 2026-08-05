import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { StepDetailPane } from './StepDetailPane'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('StepDetailPane', () => {
  it('renders the step label and long-form text', () => {
    render(
      <StepDetailPane runId="RUN-1" stepId="step-2" stepLabel="Seal and read" text="1. Seal the plate.\n2. Read." />,
    )
    expect(screen.getByTestId('step-detail-pane')).toBeDefined()
    expect(screen.getByText('Seal and read')).toBeDefined()
    expect(screen.getByTestId('step-detail-text').textContent).toContain('Seal the plate')
  })

  it('dispatches protocol-step-selection with the whole section when nothing is selected', () => {
    // jsdom getSelection returns empty — send falls back to the full text.
    const spy = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true)

    render(<StepDetailPane runId="RUN-1" stepId="step-1" stepLabel="Add cells" text="Seed 96-well plate" />)
    fireEvent.click(screen.getByText('Send selection to AI'))
    expect(spy).toHaveBeenCalledTimes(1)
    const detail = (spy.mock.calls[0][0] as CustomEvent).detail as {
      highlightedSection: string
      surface: string
      stepId: string
    }
    expect(detail.highlightedSection).toBe('Seed 96-well plate')
    expect(detail.surface).toBe('protocol-planning')
    expect(detail.stepId).toBe('step-1')
  })
})
