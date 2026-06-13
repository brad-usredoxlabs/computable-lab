import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MaterialIntentSurface } from './MaterialIntentSurface'
import type { MaterialIntentOption } from './types'

const noop = () => {}

/** Three stub options: two builders + one host-handled route. */
function options(): MaterialIntentOption[] {
  return [
    { kind: 'compound', title: 'Compound + solvent', detail: 'a primary compound in a solvent', render: () => <div data-testid="builder-compound" /> },
    { kind: 'cells', title: 'Cells', detail: 'counted in cells/well', render: () => <div data-testid="builder-cells" /> },
  ]
}

afterEach(() => cleanup())

describe('MaterialIntentSurface', () => {
  it('shows the type picker and routes a chosen kind to its builder', () => {
    render(<MaterialIntentSurface options={options()} onResolved={noop} onCancel={noop} onError={noop} />)
    expect(screen.getByText('Compound + solvent')).toBeTruthy()
    expect(screen.getByText('Cells')).toBeTruthy()
    fireEvent.click(screen.getByText('Cells'))
    expect(screen.getByTestId('builder-cells')).toBeTruthy()
  })

  it('jumps straight to the seeded builder, skipping type selection', () => {
    render(<MaterialIntentSurface options={options()} seedKind="compound" onResolved={noop} onCancel={noop} onError={noop} />)
    expect(screen.getByTestId('builder-compound')).toBeTruthy()
    expect(screen.queryByText('Compound + solvent')).toBeNull() // picker skipped
  })

  it('fires onSelect for a host-handled route instead of rendering a builder', () => {
    const onSelect = vi.fn()
    const routed: MaterialIntentOption[] = [
      ...options(),
      { kind: 'formulation', title: 'Formulation', detail: 'hand off to the formulations page', onSelect },
    ]
    render(<MaterialIntentSurface options={routed} onResolved={noop} onCancel={noop} onError={noop} />)
    fireEvent.click(screen.getByText('Formulation'))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('builder-compound')).toBeNull() // no builder rendered
  })

  it('calls onCancel from the type picker', () => {
    const onCancel = vi.fn()
    render(<MaterialIntentSurface options={options()} cancelLabel="Back to search" onResolved={noop} onCancel={onCancel} onError={noop} />)
    fireEvent.click(screen.getByText('Back to search'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
