/**
 * Tests for StudyPickerPopover.
 *
 * Covers:
 *  - on mount, calls apiClient.listRecordsByKind('study') and renders rows
 *  - typing triggers searchProjects (JSON-LD full-text search)
 *  - arrow-down then Enter calls onPick with the highlighted row
 *  - clicking a row calls onPick
 *  - empty state when the search has no matches
 *  - errors from the API surface inline without dismissing the popover
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StudyPickerPopover } from './StudyPickerPopover'

const listRecordsByKind = vi.fn()
const searchProjects = vi.fn()

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    listRecordsByKind: (...args: unknown[]) => listRecordsByKind(...args),
    searchProjects: (...args: unknown[]) => searchProjects(...args),
  },
}))

beforeEach(() => {
  listRecordsByKind.mockReset()
  searchProjects.mockReset()
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

const studySearchHits = [
  {
    studyId: 'STU-000002',
    title: 'Cell viability',
    matches: [
      {
        recordId: 'RUN-000001',
        kind: 'run',
        label: 'Day 1 measurements',
        path: 'Cell viability → Experiment A → Day 1 measurements',
        snippet: 'cell viability assay results',
      },
    ],
  },
  {
    studyId: 'STU-000001',
    title: 'Hepatocyte study',
    matches: [
      {
        recordId: 'MAT-000002',
        kind: 'material',
        label: 'Primary hepatocytes',
        path: 'Hepatocyte study → Primary hepatocytes',
        snippet: 'hepatocyte cell line',
      },
    ],
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

  it('filters rows by query substring (backend-driven search)', async () => {
    listRecordsByKind.mockResolvedValue({ records: studies, total: 3 })
    searchProjects.mockResolvedValue({
      studies: [
        {
          studyId: 'STU-000002',
          title: 'Cell viability',
          matches: [],
        },
      ],
      total: 1,
    })
    render(<StudyPickerPopover onPick={vi.fn()} onDismiss={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByTestId('study-picker-row-STU-000001')).toBeTruthy(),
    )
    const input = screen.getByTestId('study-picker-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'cell' } })
    // Non-empty query triggers debounced searchProjects (300ms)
    await waitFor(() => {
      expect(searchProjects).toHaveBeenCalledWith('cell')
    })
    // Search results show only matching study
    await waitFor(() => {
      expect(screen.getByTestId('study-picker-row-STU-000002')).toBeTruthy()
      expect(screen.queryByTestId('study-picker-row-STU-000001')).toBeNull()
      expect(screen.queryByTestId('study-picker-row-STU-000003')).toBeNull()
    })
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
    searchProjects.mockResolvedValue({ studies: [], total: 0 })
    render(<StudyPickerPopover onPick={vi.fn()} onDismiss={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByTestId('study-picker-row-STU-000001')).toBeTruthy(),
    )
    const input = screen.getByTestId('study-picker-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'no-such-study' } })
    await waitFor(() => {
      expect(screen.getByText(/No studies match/)).toBeTruthy()
    })
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

  it('surfaces search errors inline instead of silently returning no feedback', async () => {
    listRecordsByKind.mockResolvedValue({ records: studies, total: 3 })
    searchProjects.mockRejectedValue(new Error('search endpoint is down'))
    render(<StudyPickerPopover onPick={vi.fn()} onDismiss={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByTestId('study-picker-row-STU-000001')).toBeTruthy(),
    )
    const input = screen.getByTestId('study-picker-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'cell' } })
    await waitFor(() => {
      expect(screen.getByText('Search failed: search endpoint is down')).toBeTruthy()
    })
  })

  it('shows search results with match paths', async () => {
    listRecordsByKind.mockResolvedValue({ records: studies, total: 3 })
    searchProjects.mockResolvedValue({ studies: studySearchHits, total: 2 })
    render(<StudyPickerPopover onPick={vi.fn()} onDismiss={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByTestId('study-picker-row-STU-000001')).toBeTruthy(),
    )
    const input = screen.getByTestId('study-picker-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'cell viability' } })
    await waitFor(() => {
      expect(searchProjects).toHaveBeenCalledWith('cell viability')
    })
    // Results sorted by match count, then title
    const rows = screen.getAllByRole('option')
    expect(rows[0].textContent).toContain('Cell viability')
    expect(rows[1].textContent).toContain('Hepatocyte study')
  })
})
