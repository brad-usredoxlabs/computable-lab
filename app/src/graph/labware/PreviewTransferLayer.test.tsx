/**
 * Unit tests for PreviewTransferLayer component
 */

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { PreviewTransferLayer, type WellCenter } from './PreviewTransferLayer'
import type { PlateEvent } from '../../types/events'

describe('PreviewTransferLayer', () => {
  const createTransferEvent = (
    eventId: string,
    sourceWell: string,
    targetWell: string,
    volume?: { value: number; unit: string }
  ): PlateEvent => ({
    eventId,
    event_type: 'transfer',
    details: {
      source_wells: [sourceWell],
      dest_wells: [targetWell],
      ...(volume ? { volume } : {}),
    },
  })

  const createMultiDispenseEvent = (
    eventId: string,
    sourceWell: string,
    targetWell: string,
    volume?: { value: number; unit: string }
  ): PlateEvent => ({
    eventId,
    event_type: 'multi_dispense',
    details: {
      source_wells: [sourceWell],
      dest_wells: [targetWell],
      ...(volume ? { volume } : {}),
    },
  })

  const mockWellCenters: Map<string, WellCenter> = new Map([
    ['A1', { x: 50, y: 50 }],
    ['B2', { x: 150, y: 150 }],
    ['C3', { x: 250, y: 250 }],
  ])

  it('renders one line for one transfer event with both source and target in wellCenters', () => {
    const events: PlateEvent[] = [
      createTransferEvent('evt-1', 'A1', 'B2', { value: 50, unit: 'uL' }),
    ]

    const { container } = render(
      <PreviewTransferLayer
        previewEvents={events}
        wellCenters={mockWellCenters}
      />
    )

    const arrows = container.querySelectorAll('[data-testid="preview-transfer-arrow"]')
    expect(arrows.length).toBe(1)

    const text = container.querySelector('[data-testid="preview-transfer-arrow"] text')
    expect(text).toBeTruthy()
    expect(text?.textContent).toContain('50')
    expect(text?.textContent).toContain('uL')
  })

  it('renders zero lines (returns null) when no transfer events', () => {
    const events: PlateEvent[] = []

    const { container } = render(
      <PreviewTransferLayer
        previewEvents={events}
        wellCenters={mockWellCenters}
      />
    )

    const svg = container.querySelector('[data-testid="preview-transfer-layer"]')
    expect(svg).toBeNull()
  })

  it('skips events whose source or target is missing from wellCenters without throwing', () => {
    const events: PlateEvent[] = [
      createTransferEvent('evt-1', 'A1', 'B2', { value: 50, unit: 'uL' }),
      createTransferEvent('evt-2', 'A1', 'C3', { value: 100, unit: 'uL' }),
    ]

    // Only A1 is in wellCenters, B2 and C3 are missing
    const partialCenters: Map<string, WellCenter> = new Map([
      ['A1', { x: 50, y: 50 }],
    ])

    const { container } = render(
      <PreviewTransferLayer
        previewEvents={events}
        wellCenters={partialCenters}
      />
    )

    const arrows = container.querySelectorAll('[data-testid="preview-transfer-arrow"]')
    expect(arrows.length).toBe(0)
  })

  it('renders arrows for multi_dispense events', () => {
    const events: PlateEvent[] = [
      createMultiDispenseEvent('evt-1', 'A1', 'B2', { value: 25, unit: 'uL' }),
    ]

    const { container } = render(
      <PreviewTransferLayer
        previewEvents={events}
        wellCenters={mockWellCenters}
      />
    )

    const arrows = container.querySelectorAll('[data-testid="preview-transfer-arrow"]')
    expect(arrows.length).toBe(1)
  })

  it('omits label when volume is not available', () => {
    const events: PlateEvent[] = [
      createTransferEvent('evt-1', 'A1', 'B2'),
    ]

    const { container } = render(
      <PreviewTransferLayer
        previewEvents={events}
        wellCenters={mockWellCenters}
      />
    )

    const text = container.querySelector('[data-testid="preview-transfer-arrow"] text')
    expect(text).toBeNull()
  })

  it('returns null when wellCenters is empty', () => {
    const events: PlateEvent[] = [
      createTransferEvent('evt-1', 'A1', 'B2', { value: 50, unit: 'uL' }),
    ]

    const { container } = render(
      <PreviewTransferLayer
        previewEvents={events}
        wellCenters={new Map()}
      />
    )

    const svg = container.querySelector('[data-testid="preview-transfer-layer"]')
    expect(svg).toBeNull()
  })
})
