/**
 * DeviationRecorder - Unit tests.
 */

import { describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { DeviationRecorder, detectDeviations, type DetectedChange, type DeviationSavePayload } from '../DeviationRecorder'
import type { PlateEvent, EventDetails } from '../../types/events'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDetails(overrides: Partial<EventDetails> = {}): EventDetails {
  return {
    wells: ['A1'],
    labwareId: 'plate-1',
    ...overrides,
  } as EventDetails
}

function makeEvent(overrides: Partial<PlateEvent> = {}): PlateEvent {
  return {
    eventId: 'evt-1',
    event_type: 'add_material',
    at: undefined,
    t_offset: 'PT10M',
    notes: '',
    details: makeDetails(),
    ...overrides,
  } as PlateEvent
}

// ---------------------------------------------------------------------------
// detectDeviations
// ---------------------------------------------------------------------------

describe('detectDeviations', () => {
  it('returns empty array when events are identical', () => {
    const original = makeEvent()
    const current = makeEvent()
    const changes = detectDeviations(current, original)
    expect(changes).toEqual([])
  })

  it('detects a changed t_offset', () => {
    const original = makeEvent({ t_offset: 'PT10M' })
    const current = makeEvent({ t_offset: 'PT15M' })
    const changes = detectDeviations(current, original)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toEqual({
      field: 't_offset',
      originalValue: 'PT10M',
      actualValue: 'PT15M',
    })
  })

  it('detects a changed event_type', () => {
    const original = makeEvent({ event_type: 'add_material' })
    const current = makeEvent({ event_type: 'transfer' })
    const changes = detectDeviations(current, original)
    expect(changes).toContainEqual(
      expect.objectContaining({
        field: 'event_type',
        originalValue: 'add_material',
        actualValue: 'transfer',
      }),
    )
  })

  it('detects changed wells in details', () => {
    const original = makeEvent({
      details: makeDetails({ wells: ['A1', 'A2'] }),
    })
    const current = makeEvent({
      details: makeDetails({ wells: ['B1', 'B2'] }),
    })
    const changes = detectDeviations(current, original)
    const wellChange = changes.find((c) => c.field === 'details.wells')
    expect(wellChange).toBeDefined()
    expect(wellChange?.originalValue).toBe('["A1","A2"]')
    expect(wellChange?.actualValue).toBe('["B1","B2"]')
  })

  it('detects changed labwareId in details', () => {
    const original = makeEvent({
      details: makeDetails({ labwareId: 'plate-1' }),
    })
    const current = makeEvent({
      details: makeDetails({ labwareId: 'plate-2' }),
    })
    const changes = detectDeviations(current, original)
    const labwareChange = changes.find((c) => c.field === 'details.labwareId')
    expect(labwareChange).toBeDefined()
    expect(labwareChange?.originalValue).toBe('plate-1')
    expect(labwareChange?.actualValue).toBe('plate-2')
  })

  it('does not diff irrelevant detail keys', () => {
    const original = makeEvent({
      details: { _internal_key: 'a' } as EventDetails,
    })
    const current = makeEvent({
      details: { _internal_key: 'b' } as EventDetails,
    })
    const changes = detectDeviations(current, original)
    const irrelevant = changes.find((c) => c.field.includes('_internal_key'))
    expect(irrelevant).toBeUndefined()
  })

  it('detects added details fields', () => {
    const original = makeEvent({
      details: makeDetails({ wells: ['A1'] }),
    })
    const current = makeEvent({
      details: makeDetails({ wells: ['A1'], labwareId: 'new-plate' }),
    })
    const changes = detectDeviations(current, original)
    // Both events have labwareId ('plate-1' by default), so this should
    // detect the change from 'plate-1' to 'new-plate'
    const labwareChange = changes.find((c) => c.field === 'details.labwareId')
    expect(labwareChange).toBeDefined()
  })

  it('detects changed notes', () => {
    const original = makeEvent({ notes: undefined })
    const current = makeEvent({ notes: 'Operator noted spill' })
    const changes = detectDeviations(current, original)
    const notesChange = changes.find((c) => c.field === 'notes')
    expect(notesChange).toBeDefined()
    expect(notesChange?.originalValue).toBe('<no notes>')
    expect(notesChange?.actualValue).toBe('Operator noted spill')
  })

  it('detects changed at timestamp', () => {
    const original = makeEvent({ at: undefined })
    const current = makeEvent({ at: '2026-07-29T10:00:00Z' })
    const changes = detectDeviations(current, original)
    const atChange = changes.find((c) => c.field === 'at')
    expect(atChange).toBeDefined()
    expect(atChange?.originalValue).toBe('<not executed>')
    expect(atChange?.actualValue).toBe('2026-07-29T10:00:00Z')
  })
})

// ---------------------------------------------------------------------------
// DeviationRecorder rendering and interactions
// ---------------------------------------------------------------------------

function renderRecorder(opts: {
  event?: PlateEvent
  originalEvent?: PlateEvent
  onSave?: (p: DeviationSavePayload) => void
  onCancel?: () => void
  isOpen?: boolean
} = {}) {
  const event = opts.event ?? makeEvent()
  const originalEvent = opts.originalEvent ?? makeEvent()
  const onSave = opts.onSave ?? vi.fn()
  const onCancel = opts.onCancel ?? vi.fn()

  return render(
    <DeviationRecorder
      event={event}
      originalEvent={originalEvent}
      onSave={onSave}
      onCancel={onCancel}
      isOpen={opts.isOpen ?? true}
    />,
  )
}

describe('DeviationRecorder rendering', () => {
  it('returns null when isOpen is false', () => {
    render(
      <DeviationRecorder
        event={makeEvent()}
        originalEvent={makeEvent()}
        onSave={() => {}}
        onCancel={() => {}}
        isOpen={false}
      />,
    )
    expect(screen.queryByTestId('deviation-recorder')).not.toBeInTheDocument()
  })

  it('renders the dialog when isOpen is true', () => {
    renderRecorder()
    expect(screen.getByTestId('deviation-recorder')).toBeInTheDocument()
    expect(screen.getByText('Record Deviation')).toBeInTheDocument()
  })

  it('displays the event ID', () => {
    renderRecorder({ event: makeEvent({ eventId: 'evt-abc' }) })
    expect(screen.getByText(/evt-abc/)).toBeInTheDocument()
  })

  it('renders detected changes when events differ', () => {
    const original = makeEvent({ t_offset: 'PT10M' })
    const current = makeEvent({ t_offset: 'PT15M' })
    renderRecorder({ event: current, originalEvent: original })

    const changes = screen.getByTestId('deviation-recorder-changes')
    expect(changes).toBeInTheDocument()
    expect(screen.getByText('Detected changes (1)')).toBeInTheDocument()
  })

  it('renders original value with strikethrough class', () => {
    const original = makeEvent({ t_offset: 'PT10M' })
    const current = makeEvent({ t_offset: 'PT15M' })
    renderRecorder({ event: current, originalEvent: original })

    const originalEl = screen.getByTestId('original-value')
    expect(originalEl).toHaveTextContent('PT10M')
    // Check the class that applies strikethrough (jsdom doesn't compute inline <style> CSS)
    expect(originalEl.className).toBe('deviation-recorder__value-original')
  })

  it('renders actual value highlighted', () => {
    const original = makeEvent({ t_offset: 'PT10M' })
    const current = makeEvent({ t_offset: 'PT15M' })
    renderRecorder({ event: current, originalEvent: original })

    const actualEl = screen.getByTestId('actual-value')
    expect(actualEl).toHaveTextContent('PT15M')
  })

  it('shows "no automatic deviations detected" when events match', () => {
    const event = makeEvent()
    renderRecorder({ event, originalEvent: event })
    expect(screen.getByTestId('deviation-recorder-no-changes')).toBeInTheDocument()
  })

  it('renders the reason textarea', () => {
    renderRecorder()
    const textarea = screen.getByTestId('deviation-recorder-reason')
    expect(textarea).toBeInTheDocument()
    expect(textarea).toBeEmpty()
  })

  it('renders save and cancel buttons', () => {
    renderRecorder()
    expect(screen.getByTestId('deviation-recorder-save')).toBeInTheDocument()
    expect(screen.getByTestId('deviation-recorder-cancel')).toBeInTheDocument()
  })

  it('disables save button when reason is empty', () => {
    renderRecorder()
    const saveBtn = screen.getByTestId('deviation-recorder-save')
    expect(saveBtn).toBeDisabled()
  })

  it('enables save button when reason has content', () => {
    renderRecorder()
    const textarea = screen.getByTestId('deviation-recorder-reason')
    fireEvent.change(textarea, { target: { value: 'Reagent was expired' } })
    const saveBtn = screen.getByTestId('deviation-recorder-save')
    expect(saveBtn).not.toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// Save and cancel callbacks
// ---------------------------------------------------------------------------

describe('DeviationRecorder callbacks', () => {
  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn()
    renderRecorder({ onCancel })
    fireEvent.click(screen.getByTestId('deviation-recorder-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when overlay is clicked', () => {
    const onCancel = vi.fn()
    renderRecorder({ onCancel })
    fireEvent.click(screen.getByTestId('deviation-recorder-overlay'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onSave with correct DeviationData on form submit', () => {
    const onSave = vi.fn()
    const original = makeEvent({ t_offset: 'PT10M' })
    const current = makeEvent({ t_offset: 'PT15M' })

    renderRecorder({ event: current, originalEvent: original, onSave })

    const textarea = screen.getByTestId('deviation-recorder-reason')
    fireEvent.change(textarea, { target: { value: 'Planned time was too short' } })

    const saveBtn = screen.getByTestId('deviation-recorder-save')
    fireEvent.click(saveBtn)

    expect(onSave).toHaveBeenCalledTimes(1)
    const payload = onSave.mock.calls[0][0] as DeviationSavePayload

    // Provenance fields
    expect(payload.eventId).toBe('evt-1')
    expect(payload.deviationType).toBe('operator')
    expect(payload.deviationCode).toBe('detected')
    expect(payload.reportedBy).toBe('current-operator')
    expect(payload.reportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    expect(payload.severity).toBe('warning')

    // User input
    expect(payload.reason).toBe('Planned time was too short')
    expect(payload.notes).toBe('Planned time was too short')

    // Changes
    expect(payload.changes).toHaveLength(1)
    expect(payload.changes[0].field).toBe('t_offset')
    expect(payload.changes[0].originalValue).toBe('PT10M')
    expect(payload.changes[0].actualValue).toBe('PT15M')

    // expectedValue / actualValue aggregates
    expect(payload.expectedValue).toBe('PT10M')
    expect(payload.actualValue).toBe('PT15M')
  })

  it('does not call onSave when reason is empty', () => {
    const onSave = vi.fn()
    renderRecorder({ onSave })

    // Try to submit the form without entering a reason
    const form = document.querySelector('form')!
    fireEvent.submit(form)

    expect(onSave).not.toHaveBeenCalled()
  })

  it('handles multiple detected changes in payload', () => {
    const onSave = vi.fn()
    const original = makeEvent({
      t_offset: 'PT10M',
      details: makeDetails({ wells: ['A1'], labwareId: 'plate-1' }),
    })
    const current = makeEvent({
      t_offset: 'PT15M',
      details: makeDetails({ wells: ['B2'], labwareId: 'plate-2' }),
    })

    renderRecorder({ event: current, originalEvent: original, onSave })

    const textarea = screen.getByTestId('deviation-recorder-reason')
    fireEvent.change(textarea, { target: { value: 'Multiple changes' } })

    fireEvent.click(screen.getByTestId('deviation-recorder-save'))

    expect(onSave).toHaveBeenCalledTimes(1)
    const payload = onSave.mock.calls[0][0] as DeviationSavePayload
    // Should detect: t_offset, wells, labwareId
    expect(payload.changes.length).toBeGreaterThanOrEqual(3)
  })

  it('renders multiple change items', () => {
    const original = makeEvent({
      t_offset: 'PT10M',
      details: makeDetails({ wells: ['A1'], labwareId: 'plate-1' }),
    })
    const current = makeEvent({
      t_offset: 'PT15M',
      details: makeDetails({ wells: ['B2'], labwareId: 'plate-2' }),
    })

    renderRecorder({ event: current, originalEvent: original })

    const changeItems = screen.getAllByTestId('deviation-recorder-change-item')
    expect(changeItems.length).toBeGreaterThanOrEqual(3)
  })
})
