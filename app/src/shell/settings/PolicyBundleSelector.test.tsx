/**
 * PolicyBundleSelector — renders the bundle catalog reported by the server
 * (via props), marks the active bundle, and never falls back to a hardcoded
 * catalog.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PolicyBundleSelector, type PolicyBundleView } from '../../components/settings/PolicyBundleSelector'

const BUNDLES: PolicyBundleView[] = [
  { id: 'POL-SANDBOX', label: 'Sandbox', level: 0, description: 'Zero friction.' },
  { id: 'POL-NOTEBOOK', label: 'Lab Notebook', level: 1, description: 'Surface, never block.' },
  { id: 'POL-REGULATED', label: 'Regulated', level: 3, description: 'Full QMS enforcement.' },
]

describe('PolicyBundleSelector', () => {
  let onBundleChanged: (bundleId: string) => void

  beforeEach(() => {
    onBundleChanged = vi.fn()
  })

  function renderSelector(bundles: PolicyBundleView[], currentBundleId = 'POL-SANDBOX') {
    return render(
      <PolicyBundleSelector
        currentBundleId={currentBundleId}
        bundles={bundles}
        onBundleChanged={onBundleChanged}
      />,
    )
  }

  it('renders a card per bundle passed in props and marks only the current one', () => {
    renderSelector(BUNDLES)
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBe(3)
    expect(screen.getByText('Sandbox')).toBeDefined()
    expect(screen.getByText('Lab Notebook')).toBeDefined()
    expect(screen.getByText('Regulated')).toBeDefined()
    // Check icon present only on the active card.
    const icons = document.querySelectorAll('svg')
    expect(icons.length).toBe(1)
    const activeCard = screen.getByText('Sandbox').closest('button')!
    expect(activeCard.querySelector('svg')).not.toBeNull()
    const inactiveCard = screen.getByText('Regulated').closest('button')!
    expect(inactiveCard.querySelector('svg')).toBeNull()
  })

  it('calls onBundleChanged with the clicked bundle id', () => {
    renderSelector(BUNDLES)
    fireEvent.click(screen.getByText('Regulated').closest('button')!)
    expect(onBundleChanged).toHaveBeenCalledTimes(1)
    expect(onBundleChanged).toHaveBeenCalledWith('POL-REGULATED')
  })

  it('renders only the bundles passed in props — no hardcoded catalog', () => {
    renderSelector([{ id: 'POL-CUSTOM', label: 'Custom', level: 7 }])
    expect(screen.getByText('Custom')).toBeDefined()
    expect(screen.queryByText('Regulated')).toBeNull()
    expect(screen.queryByText('Sandbox')).toBeNull()
  })

  it('shows an empty-state marker when the server reports no bundles', () => {
    renderSelector([])
    expect(screen.getByTestId('policy-bundle-empty')).toBeDefined()
    expect(screen.getByTestId('policy-bundle-empty').textContent).toContain(
      'No policy bundles reported by server',
    )
    expect(screen.queryAllByRole('button').length).toBe(0)
  })
})
