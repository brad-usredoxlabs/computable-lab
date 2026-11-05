/**
 * L1-RECORD-LOCK-GUARD-1 unit 2b-iii — locked rendering tests for RecordEditPanel.
 *
 * When the opened record's state is in its lifecycle's DECLARED content-locked
 * set, the panel must: hide the Save button, show a "Create draft revision"
 * button, and disable the projection editor. When unlocked, the Save button
 * remains and the editor is interactive.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { __resetContentLockedStatesCache } from '../../shared/records/contentLockedStatesCache'

// Mock the API client
vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    getRecordEditorProjection: vi.fn(),
    updateRecord: vi.fn(),
    createPlannedRun: vi.fn(),
    createDraftCopy: vi.fn(),
    getLifecycleContentLockedStates: vi.fn(),
    getLifecycleTerminalStates: vi.fn(),
  },
}))

// Mock taptab — mirror the qms6e test style
vi.mock('../../editor/taptab', async () => {
  const actual = await vi.importActual<typeof import('../../editor/taptab/recordSerializer')>(
    '../../editor/taptab/recordSerializer',
  )
  return {
    ProjectionTapTabEditor: React.forwardRef((_props: { disabled?: boolean }, ref: unknown) => {
      const holder = {
        doc: null as unknown,
        setDoc(d: unknown) { holder.doc = d },
        getEditor: () => ({ getJSON: () => holder.doc }),
      }
      ;(globalThis as { __qms6eTaptabHandle?: unknown }).__qms6eTaptabHandle = holder
      if (ref && typeof ref === 'object') (ref as { current: unknown }).current = holder
      // Record last props for disabled-pin assertions
      ;(globalThis as any).__qms6eTaptabProps = _props
      return null as never
    }),
    serializeDocument: actual.serializeDocument,
  }
})

import React from 'react'
import { apiClient } from '../../shared/api/client'
import { RecordEditPanel } from './RecordEditPanel'

const projection = {
  schemaId: 'controlled-document',
  recordId: 'DOC-TEST',
  title: 'Test Document',
  blocks: [{ id: 'b1', kind: 'section', label: 'Identity', slotIds: ['s1'] }],
  slots: [{ id: 's1', path: '$.title', label: 'Title', widget: 'text' }],
  diagnostics: [],
}

describe('RecordEditPanel — content-locked rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetContentLockedStatesCache()
    ;(apiClient.getRecordEditorProjection as ReturnType<typeof vi.fn>).mockResolvedValue(projection)
  })

  afterEach(() => cleanup())

  it('hides Save button and shows "Create draft revision" when state is in content-locked set', async () => {
    const payload = {
      kind: 'controlled-document',
      id: 'DOC-TEST',
      state: 'approved',
      lifecycleId: 'doc-lifecycle',
      title: 'Test',
    }
    ;(apiClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({
      recordId: 'DOC-TEST',
      schemaId: 'controlled-document',
      payload,
    })
    ;(apiClient.getLifecycleContentLockedStates as ReturnType<typeof vi.fn>).mockResolvedValue(['approved', 'effective'])
    ;(apiClient.getLifecycleTerminalStates as ReturnType<typeof vi.fn>).mockResolvedValue(['archived', 'retired'])

    render(<RecordEditPanel recordId="DOC-TEST" title="Test Document" />)

    await waitFor(() => expect(screen.queryByTestId('record-edit-create-draft-revision')).toBeTruthy())

    // Save button must NOT be present
    expect(screen.queryByTestId('record-edit-save')).toBeNull()

    // D5 pin: editor must be disabled when locked
    await waitFor(() => {
      const props = (globalThis as any).__qms6eTaptabProps
      expect(props).not.toBeUndefined()
      expect(props.disabled).toBe(true)
    })
  })

  it('shows Save button and no draft button when state is NOT in content-locked set', async () => {
    const payload = {
      kind: 'controlled-document',
      id: 'DOC-TEST',
      state: 'draft',
      lifecycleId: 'doc-lifecycle',
      title: 'Test',
    }
    ;(apiClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({
      recordId: 'DOC-TEST',
      schemaId: 'controlled-document',
      payload,
    })
    ;(apiClient.getLifecycleContentLockedStates as ReturnType<typeof vi.fn>).mockResolvedValue(['approved', 'effective'])
    ;(apiClient.getLifecycleTerminalStates as ReturnType<typeof vi.fn>).mockResolvedValue(['archived', 'retired'])

    render(<RecordEditPanel recordId="DOC-TEST" title="Test Document" />)

    await waitFor(() => expect(screen.queryByTestId('record-edit-save')).toBeTruthy())

    // Draft button must NOT be present
    expect(screen.queryByTestId('record-edit-create-draft-revision')).toBeNull()

    // D5 pin: editor must NOT be disabled when unlocked
    await waitFor(() => {
      const props = (globalThis as any).__qms6eTaptabProps
      expect(props).not.toBeUndefined()
      expect(props.disabled).toBe(false)
    })
  })

  it('clicking draft button calls createDraftCopy and shows confirmation', async () => {
    const payload = {
      kind: 'controlled-document',
      id: 'DOC-TEST',
      state: 'approved',
      lifecycleId: 'doc-lifecycle',
      title: 'Test',
    }
    ;(apiClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({
      recordId: 'DOC-TEST',
      schemaId: 'controlled-document',
      payload,
    })
    ;(apiClient.getLifecycleContentLockedStates as ReturnType<typeof vi.fn>).mockResolvedValue(['approved'])
    ;(apiClient.getLifecycleTerminalStates as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(apiClient.createDraftCopy as ReturnType<typeof vi.fn>).mockResolvedValue({
      record: { recordId: 'DOC-TEST-DRAFT', schemaId: 'controlled-document', payload: {} },
    })

    render(<RecordEditPanel recordId="DOC-TEST" title="Test Document" />)

    const draftBtn = await screen.findByTestId('record-edit-create-draft-revision')
    expect(draftBtn.textContent).toBe('Create draft revision')

    fireEvent.click(draftBtn)

    await waitFor(() => expect(apiClient.createDraftCopy).toHaveBeenCalledWith('DOC-TEST', {}))

    // Should show confirmation hint
    await waitFor(() => expect(screen.getByText(/Draft revision created/i)).toBeTruthy())
  })

  it('hides Save and shows draft-revision when state is terminal but NOT content-locked (D2)', async () => {
    const payload = {
      kind: 'lab-vocabulary-control',
      id: 'VOC-TEST',
      state: 'archived',
      lifecycleId: 'voc-lifecycle',
      title: 'Vocabulary',
    }
    ;(apiClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({
      recordId: 'VOC-TEST',
      schemaId: 'lab-vocabulary-control',
      payload,
    })
    // State is NOT in content-locked set
    ;(apiClient.getLifecycleContentLockedStates as ReturnType<typeof vi.fn>).mockResolvedValue([])
    // State IS in terminal set
    ;(apiClient.getLifecycleTerminalStates as ReturnType<typeof vi.fn>).mockResolvedValue(['archived'])

    render(<RecordEditPanel recordId="VOC-TEST" title="Vocabulary Test" />)

    // Save button must NOT be present (terminal state locks writes)
    await waitFor(() => expect(screen.queryByTestId('record-edit-save')).toBeNull())

    // Draft-revision button MUST be present
    await waitFor(() => expect(screen.queryByTestId('record-edit-create-draft-revision')).toBeTruthy())
  })
})
