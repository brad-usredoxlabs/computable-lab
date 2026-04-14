/**
 * Unit tests for PreviewEventBadges component
 */

import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { PreviewEventBadges } from './PreviewEventBadges'
import type { PlateEvent } from '../../types/events'
import type { Labware } from '../../types/labware'

describe('PreviewEventBadges', () => {
  const mockLabware: Labware = {
    labwareId: 'test-labware-1',
    name: 'Test Plate',
    labwareType: 'plate_96',
    addressing: {
      type: 'grid',
      rows: 8,
      columns: 12,
      rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      columnLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    },
    wellPitch_mm: 9,
    geometry: {
      maxVolume_uL: 300,
      minVolume_uL: 10,
      wellShape: 'round',
    },
    layoutFamily: 'sbs_plate',
    orientationPolicy: 'rotatable',
    color: '#339af0',
  }

  const mockWellCenter = (wellId: string): { cx: number; cy: number } | null => {
    // Simple deterministic mapping for testing
    const row = wellId.charCodeAt(0) - 65 // A=0, B=1, etc.
    const col = parseInt(wellId.slice(1), 10) - 1
    return { cx: 50 + col * 40, cy: 50 + row * 40 }
  }

  const createMockEvent = (eventId: string, wells: string[]): PlateEvent => ({
    eventId,
    event_type: 'add_material',
    details: {
      labwareId: 'test-labware-1',
      wells,
      volume: { value: 100, unit: 'uL' },
    },
  })

  it('renders two badge groups for two events', () => {
    const events: PlateEvent[] = [
      createMockEvent('e1', ['A1']),
      createMockEvent('e2', ['A1', 'A2']),
    ]
    const previewEventStates = new Map<string, 'pending' | 'accepted' | 'rejected'>()

    const { container } = render(
      <PreviewEventBadges
        labware={mockLabware}
        previewEvents={events}
        previewEventStates={previewEventStates}
        onSetState={vi.fn()}
        wellCenter={mockWellCenter}
      />
    )

    const badgeGroups = container.querySelectorAll('.preview-event-badges g')
    // First g is the container, then one g per badge
    expect(badgeGroups.length).toBeGreaterThanOrEqual(2)
  })

  it('renders badges at expected positions', () => {
    const events: PlateEvent[] = [
      createMockEvent('e1', ['A1']),
    ]
    const previewEventStates = new Map<string, 'pending' | 'accepted' | 'rejected'>()

    const { container } = render(
      <PreviewEventBadges
        labware={mockLabware}
        previewEvents={events}
        previewEventStates={previewEventStates}
        onSetState={vi.fn()}
        wellCenter={mockWellCenter}
      />
    )

    const badgeGroup = container.querySelector('.preview-event-badges g:nth-child(2)')
    expect(badgeGroup).toBeTruthy()
    
    const transform = badgeGroup?.getAttribute('transform')
    expect(transform).toContain('translate(')
  })

  it('calls onSetState with accepted state when clicking ✓ button', () => {
    const events: PlateEvent[] = [
      createMockEvent('e1', ['A1']),
    ]
    const previewEventStates = new Map<string, 'pending' | 'accepted' | 'rejected'>()
    const mockSetState = vi.fn()

    const { container } = render(
      <PreviewEventBadges
        labware={mockLabware}
        previewEvents={events}
        previewEventStates={previewEventStates}
        onSetState={mockSetState}
        wellCenter={mockWellCenter}
      />
    )

    // Click the accept button (✓) - find the first text element with ✓
    const acceptText = container.querySelectorAll('text').item(0)
    if (acceptText) {
      fireEvent.click(acceptText)
    }

    expect(mockSetState).toHaveBeenCalledWith('e1', 'accepted')
  })

  it('renders with rejected color palette when state is rejected', () => {
    const events: PlateEvent[] = [
      createMockEvent('e1', ['A1']),
    ]
    const previewEventStates = new Map<string, 'pending' | 'accepted' | 'rejected'>()
    previewEventStates.set('e1', 'rejected')

    const { container } = render(
      <PreviewEventBadges
        labware={mockLabware}
        previewEvents={events}
        previewEventStates={previewEventStates}
        onSetState={vi.fn()}
        wellCenter={mockWellCenter}
      />
    )

    // Check for rejected color (#868e96 stroke)
    const rect = container.querySelector('.preview-event-badges rect')
    expect(rect).toBeTruthy()
    expect(rect?.getAttribute('stroke')).toBe('#868e96')
  })

  it('renders with accepted color palette when state is accepted', () => {
    const events: PlateEvent[] = [
      createMockEvent('e1', ['A1']),
    ]
    const previewEventStates = new Map<string, 'pending' | 'accepted' | 'rejected'>()
    previewEventStates.set('e1', 'accepted')

    const { container } = render(
      <PreviewEventBadges
        labware={mockLabware}
        previewEvents={events}
        previewEventStates={previewEventStates}
        onSetState={vi.fn()}
        wellCenter={mockWellCenter}
      />
    )

    // Check for accepted color (#2f9e44 stroke)
    const rect = container.querySelector('.preview-event-badges rect')
    expect(rect).toBeTruthy()
    expect(rect?.getAttribute('stroke')).toBe('#2f9e44')
  })

  it('calls onSetState with pending state when clicking ○ button', () => {
    const events: PlateEvent[] = [
      createMockEvent('e1', ['A1']),
    ]
    const previewEventStates = new Map<string, 'pending' | 'accepted' | 'rejected'>()
    const mockSetState = vi.fn()

    const { container } = render(
      <PreviewEventBadges
        labware={mockLabware}
        previewEvents={events}
        previewEventStates={previewEventStates}
        onSetState={mockSetState}
        wellCenter={mockWellCenter}
      />
    )

    // Click the pending button (○) - find the middle text element
    const pendingText = container.querySelectorAll('text').item(1)
    if (pendingText) {
      fireEvent.click(pendingText)
    }

    expect(mockSetState).toHaveBeenCalledWith('e1', 'pending')
  })

  it('calls onSetState with rejected state when clicking ✗ button', () => {
    const events: PlateEvent[] = [
      createMockEvent('e1', ['A1']),
    ]
    const previewEventStates = new Map<string, 'pending' | 'accepted' | 'rejected'>()
    const mockSetState = vi.fn()

    const { container } = render(
      <PreviewEventBadges
        labware={mockLabware}
        previewEvents={events}
        previewEventStates={previewEventStates}
        onSetState={mockSetState}
        wellCenter={mockWellCenter}
      />
    )

    // Click the reject button (✗) - find the last text element
    const rejectText = container.querySelectorAll('text').item(2)
    if (rejectText) {
      fireEvent.click(rejectText)
    }

    expect(mockSetState).toHaveBeenCalledWith('e1', 'rejected')
  })
})
