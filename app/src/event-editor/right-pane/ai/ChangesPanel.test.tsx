import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChangesPanel } from './ChangesPanel'

describe('ChangesPanel', () => {
  it('renders changes with + prefix for additions', () => {
    render(
      <ChangesPanel
        changes={[
          { op: 'add', description: 'Dispense complete DMEM into A1-H12' },
          { op: 'add', description: 'Agitate at 600 rpm for 5 min' },
        ]}
        warnings={[]}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )
    expect(screen.getByText(/Dispense complete DMEM/)).toBeDefined()
    expect(screen.getByText(/Agitate at 600 rpm/)).toBeDefined()
    expect(screen.getByText('Apply to run')).toBeDefined()
  })

  it('shows warnings', () => {
    render(
      <ChangesPanel
        changes={[]}
        warnings={[{ code: 'cap-gap', message: 'No shaker supports 1500 rpm', severity: 'warning' }]}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )
    expect(screen.getByText(/No shaker supports 1500 rpm/)).toBeDefined()
  })

  it('fires onApply when button clicked', () => {
    const onApply = vi.fn()
    render(
      <ChangesPanel
        changes={[{ op: 'add', description: 'test' }]}
        warnings={[]}
        onApply={onApply}
        onDiscard={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('Apply to run'))
    expect(onApply).toHaveBeenCalledOnce()
  })

  it('fires onDiscard when discard clicked', () => {
    const onDiscard = vi.fn()
    render(
      <ChangesPanel
        changes={[{ op: 'add', description: 'test' }]}
        warnings={[]}
        onApply={vi.fn()}
        onDiscard={onDiscard}
      />,
    )
    fireEvent.click(screen.getByText('Discard'))
    expect(onDiscard).toHaveBeenCalledOnce()
  })

  it('shows - prefix for removals and ~ for modifications', () => {
    render(
      <ChangesPanel
        changes={[
          { op: 'remove', description: 'Old step' },
          { op: 'modify', description: 'Changed step' },
        ]}
        warnings={[]}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )
    expect(screen.getByText('-')).toBeDefined()
    expect(screen.getByText('~')).toBeDefined()
  })
})
