/**
 * Tests for ProtocolIdeLabContextPanel — verifies rendering, badges, and
 * edit-triggered override callbacks.
 *
 * Covers:
 * - renders with default values
 * - renders with override badges showing provenance
 * - edit triggers onOverride callback (with debounce)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { ProtocolIdeLabContextPanel } from './ProtocolIdeLabContextPanel'
import type { LabContextSource } from './ProtocolIdeLabContextPanel'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLabContext(overrides?: {
  labwareKind?: string
  plateCount?: number
  sampleCount?: number
  source?: {
    labwareKind?: LabContextSource
    plateCount?: LabContextSource
    sampleCount?: LabContextSource
  }
}) {
  return {
    labwareKind: overrides?.labwareKind ?? '96-well-plate',
    plateCount: overrides?.plateCount ?? 1,
    sampleCount: overrides?.sampleCount ?? 96,
    source: {
      labwareKind: overrides?.source?.labwareKind ?? 'default',
      plateCount: overrides?.source?.plateCount ?? 'default',
      sampleCount: overrides?.source?.sampleCount ?? 'default',
    },
  }
}

function renderPanel(overrides?: {
  labContext?: ReturnType<typeof makeLabContext>
  onOverride?: (o: { labwareKind?: string; plateCount?: number; sampleCount?: number }) => Promise<void>
}) {
  const labContext = overrides?.labContext ?? makeLabContext()
  const onOverride = overrides?.onOverride ?? vi.fn()
  return render(
    <ProtocolIdeLabContextPanel labContext={labContext} onOverride={onOverride} />,
  )
}

// ---------------------------------------------------------------------------
// Tests — render with defaults
// ---------------------------------------------------------------------------

describe('ProtocolIdeLabContextPanel — render with defaults', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the panel container', () => {
    renderPanel()
    expect(screen.getByTestId('lab-context-panel')).toBeTruthy()
  })

  it('renders the panel title', () => {
    renderPanel()
    expect(screen.getByText('Lab Context')).toBeTruthy()
  })

  it('renders the labware kind row', () => {
    renderPanel()
    expect(screen.getByTestId('lab-context-row-labware-kind')).toBeTruthy()
    expect(screen.getByTestId('lab-context-input-labware-kind')).toHaveValue('96-well-plate')
  })

  it('renders the plate count row', () => {
    renderPanel()
    expect(screen.getByTestId('lab-context-row-plate-count')).toBeTruthy()
    const plateInput = screen.getByTestId('lab-context-input-plate-count')
    expect(plateInput).toHaveAttribute('value', '1')
  })

  it('renders the sample count row', () => {
    renderPanel()
    expect(screen.getByTestId('lab-context-row-sample-count')).toBeTruthy()
    const sampleInput = screen.getByTestId('lab-context-input-sample-count')
    expect(sampleInput).toHaveAttribute('value', '96')
  })

  it('shows "default" source badges when all sources are default', () => {
    renderPanel()
    const badges = screen.getAllByText('default')
    expect(badges.length).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// Tests — render with directive overrides showing badges
// ---------------------------------------------------------------------------

describe('ProtocolIdeLabContextPanel — render with directive overrides', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows "from directive" badge for directive-sourced fields', () => {
    renderPanel({
      labContext: makeLabContext({
        labwareKind: '384-well-plate',
        source: { labwareKind: 'directive' },
      }),
    })
    // The directive badge should be visible
    const directiveBadge = screen.getByText('from directive')
    expect(directiveBadge).toBeTruthy()
    expect(directiveBadge).toHaveStyle({ color: 'rgb(37, 99, 235)' })
  })

  it('shows "manual" badge for manual-sourced fields', () => {
    renderPanel({
      labContext: makeLabContext({
        plateCount: 4,
        source: { plateCount: 'manual' },
      }),
    })
    const manualBadge = screen.getByText('manual')
    expect(manualBadge).toBeTruthy()
    expect(manualBadge).toHaveStyle({ color: 'rgb(22, 163, 74)' })
  })

  it('shows correct values for directive-overridden fields', () => {
    renderPanel({
      labContext: makeLabContext({
        labwareKind: '384-well-plate',
        plateCount: 4,
        sampleCount: 384,
        source: {
          labwareKind: 'directive',
          plateCount: 'directive',
          sampleCount: 'directive',
        },
      }),
    })
    expect(screen.getByTestId('lab-context-input-labware-kind')).toHaveValue('384-well-plate')
    const plateInput = screen.getByTestId('lab-context-input-plate-count')
    expect(plateInput).toHaveAttribute('value', '4')
    const sampleInput = screen.getByTestId('lab-context-input-sample-count')
    expect(sampleInput).toHaveAttribute('value', '384')
  })
})

// ---------------------------------------------------------------------------
// Tests — edit triggers onOverride callback
// ---------------------------------------------------------------------------

describe('ProtocolIdeLabContextPanel — edit triggers onOverride', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('calls onOverride when labwareKind is edited', async () => {
    const onOverride = vi.fn().mockResolvedValue(undefined)
    renderPanel({ onOverride })

    const input = screen.getByTestId('lab-context-input-labware-kind')
    fireEvent.change(input, { target: { value: '6-well-plate' } })

    // Wait for debounce (500ms)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600))
    })

    expect(onOverride).toHaveBeenCalledTimes(1)
    expect(onOverride).toHaveBeenCalledWith({ labwareKind: '6-well-plate' })
  })

  it('calls onOverride when plateCount is edited', async () => {
    const onOverride = vi.fn().mockResolvedValue(undefined)
    renderPanel({ onOverride })

    const input = screen.getByTestId('lab-context-input-plate-count')
    fireEvent.change(input, { target: { value: '3' } })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600))
    })

    expect(onOverride).toHaveBeenCalledTimes(1)
    expect(onOverride).toHaveBeenCalledWith({ plateCount: 3 })
  })

  it('calls onOverride when sampleCount is edited', async () => {
    const onOverride = vi.fn().mockResolvedValue(undefined)
    renderPanel({ onOverride })

    const input = screen.getByTestId('lab-context-input-sample-count')
    fireEvent.change(input, { target: { value: '192' } })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600))
    })

    expect(onOverride).toHaveBeenCalledTimes(1)
    expect(onOverride).toHaveBeenCalledWith({ sampleCount: 192 })
  })

  it('does NOT call onOverride within the debounce window', async () => {
    const onOverride = vi.fn().mockResolvedValue(undefined)
    renderPanel({ onOverride })

    const input = screen.getByTestId('lab-context-input-labware-kind')
    fireEvent.change(input, { target: { value: '384-well-plate' } })

    // Wait less than debounce time
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200))
    })

    expect(onOverride).not.toHaveBeenCalled()
  })

  it('does NOT call onOverride for non-positive numbers', async () => {
    const onOverride = vi.fn().mockResolvedValue(undefined)
    renderPanel({ onOverride })

    const input = screen.getByTestId('lab-context-input-plate-count')
    fireEvent.change(input, { target: { value: '0' } })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600))
    })

    expect(onOverride).not.toHaveBeenCalled()
  })
})
