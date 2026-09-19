/**
 * SourcesStrip tests.
 *
 * Contract after 2026-09-19: the strip NO LONGER renders non-interactive
 * auto-attached chips (Study / Deck / Overview). They duplicated the top-level
 * surface indicator, were not clickable, and burned the AI panel's scarcest real
 * estate ("If even I don't know what they're for, no biologist will").
 *
 * What remains: the sources the user actually attached this session (clickable,
 * opens the artifact in the viewer) and the "+ Add source" affordance.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SourcesStrip, type AddedSource } from './SourcesStrip'

afterEach(() => cleanup())

function renderStrip(overrides: { addedSources?: AddedSource[] } = {}) {
  const onAddSource = vi.fn()
  const onOpenSource = vi.fn()
  render(
    <SourcesStrip
      addedSources={overrides.addedSources ?? []}
      onAddSource={onAddSource}
      onOpenSource={onOpenSource}
    />,
  )
  return { onAddSource, onOpenSource }
}

describe('SourcesStrip', () => {
  it('renders no auto-attached chips at all', () => {
    renderStrip()
    expect(screen.queryByTestId('sources-chip-study')).toBeNull()
    expect(screen.queryByTestId('sources-chip-deck')).toBeNull()
    expect(screen.queryByTestId('sources-chip-pdf')).toBeNull()
    expect(screen.queryByTestId('sources-chip-document')).toBeNull()
    expect(screen.queryByTestId('sources-chip-project-details')).toBeNull()
  })

  it('keeps the + Add source affordance and the guidance hint', () => {
    renderStrip()
    expect(screen.getByTestId('sources-strip-add')).toBeTruthy()
    // Hint reads "Find", not "Browse" — Phase 12 rename followed through.
    expect(screen.getByText(/Find/)).toBeTruthy()
    expect(screen.queryByText(/Browse/)).toBeNull()
  })

  it('renders added-source chips and routes clicks to onOpenSource', () => {
    const { onOpenSource } = renderStrip({
      addedSources: [
        { artifactId: 'ART-ADD-1', title: 'Vendor PDF 1' },
        { artifactId: 'ART-ADD-2', title: 'Vendor PDF 2' },
      ],
    })
    expect(screen.getByTestId('sources-chip-added-ART-ADD-1')).toBeTruthy()
    fireEvent.click(screen.getByTestId('sources-chip-added-ART-ADD-1'))
    expect(onOpenSource).toHaveBeenCalledWith('ART-ADD-1')
  })

  it('hides the hint once a source is attached', () => {
    renderStrip({ addedSources: [{ artifactId: 'ART-ADD-1', title: 'Vendor PDF 1' }] })
    expect(screen.queryByText(/attach more context/)).toBeNull()
  })

  it('routes the + Add source button to onAddSource', () => {
    const { onAddSource } = renderStrip()
    fireEvent.click(screen.getByTestId('sources-strip-add'))
    expect(onAddSource).toHaveBeenCalledOnce()
  })
})
