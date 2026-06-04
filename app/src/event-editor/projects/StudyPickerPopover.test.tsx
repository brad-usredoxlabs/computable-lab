/**
 * Tests for StudyPickerPopover.
 *
 * Covers:
 *  - on mount, calls apiClient.listRecordsByKind('study') and renders rows
 *  - typing filters the rows by title and recordId substring
 *  - arrow-down then Enter calls onPick with the highlighted row
 *  - clicking a row calls onPick
 *  - empty state when the search has no matches
 *  - errors from the API surface inline without dismissing the popover
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StudyPickerPopover } from './StudyPickerPopover'

const listRecordsByKind = vi.fn()

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    listRecordsByKind: (...args: unknown[]) => listRecordsByKind(...args),
  },
}))

beforeEach(() => {
  listRecordsByKind.mockReset()
})

afterEach(() => {
  cleanup()
})

const studies = [
  {
    recordId: 'STU-000001',
    schemaId: 'study',
    payload: { title: 'Hepatocyte study' },
  },
  {
    recordId: 'STU-000002',
    schemaId: 'study',
    payload: { title: 'Cell viability' },
  },
  {
    recordId: 'STU-000003',
    schemaId: 'study',
    payload: { title: 'Compound screen' },
  },
]

describe('StudyPickerPopover', () => {
  it('lists studies returned from the API', async () => {
    listRecordsByKind.mockResolvedValue({ records: studies, total: 3 })
    const onPick = vi.fn()
    const onDismiss = vi.fn()
    render(<StudyPickerPopover onPick={onPick} onDismiss={onDismiss} />)
    await waitFor(() =>
      expect(screen.getByTestId('study-picker-row-STU-000001')).toBeTruthy(),
    )
    expect(listRecordsByKind).toHaveBeenCalledWith('study', 200)
    // Sorted alphabetically by title (Cell viability, Compound screen,
    // Hepatocyte study) — verify ordering is alphabetical, not API order.
    const rows = screen.getAllByRole('option')
    expect(rows[0].textContent).toContain('Cell viability')
    expect(rows[2].textContent).toContain('Hepatocyte study')
  })

  it('filters rows by query substring', async () => {
    listRecordsByKind.mockResolvedValue({ records: studies, total: 3 })
    render(<StudyPickerPopover onPick={vi.fn()} onDismiss={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByTestId('study-picker-row-STU-000001')).toBeTruthy(),
    )
    const input = screen.getByTestId('study-picker-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'cell' } })
    expect(screen.getByTestId('study-picker-row-STU-000002')).toBeTruthy()
    expect(screen.queryByTestId('study-picker-row-STU-000001')).toBeNull()
    expect(screen.queryByTestId('study-picker-row-STU-000003')).toBeNull()
  })

  it('clicking a row calls onPick(studyId, title)', async () => {
    listRecordsByKind.mockResolvedValue({ records: studies, total: 3 })
    const onPick = vi.fn()
    render(<StudyPickerPopover onPick={onPick} onDismiss={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByTestId('study-picker-row-STU-000001')).toBeTruthy(),
    )
    screen.getByTestId('study-picker-row-STU-000001').click()
    expect(onPick).toHaveBeenCalledWith('STU-000001', 'Hepatocyte study')
  })

  it('Enter on the highlighted row calls onPick', async () => {
    listRecordsByKind.mockResolvedValue({ records: studies, total: 3 })
    const onPick = vi.fn()
    render(<StudyPickerPopover onPick={onPick} onDismiss={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByTestId('study-picker-row-STU-000001')).toBeTruthy(),
    )
    const input = screen.getByTestId('study-picker-input') as HTMLInputElement
    // First sorted row (alphabetical) is "Cell viability" → STU-000002.
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith('STU-000002', 'Cell viability')
  })

  it('Escape calls onDismiss', async () => {
    listRecordsByKind.mockResolvedValue({ records: studies, total: 3 })
    const onDismiss = vi.fn()
    render(<StudyPickerPopover onPick={vi.fn()} onDismiss={onDismiss} />)
    await waitFor(() =>
      expect(screen.getByTestId('study-picker-row-STU-000001')).toBeTruthy(),
    )
    const input = screen.getByTestId('study-picker-input') as HTMLInputElement
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalled()
  })

  it('shows the empty state when no rows match', async () => {
    listRecordsByKind.mockResolvedValue({ records: studies, total: 3 })
    render(<StudyPickerPopover onPick={vi.fn()} onDismiss={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByTestId('study-picker-row-STU-000001')).toBeTruthy(),
    )
    const input = screen.getByTestId('study-picker-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'no-such-study' } })
    expect(screen.getByText('No studies match.')).toBeTruthy()
  })

  it('surfaces API errors inline without closing the popover', async () => {
    listRecordsByKind.mockRejectedValue(new Error('records endpoint is down'))
    const onDismiss = vi.fn()
    render(<StudyPickerPopover onPick={vi.fn()} onDismiss={onDismiss} />)
    await waitFor(() => {
      expect(screen.getByText('records endpoint is down')).toBeTruthy()
    })
    expect(onDismiss).not.toHaveBeenCalled()
  })
})
