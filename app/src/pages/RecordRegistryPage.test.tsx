/**
 * QMS-6 — RecordRegistryPage registry-coverage tests.
 *
 * - a `controlled-document` record appears under the new Documents tab;
 * - the DocumentControlBar mounts for a lifecycle-bearing controlled-document
 *   and NOT for a plain training-record.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import RecordRegistryPage from './RecordRegistryPage'

const docRecord = {
  recordId: 'DOC-DEMO-SOP',
  schemaId: 'controlled-document',
  payload: {
    kind: 'controlled-document',
    recordId: 'DOC-DEMO-SOP',
    title: 'Demo SOP',
    lifecycleId: 'document-controlled-signing',
    state: 'draft',
  },
}

const trainingRecord = {
  recordId: 'TRR-DEMO-1',
  schemaId: 'training-record',
  payload: {
    kind: 'training-record',
    recordId: 'TRR-DEMO-1',
    name: 'Pipette Training',
    state: 'completed',
  },
}

const mocked = vi.hoisted(() => ({
  listRecordsByKind: vi.fn(),
  getRecordEditorProjection: vi.fn(),
  getValidTransitions: vi.fn(),
}))

vi.mock('../shared/api/client', () => ({
  apiClient: {
    listRecordsByKind: mocked.listRecordsByKind,
    getRecordEditorProjection: mocked.getRecordEditorProjection,
    getValidTransitions: mocked.getValidTransitions,
    updateRecord: vi.fn().mockResolvedValue(undefined),
    createSignature: vi.fn(),
    createRecord: vi.fn(),
  },
}))

vi.mock('../components/registry/RecordSearchCombobox', () => ({
  RecordSearchCombobox: () => <div data-testid="search-combobox" />,
}))

vi.mock('../components/registry/CsvImportModal', () => ({
  CsvImportModal: () => null,
}))

vi.mock('../components/registry/RelatedRecordsCard', () => ({
  RelatedRecordsCard: () => <div data-testid="related-records-card" />,
}))

vi.mock('../editor/taptab/TapTabEditor', () => ({
  ProjectionTapTabEditor: ({ data }: { data: Record<string, unknown> }) => (
    <div data-testid="projection-taptab-editor">Editing: {String(data.recordId)}</div>
  ),
}))

vi.mock('../editor/taptab/DocumentShell', () => ({
  DocumentShell: ({ children }: { children?: React.ReactNode }) => <div data-testid="document-shell">{children}</div>,
  DocumentShellHeader: ({ title }: { title: string }) => <div data-testid="document-shell-header">{title}</div>,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocked.listRecordsByKind.mockImplementation(async (kind: string) => {
    if (kind === 'controlled-document') return { records: [docRecord], total: 1 }
    if (kind === 'training-record') return { records: [trainingRecord], total: 1 }
    return { records: [], total: 0 }
  })
  mocked.getRecordEditorProjection.mockResolvedValue({
    schemaId: 'controlled-document',
    recordId: 'DOC-DEMO-SOP',
    title: 'Demo SOP',
    blocks: [{ id: 'b1', kind: 'section', label: 'Section 1', slotIds: ['s1'] }],
    slots: [{ id: 's1', path: 'title', label: 'Title', widget: 'text' }],
    diagnostics: [],
  })
  mocked.getValidTransitions.mockResolvedValue({ transitions: [] })
})

afterEach(() => {
  cleanup()
})

describe('RecordRegistryPage — Documents tab (QMS-6)', () => {
  it('lists controlled-document records under the Documents tab', async () => {
    render(<RecordRegistryPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Documents' }))

    await waitFor(() =>
      expect(mocked.listRecordsByKind).toHaveBeenCalledWith('controlled-document', 100)
    )
    // The list shows the payload title as display name.
    expect(await screen.findByText('Demo SOP')).toBeInTheDocument()
  })

  it('mounts the DocumentControlBar for a lifecycle-bearing controlled-document', async () => {
    render(<RecordRegistryPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Documents' }))
    fireEvent.click(await screen.findByText('Demo SOP'))

    await screen.findByTestId('projection-taptab-editor')
    expect(await screen.findByTestId('document-control-bar')).toBeInTheDocument()
  })

  it('does NOT mount the DocumentControlBar for a plain training-record', async () => {
    render(<RecordRegistryPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Training' }))
    fireEvent.click(await screen.findByText('Pipette Training'))

    await screen.findByTestId('projection-taptab-editor')
    expect(screen.queryByTestId('document-control-bar')).toBeNull()
  })
})
