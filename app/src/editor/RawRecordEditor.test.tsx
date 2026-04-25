/**
 * Focused tests for RawRecordEditor — TapTab-first default behavior.
 *
 * Covers:
 * - edit mode renders document-first by default
 * - create mode loads a draft projection
 * - YAML mode still works
 * - projection failure falls back cleanly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { RawRecordEditor } from './RawRecordEditor'
import * as client from '../shared/api/client'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    getSchema: vi.fn(),
    getUiSpec: vi.fn(),
    getRecordEditorProjection: vi.fn(),
    getEditorDraftProjection: vi.fn(),
    updateRecord: vi.fn(),
    createRecord: vi.fn(),
  },
}))

vi.mock('./DiagnosticsPanel', () => ({
  DiagnosticsPanel: () => <div data-testid="diagnostics-panel" />,
}))

vi.mock('./forms/SchemaRecordForm', () => ({
  SchemaRecordForm: () => <div data-testid="schema-record-form" />,
}))

vi.mock('./taptab', () => ({
  TapTabEditor: () => <div data-testid="taptab-editor" />,
  serializeDocument: vi.fn((_doc: unknown, _orig: unknown) => ({})),
  isDirty: vi.fn(() => false),
}))

vi.mock('./taptab/TapTabEditor', () => ({
  ProjectionTapTabEditor: () => <div data-testid="projection-taptab-editor" />,
}))

const mockClient = client.apiClient as ReturnType<typeof vi.mocked>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderEditor(initialRoute: string) {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route path="/records/:recordId" element={<RawRecordEditor />} />
        <Route path="/records/new" element={<RawRecordEditor />} />
      </Routes>
    </MemoryRouter>
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RawRecordEditor — TapTab-first default', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockClient.getRecord.mockResolvedValue({
      recordId: 'rec-1',
      schemaId: 'test-schema',
      payload: { name: 'Test' },
    } as any)
    mockClient.getSchema.mockResolvedValue({
      schemaId: 'test-schema',
      schema: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
    } as any)
    mockClient.getUiSpec.mockResolvedValue({
      uiVersion: 1,
      schemaId: 'test-schema',
      form: {
        sections: [{ id: 's1', title: 'Section 1', fields: [] }],
      },
    } as any)
    mockClient.getRecordEditorProjection.mockResolvedValue({
      schemaId: 'test-schema',
      recordId: 'rec-1',
      title: 'Test Record',
      blocks: [{ id: 'b1', kind: 'section', label: 'Section 1' }],
      slots: [{ id: 'sl1', path: 'name', label: 'Name', widget: 'text' }],
      diagnostics: [],
    } as any)
    mockClient.getEditorDraftProjection.mockResolvedValue({
      schemaId: 'test-schema',
      recordId: '__draft__',
      title: 'New Test Record',
      blocks: [{ id: 'b1', kind: 'section', label: 'Section 1' }],
      slots: [{ id: 'sl1', path: 'name', label: 'Name', widget: 'text' }],
      diagnostics: [],
    } as any)
  })

  afterEach(() => {
    cleanup()
  })

  it('edit mode renders document-first by default', async () => {
    renderEditor('/records/rec-1')

    // Should show the projection-backed TapTab editor (document mode)
    await waitFor(() => {
      expect(screen.getByTestId('projection-taptab-editor')).toBeTruthy()
    })

    // Should NOT show the legacy SchemaRecordForm
    expect(screen.queryByTestId('schema-record-form')).toBeNull()

    // Mode toggle should show "Document" as active
    const buttons = screen.getAllByRole('button', { name: /Document|YAML/i })
    expect(buttons[0]).toHaveClass('mode-btn--active')
  })

  it('create mode loads a draft projection', async () => {
    renderEditor('/records/new?schemaId=test-schema')

    // Should show the projection-backed TapTab editor with draft projection
    await waitFor(() => {
      expect(screen.getByTestId('projection-taptab-editor')).toBeTruthy()
    })

    // Should NOT show the legacy SchemaRecordForm
    expect(screen.queryByTestId('schema-record-form')).toBeNull()

    // getEditorDraftProjection should have been called
    expect(mockClient.getEditorDraftProjection).toHaveBeenCalledWith('test-schema')
  })

  it('YAML mode still works', async () => {
    renderEditor('/records/rec-1')

    // Wait for document mode to render first
    await waitFor(() => {
      expect(screen.getByTestId('projection-taptab-editor')).toBeTruthy()
    })

    // Click the YAML button
    const yamlButton = screen.getByRole('button', { name: 'YAML' })
    yamlButton.click()

    // Should show the CodeMirror editor container
    await waitFor(() => {
      const yamlContainer = document.querySelector('.codemirror-wrapper')
      expect(yamlContainer).toBeTruthy()
    })

    // Mode toggle should show "YAML" as active
    const buttons = screen.getAllByRole('button', { name: /Document|YAML/i })
    expect(buttons[1]).toHaveClass('mode-btn--active')
  })

  it('projection failure falls back cleanly', async () => {
    mockClient.getRecordEditorProjection.mockRejectedValueOnce(
      new Error('Projection service unavailable')
    )

    renderEditor('/records/rec-1')

    // Should show the projection error banner
    await waitFor(() => {
      expect(screen.getByText(/Projection unavailable/)).toBeTruthy()
    })

    // Should NOT show the projection editor
    expect(screen.queryByTestId('projection-taptab-editor')).toBeNull()

    // Should show a button to switch to YAML
    const switchButton = screen.getByRole('button', { name: 'Switch to YAML' })
    expect(switchButton).toBeTruthy()
  })

  it('create mode projection failure falls back cleanly', async () => {
    mockClient.getEditorDraftProjection.mockRejectedValueOnce(
      new Error('Draft projection unavailable')
    )

    renderEditor('/records/new?schemaId=test-schema')

    // Should show the projection error banner
    await waitFor(() => {
      expect(screen.getByText(/Projection unavailable/)).toBeTruthy()
    })

    // Should NOT show the projection editor
    expect(screen.queryByTestId('projection-taptab-editor')).toBeNull()
  })

  it('mode toggle labels are Document and YAML (not Form)', async () => {
    renderEditor('/records/rec-1')

    // Wait for component to render
    await waitFor(() => {
      const buttons = screen.getAllByRole('button')
      const buttonLabels = buttons.map((b) => b.textContent)

      // Should have "Document" and "YAML" buttons
      expect(buttonLabels).toContain('Document')
      expect(buttonLabels).toContain('YAML')

      // Should NOT have "Form" button
      expect(buttonLabels).not.toContain('Form')
    })
  })
})
