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

  it('clicking draft button calls createDraftCopy and dispatches cl:records-changed', async () => {
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

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    render(<RecordEditPanel recordId="DOC-TEST" title="Test Document" />)

    const draftBtn = await screen.findByTestId('record-edit-create-draft-revision')
    expect(draftBtn.textContent).toBe('Create draft revision')

    fireEvent.click(draftBtn)

    await waitFor(() => expect(apiClient.createDraftCopy).toHaveBeenCalledWith('DOC-TEST', {}))

    // Should show confirmation hint
    await waitFor(() => expect(screen.getByText(/Draft revision created/i)).toBeTruthy())

    // D4: must dispatch cl:records-changed
    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(CustomEvent))
    const calls = dispatchSpy.mock.calls.filter((args) => (args[0] as CustomEvent).type === 'cl:records-changed')
    expect(calls.length).toBe(1)

    dispatchSpy.mockRestore()
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

  it('DEFECT 2: terminal fetch rejects but content-locked resolves -> locked UI still locks (no fail-open)', async () => {
    const payload = {
      kind: 'controlled-document',
      id: 'DOC-DEF2',
      state: 'approved',
      lifecycleId: 'doc-lifecycle',
      title: 'Test',
    }
    ;(apiClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({
      recordId: 'DOC-DEF2',
      schemaId: 'controlled-document',
      payload,
    })
    // Content-locked resolves successfully
    ;(apiClient.getLifecycleContentLockedStates as ReturnType<typeof vi.fn>).mockResolvedValue(['approved'])
    // Terminal states fetch REJECTS
    ;(apiClient.getLifecycleTerminalStates as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('terminal fetch failed'))

    render(<RecordEditPanel recordId="DOC-DEF2" title="Test Document" />)

    // The record is content-locked (state 'approved' is in locked set)
    // even though terminal states failed.  Save button must NOT appear.
    await waitFor(() => expect(screen.queryByTestId('record-edit-create-draft-revision')).toBeTruthy())
    expect(screen.queryByTestId('record-edit-save')).toBeNull()
  })

  it('DEFECT 4: content-locked fetch rejects -> Save is not usable (fail-closed)', async () => {
    const payload = {
      kind: 'controlled-document',
      id: 'DOC-DEF4',
      state: 'approved',
      lifecycleId: 'doc-lifecycle',
      title: 'Test',
    }
    ;(apiClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({
      recordId: 'DOC-DEF4',
      schemaId: 'controlled-document',
      payload,
    })
    // Content-locked fetch REJECTS — the cache never marks this lifecycleId resolved
    ;(apiClient.getLifecycleContentLockedStates as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('content-locked fetch failed'))
    // Terminal states resolve normally (empty — not a terminal state)
    ;(apiClient.getLifecycleTerminalStates as ReturnType<typeof vi.fn>).mockResolvedValue([])

    render(<RecordEditPanel recordId="DOC-DEF4" title="Test Document" />)

    // Wait for loading to finish so lockPending can settle
    await waitFor(() => expect(screen.queryByText(/Loading record/)).toBeNull())
    // Both fetches settle (content-locked catches to [], terminal resolves to []).
    // At this point lockPending is false. contentLockedStates=[], terminalStates=[],
    // so contentLocked=false -> Save button renders.
    // fail-closed: after settlement, Save must NOT be enabled.
    // Currently (the defect): Save is present and ENABLED.
    const saveBtn = await screen.findByTestId('record-edit-save')
    expect(saveBtn).toBeDisabled()
  })

  it('DEFECT 5: Save button disabled while lock facts are still loading (transient fail-open guard)', async () => {
    const payload = {
      kind: 'controlled-document',
      id: 'DOC-DEF5',
      state: 'draft',
      lifecycleId: 'doc-lifecycle',
      title: 'Test',
    }
    ;(apiClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({
      recordId: 'DOC-DEF5',
      schemaId: 'controlled-document',
      payload,
    })
    // Hang BOTH halves — neither resolves, so lockPending stays true
    ;(apiClient.getLifecycleContentLockedStates as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}))
    ;(apiClient.getLifecycleTerminalStates as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}))

    render(<RecordEditPanel recordId="DOC-DEF5" title="Test Document" />)

    // Wait for record load to finish (loading=false) so the Save button is rendered
    // with useProjection=true. At this point lockPending is still true because
    // both lock fetches are hung — the Save button must be disabled by lockPending.
    // Deleting the `|| lockPending` wire would make this RED because Save would
    // be present + enabled in this window.
    await waitFor(() => expect(screen.queryByText(/Loading record/)).toBeNull())
    const saveBtn = screen.getByTestId('record-edit-save')
    expect(saveBtn).toBeDisabled()
  })

  it('DEFECT 5 settle: Save button enabled after lock facts resolve (unlocked)', async () => {
    const payload = {
      kind: 'controlled-document',
      id: 'DOC-SETTLE',
      state: 'draft',
      lifecycleId: 'doc-lifecycle',
      title: 'Test',
    }
    ;(apiClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({
      recordId: 'DOC-SETTLE',
      schemaId: 'controlled-document',
      payload,
    })
    // Both halves resolve to empty arrays (unlocked)
    ;(apiClient.getLifecycleContentLockedStates as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(apiClient.getLifecycleTerminalStates as ReturnType<typeof vi.fn>).mockResolvedValue([])

    render(<RecordEditPanel recordId="DOC-SETTLE" title="Test Document" />)

    // After lock facts settle, lockPending becomes false and Save is enabled
    await waitFor(() => {
      const saveBtn = screen.getByTestId('record-edit-save')
      expect(saveBtn).not.toBeDisabled()
    })
  })
})
