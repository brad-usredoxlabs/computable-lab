/**
 * Focused tests for ProtocolIdeCandidateReviewPanel — verifies variant
 * rendering, button presence, and selection callback.
 *
 * Covers:
 * - renders with 2 variants; both 'Use this variant' buttons present
 * - click button calls onSelectVariant with the right index
 * - single-candidate case renders one card
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ProtocolIdeCandidateReviewPanel } from './ProtocolIdeCandidateReviewPanel'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockAwaitingVariantSelection(variantCount: number) {
  return {
    extractionDraftRef: 'draft-PIS-001',
    variants: Array.from({ length: variantCount }, (_, i) => ({
      index: i,
      displayName: `Variant ${i + 1}`,
      variantLabel: i === 0 ? 'cell culture' : 'plant matter',
      sectionCount: 3 + i,
    })),
  }
}

// ---------------------------------------------------------------------------
// Tests — multi-variant render
// ---------------------------------------------------------------------------

describe('ProtocolIdeCandidateReviewPanel — multi-variant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders with 2 variants and both buttons present', () => {
    const mockOnSelect = vi.fn()
    const awaiting = makeMockAwaitingVariantSelection(2)

    render(
      <ProtocolIdeCandidateReviewPanel
        awaitingVariantSelection={awaiting}
        onSelectVariant={mockOnSelect}
      />,
    )

    expect(screen.getByTestId('protocol-ide-candidate-review')).toBeTruthy()
    expect(screen.getByTestId('variant-card-0')).toBeTruthy()
    expect(screen.getByTestId('variant-card-1')).toBeTruthy()
    expect(screen.getByTestId('variant-select-0')).toBeTruthy()
    expect(screen.getByTestId('variant-select-1')).toBeTruthy()
  })

  it('clicks button calls onSelectVariant with the right index', () => {
    const mockOnSelect = vi.fn()
    const awaiting = makeMockAwaitingVariantSelection(2)

    render(
      <ProtocolIdeCandidateReviewPanel
        awaitingVariantSelection={awaiting}
        onSelectVariant={mockOnSelect}
      />,
    )

    fireEvent.click(screen.getByTestId('variant-select-0'))
    expect(mockOnSelect).toHaveBeenCalledWith(0)

    fireEvent.click(screen.getByTestId('variant-select-1'))
    expect(mockOnSelect).toHaveBeenCalledWith(1)
  })

  it('renders variant labels correctly', () => {
    const mockOnSelect = vi.fn()
    const awaiting = makeMockAwaitingVariantSelection(2)

    render(
      <ProtocolIdeCandidateReviewPanel
        awaitingVariantSelection={awaiting}
        onSelectVariant={mockOnSelect}
      />,
    )

    expect(screen.getByText('Variant 1')).toBeTruthy()
    expect(screen.getByText('Variant 2')).toBeTruthy()
    expect(screen.getByText('cell culture')).toBeTruthy()
    expect(screen.getByText('plant matter')).toBeTruthy()
    expect(screen.getByText('3 sections')).toBeTruthy()
    expect(screen.getByText('4 sections')).toBeTruthy()
  })

  it('renders "(no variant label)" when variantLabel is null', () => {
    const mockOnSelect = vi.fn()
    const awaiting = {
      extractionDraftRef: 'draft-PIS-001',
      variants: [
        {
          index: 0,
          displayName: 'Default variant',
          variantLabel: null,
          sectionCount: 5,
        },
      ],
    }

    render(
      <ProtocolIdeCandidateReviewPanel
        awaitingVariantSelection={awaiting}
        onSelectVariant={mockOnSelect}
      />,
    )

    expect(screen.getByText('(no variant label)')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Tests — single-candidate render
// ---------------------------------------------------------------------------

describe('ProtocolIdeCandidateReviewPanel — single-candidate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders one card for single variant', () => {
    const mockOnSelect = vi.fn()
    const awaiting = makeMockAwaitingVariantSelection(1)

    render(
      <ProtocolIdeCandidateReviewPanel
        awaitingVariantSelection={awaiting}
        onSelectVariant={mockOnSelect}
      />,
    )

    expect(screen.getByTestId('variant-card-0')).toBeTruthy()
    expect(screen.queryByTestId('variant-card-1')).toBeNull()
  })

  it('clicks button calls onSelectVariant with index 0', () => {
    const mockOnSelect = vi.fn()
    const awaiting = makeMockAwaitingVariantSelection(1)

    render(
      <ProtocolIdeCandidateReviewPanel
        awaitingVariantSelection={awaiting}
        onSelectVariant={mockOnSelect}
      />,
    )

    fireEvent.click(screen.getByTestId('variant-select-0'))
    expect(mockOnSelect).toHaveBeenCalledWith(0)
  })
})
