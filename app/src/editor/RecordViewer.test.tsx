/**
 * Focused tests for RecordViewer — projection-backed read-only TapTab surface.
 *
 * Covers:
 * - projection-backed read-only render
 * - fallback render when projection unavailable
 * - metadata and diagnostics still visible
 * - edit navigation control still present
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { RecordViewer } from './RecordViewer'
import * as client from '../shared/api/client'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getRecordWithUI: vi.fn(),
    getRecord: vi.fn(),
    getUiSpec: vi.fn(),
    getRecordEditorProjection: vi.fn(),
  },
}))

vi.mock('./DiagnosticsPanel', () => ({
  DiagnosticsPanel: () => <div data-testid="diagnostics-panel" />,
}))

vi.mock('./taptab/TapTabEditor', () => ({
  ProjectionTapTabEditor: ({ blocks, slots, data, disabled }: any) => (
    <div data-testid="projection-taptab-editor" data-disabled={String(disabled)}>
      <span data-testid="projection-blocks-count">{blocks.length}</span>
      <span data-testid="projection-slots-count">{slots.length}</span>
      <span data-testid="projection-data">{JSON.stringify(data)}</span>
    </div>
  ),
}))

const mockClient = client.apiClient as ReturnType<typeof vi.mocked>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderViewer(initialRoute: string) {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route path="/records/:recordId" element={<RecordViewer />} />
      </Routes>
    </MemoryRouter>
  )
}

const baseRecord = {
  recordId: 'rec-1',
  schemaId: 'test-schema',
  payload: { name: 'Test Record', value: 42 },
  meta: { kind: 'test', path: '/test/path', commitSha: 'abcdef1234567890' },
}

const baseProjection = {
  schemaId: 'test-schema',
  recordId: 'rec-1',
  title: 'Test Record',
  blocks: [
    { id: 'b1', kind: 'section', label: 'Section 1', slotIds: ['sl1', 'sl2'] },
  ],
  slots: [
    { id: 'sl1', path: 'name', label: 'Name', widget: 'text' },
    { id: 'sl2', path: 'value', label: 'Value', widget: 'number' },
  ],
  diagnostics: [],
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RecordViewer — projection-backed read-only TapTab surface', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockClient.getRecordWithUI.mockResolvedValue({
      record: baseRecord,
      uiSpec: {
        uiVersion: 1,
        schemaId: 'test-schema',
        form: {
          sections: [{ id: 's1', title: 'Section 1', fields: [] }],
        },
      },
      schema: { type: 'object' },
    } as any)
    mockClient.getRecordEditorProjection.mockResolvedValue(baseProjection as any)
  })

  afterEach(() => {
    cleanup()
  })

  it('renders projection-backed read-only TapTab surface when projection is available', async () => {
    renderViewer('/records/rec-1')

    // Wait for projection-backed editor to render
    await waitFor(() => {
      expect(screen.getByTestId('projection-taptab-editor')).toBeTruthy()
    })

    // Verify the editor is in read-only mode (disabled)
    const editor = screen.getByTestId('projection-taptab-editor')
    expect(editor).toHaveAttribute('data-disabled', 'true')

    // Verify blocks and slots are passed through
    expect(screen.getByTestId('projection-blocks-count')).toHaveTextContent('1')
    expect(screen.getByTestId('projection-slots-count')).toHaveTextContent('2')

    // Verify payload data is passed through
    const dataEl = screen.getByTestId('projection-data')
    expect(JSON.parse(dataEl.textContent!)).toEqual(baseRecord.payload)
  })

  it('falls back to structured payload when projection is unavailable', async () => {
    mockClient.getRecordEditorProjection.mockRejectedValueOnce(
      new Error('Projection service unavailable')
    )

    renderViewer('/records/rec-1')

    // Should show the structured payload fallback
    await waitFor(() => {
      const pre = document.querySelector('pre.data-display code')
      expect(pre).toBeTruthy()
      expect(pre!.textContent).toContain('Test Record')
    })

    // Should show the projection-unavailable hint
    await waitFor(() => {
      expect(screen.getByText(/Projection unavailable/)).toBeTruthy()
    })
  })

  it('metadata panel is visible with correct values', async () => {
    renderViewer('/records/rec-1')

    // Wait for component to render
    await waitFor(() => {
      expect(screen.getByText('Record Detail')).toBeTruthy()
    })

    // Verify metadata values using test IDs and specific text queries
    const metadataSection = document.querySelector('.metadata-list')
    expect(metadataSection).toBeTruthy()

    // Check specific metadata items via dd/code elements
    const codeElements = document.querySelectorAll('.metadata-list dd code')
    expect(codeElements[0].textContent).toBe('rec-1')
    expect(codeElements[1].textContent).toBe('test')
    expect(codeElements[2].textContent).toBe('test-schema')
    expect(codeElements[3].textContent).toBe('/test/path')
    expect(codeElements[4].textContent).toBe('abcdef12')
  })

  it('diagnostics panel is visible', async () => {
    renderViewer('/records/rec-1')

    // Wait for component to render
    await waitFor(() => {
      expect(screen.getByTestId('diagnostics-panel')).toBeTruthy()
    })
  })

  it('edit navigation control is present and links to the correct route', async () => {
    renderViewer('/records/rec-1')

    // Wait for component to render
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Edit' })).toBeTruthy()
    })

    const editLink = screen.getByRole('link', { name: 'Edit' })
    expect(editLink).toHaveAttribute(
      'href',
      '/records/rec-1/edit'
    )
  })

  it('breadcrumb navigation is present', async () => {
    renderViewer('/records/rec-1')

    // Wait for component to render
    await waitFor(() => {
      expect(screen.getByText('Schemas')).toBeTruthy()
    })

    // Verify breadcrumb links
    const schemaLink = screen.getByRole('link', { name: 'test-schema' })
    expect(schemaLink).toHaveAttribute(
      'href',
      '/schemas/test-schema/records'
    )
  })

  it('shows loading state while data is being fetched', () => {
    // Clear mocks so the component stays in loading state
    vi.clearAllMocks()
    mockClient.getRecordWithUI.mockReturnValue(new Promise(() => {}))

    renderViewer('/records/rec-1')

    // Should show loading state
    expect(screen.getByText('Loading record...')).toBeTruthy()
  })

  it('shows error state when record fetch fails', async () => {
    // Both endpoints should fail
    mockClient.getRecordWithUI.mockRejectedValueOnce(
      new Error('Server error')
    )
    mockClient.getRecord.mockRejectedValueOnce(
      new Error('Server error')
    )

    renderViewer('/records/rec-1')

    // Wait for error state
    await waitFor(() => {
      expect(screen.getByText('Error loading record')).toBeTruthy()
    })

    expect(screen.getByText('Server error')).toBeTruthy()

    // Retry button should be present
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })

  it('shows "Record not found" when data is null', async () => {
    // getRecordWithUI returns null record, and getRecord also returns null
    mockClient.getRecordWithUI.mockResolvedValueOnce({
      record: null,
      uiSpec: null,
      schema: null,
    } as any)
    mockClient.getRecord.mockResolvedValueOnce({
      recordId: 'rec-1',
      schemaId: 'test-schema',
      payload: {},
    } as any)

    renderViewer('/records/rec-1')

    // Wait for component to render
    await waitFor(() => {
      expect(screen.getByText('Record not found')).toBeTruthy()
    })
  })
})
