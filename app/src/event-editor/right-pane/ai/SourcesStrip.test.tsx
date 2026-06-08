/**
 * SourcesStrip tests — covers the auto-attached chips, the added-source
 * chip click behavior, and the "+ Add source" button.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SourcesStrip, type AddedSource } from './SourcesStrip'
import type { WorkspaceTab } from '../../workspace/types'

afterEach(() => cleanup())

function renderStrip(overrides: {
  activeTab?: WorkspaceTab | null
  addedSources?: AddedSource[]
  onAddSource?: () => void
  onOpenSource?: (artifactId: string) => void
} = {}) {
  const onAddSource = overrides.onAddSource ?? vi.fn()
  const onOpenSource = overrides.onOpenSource ?? vi.fn()
  render(
    <SourcesStrip
      studyId="STU-000001"
      activeTab={overrides.activeTab ?? null}
      addedSources={overrides.addedSources ?? []}
      onAddSource={onAddSource}
      onOpenSource={onOpenSource}
    />,
  )
  return { onAddSource, onOpenSource }
}

describe('SourcesStrip', () => {
  it('renders the Study chip and the + Add source button when no other context', () => {
    renderStrip()
    expect(screen.getByTestId('sources-chip-study').textContent).toContain(
      'STU-000001',
    )
    expect(screen.getByTestId('sources-strip-add')).toBeTruthy()
    // Hint reads "Find", not "Browse" — Phase 12 rename followed through.
    expect(screen.getByText(/Find/)).toBeTruthy()
    expect(screen.queryByText(/Browse/)).toBeNull()
  })

  it('hides the hint once a viewer chip is attached', () => {
    renderStrip({
      activeTab: { id: 't', kind: 'pdf', artifactId: 'ART-1', title: 'X' },
    })
    expect(screen.getByTestId('sources-chip-pdf')).toBeTruthy()
    expect(screen.queryByText(/attach more context/)).toBeNull()
  })

  it('renders added-source chips after auto chips and routes clicks to onOpenSource', () => {
    const onOpenSource = vi.fn()
    renderStrip({
      addedSources: [
        { artifactId: 'ART-ADD-1', title: 'Vendor PDF 1' },
        { artifactId: 'ART-ADD-2', title: 'Vendor PDF 2' },
      ],
      onOpenSource,
    })
    fireEvent.click(screen.getByTestId('sources-chip-added-ART-ADD-1'))
    expect(onOpenSource).toHaveBeenCalledWith('ART-ADD-1')
  })

  it('clicking + Add source fires onAddSource', () => {
    const onAddSource = vi.fn()
    renderStrip({ onAddSource })
    fireEvent.click(screen.getByTestId('sources-strip-add'))
    expect(onAddSource).toHaveBeenCalledTimes(1)
  })
})
