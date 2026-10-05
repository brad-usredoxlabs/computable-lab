/**
 * QMS-6E — editor save write-back on the /registry surface (RED-first).
 *
 * D3a: handleSave PUTs the raw TipTap doc (editor.getJSON()) as the record
 * payload, so identity + lifecycleId are lost and the server refuses with
 * 409 LIFECYCLE_IMMUTABLE (receipt api/a-save-payload-replays.txt (a)).
 * The save must serializeDocument(editor.getJSON(), selectedRecord.payload)
 * exactly like the /record sibling, so kind/id/lifecycleId survive.
 *
 * D5: the tab-switch effect fires refreshRecords without a stale-response
 * guard — a slow in-flight fetch for the previous tab can render its rows
 * under the newly selected tab.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import RecordRegistryPage from './RecordRegistryPage'

const mocked = vi.hoisted(() => ({
  mockListRecordsByKind: vi.fn(),
  mockUpdateRecord: vi.fn().mockResolvedValue(undefined),
  mockCreateRecord: vi.fn().mockResolvedValue(undefined),
  mockGetRecordEditorProjection: vi.fn().mockResolvedValue({
    schemaId: 'controlled-document',
    recordId: 'DOC-DEMO-SOP',
    title: 'Demo SOP',
    blocks: [{ id: 'b1', kind: 'section', label: 'Identity', slotIds: ['s1'] }],
    slots: [{ id: 's1', path: '$.title', label: 'Title', widget: 'text' }],
    diagnostics: [],
  }),
  mockGetEditorDraftProjection: vi.fn().mockResolvedValue({
    schemaId: 'controlled-document',
    recordId: '',
    title: 'New Record',
    blocks: [],
    slots: [],
    diagnostics: [],
  }),
  mockOnSelect: null as ((r: { recordId: string; schemaId: string; payload: Record<string, unknown>; isNew: boolean }) => void) | null,
  mockGetEditorJson: null as (() => unknown) | null,
}))

// The live editor's serialized doc: fieldRows holding the edited title.
// (TipTap docs never carry record identity — that is precisely the defect.)
const EDITOR_DOC = {
  type: 'doc',
  content: [
    {
      type: 'section',
      attrs: { title: 'Identity' },
      content: [
        { type: 'sectionHeading', content: [{ type: 'text', text: 'Identity' }] },
        {
          type: 'fieldRow',
          attrs: { path: '$.title', widget: 'text', label: 'Title', value: 'Edited Title QMS6E' },
        },
      ],
    },
  ],
}

vi.mock('../shared/api/client', () => ({
  apiClient: {
    listRecordsByKind: mocked.mockListRecordsByKind,
    searchRecordsByKind: vi.fn().mockResolvedValue({ records: [] }),
    updateRecord: mocked.mockUpdateRecord,
    createRecord: mocked.mockCreateRecord,
    getRecordEditorProjection: mocked.mockGetRecordEditorProjection,
    getEditorDraftProjection: mocked.mockGetEditorDraftProjection,
    getValidTransitions: vi.fn().mockResolvedValue({ transitions: [] }),
    getRecord: vi.fn(),
    createDraftCopy: vi.fn(),
    createSignature: vi.fn(),
    listRecordRevisions: vi.fn().mockResolvedValue({ records: [] }),
  },
}))

vi.mock('../components/registry/RecordSearchCombobox', () => ({
  RecordSearchCombobox: ({ onSelect }: { onSelect: typeof mocked.mockOnSelect }) => {
    mocked.mockOnSelect = onSelect
    return <div data-testid="record-search-combobox" />
  },
}))

vi.mock('../components/registry/CsvImportModal', () => ({
  CsvImportModal: () => null,
}))

vi.mock('../components/registry/RelatedRecordsCard', () => ({
  RelatedRecordsCard: () => null,
}))

vi.mock('../editor/taptab/TapTabEditor', async () => {
  const ReactActual = await vi.importActual<typeof import('react')>('react')
  return {
    ProjectionTapTabEditor: ReactActual.forwardRef(
      (
        props: {
          data: Record<string, unknown>
          onUpdate?: (payload: Record<string, unknown>, dirty: boolean) => void
        },
        ref: unknown,
      ) => {
        // Expose an editor handle so handleSave's taptabRef path is exercised.
        if (ref && typeof ref === 'object') {
          (ref as { current: unknown }).current = {
            getEditor: () => ({ getJSON: () => EDITOR_DOC }),
          }
        }
        // Mark the record dirty so Save is enabled — after mount, not during
        // render (calling onUpdate in render triggers a React setState warning).
        ReactActual.useEffect(() => {
          if (props.onUpdate) props.onUpdate(props.data, true)
        }, [])
        return ReactActual.createElement('div', { 'data-testid': 'projection-taptab-editor' })
      },
    ),
  }
})

const docRecord = {
  recordId: 'DOC-DEMO-SOP',
  schemaId: 'controlled-document',
  payload: {
    kind: 'controlled-document',
    id: 'DOC-DEMO-SOP',
    title: 'Demo SOP',
    lifecycleId: 'document-controlled-signing',
    state: 'in_review',
    docType: 'sop',
  },
}

const personRecord = {
  recordId: 'PER-1',
  schemaId: 'person',
  payload: { kind: 'person', id: 'PER-1', name: 'A Person' },
}

/** Deferred list response per kind, so we can control resolution order. */
function deferredLists() {
  const deferred = new Map<string, { promise: Promise<{ records: unknown[] }>; resolve: (v: { records: unknown[] }) => void }>()
  mocked.mockListRecordsByKind.mockImplementation((kind: string) => {
    if (!deferred.has(kind)) {
      let resolve!: (v: { records: unknown[] }) => void
      const promise = new Promise<{ records: unknown[] }>((r) => { resolve = r })
      deferred.set(kind, { promise, resolve })
    }
    return deferred.get(kind)!.promise
  })
  return deferred
}

async function openDocument() {
  fireEvent.click(await screen.findByRole('button', { name: 'Documents' }))
  fireEvent.click(await screen.findByText('Demo SOP'))
  await screen.findByTestId('projection-taptab-editor')
}

describe('RecordRegistryPage save — D3a serialize against the record payload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.mockOnSelect = null
    mocked.mockUpdateRecord.mockResolvedValue(undefined)
    mocked.mockGetRecordEditorProjection.mockResolvedValue({
      schemaId: 'controlled-document',
      recordId: 'DOC-DEMO-SOP',
      title: 'Demo SOP',
      blocks: [{ id: 'b1', kind: 'section', label: 'Identity', slotIds: ['s1'] }],
      slots: [{ id: 's1', path: '$.title', label: 'Title', widget: 'text' }],
      diagnostics: [],
    })
    mocked.mockListRecordsByKind.mockImplementation(async (kind: string) => {
      if (kind === 'controlled-document') return { records: [docRecord], total: 1 }
      if (kind === 'person') return { records: [personRecord], total: 1 }
      return { records: [], total: 0 }
    })
  })

  afterEach(() => cleanup())

  it('PUT serializes the TipTap doc INTO the selected record payload — identity + lifecycleId survive', async () => {
    render(<RecordRegistryPage />)
    await openDocument()

    fireEvent.click(await screen.findByRole('button', { name: /^Save/i }))

    await waitFor(() => expect(mocked.mockUpdateRecord).toHaveBeenCalled())
    const [recordId, payload] = mocked.mockUpdateRecord.mock.calls[0]
    expect(recordId).toBe('DOC-DEMO-SOP')

    // The payload must be a RECORD, not a TipTap doc.
    expect(payload).not.toHaveProperty('type', 'doc')
    expect(payload).not.toHaveProperty('content')

    // Identity + lifecycle fields survive the serialization.
    expect(payload.kind).toBe('controlled-document')
    expect(payload.id).toBe('DOC-DEMO-SOP')
    expect(payload.lifecycleId).toBe('document-controlled-signing')
    expect(payload.state).toBe('in_review')

    // The edited field from the editor lands in the payload.
    expect(payload.title).toBe('Edited Title QMS6E')
  })
})

describe('RecordRegistryPage tab switch — D5 stale-response guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.mockOnSelect = null
  })

  afterEach(() => cleanup())

  it('a slow in-flight list for the PREVIOUS tab must not render its rows under the new tab', async () => {
    const deferred = deferredLists()
    render(<RecordRegistryPage />)

    // People (initial tab) fetch is pending.
    await waitFor(() => expect(mocked.mockListRecordsByKind).toHaveBeenCalledWith('person', 100))

    // Switch to Documents while People is still in flight.
    fireEvent.click(screen.getByRole('button', { name: 'Documents' }))
    await waitFor(() => expect(mocked.mockListRecordsByKind).toHaveBeenCalledWith('controlled-document', 100))

    // Documents resolves FIRST.
    deferred.get('controlled-document')!.resolve({ records: [docRecord] })
    expect(await screen.findByText('Demo SOP')).toBeInTheDocument()

    // Now the STALE People response lands late.
    deferred.get('person')!.resolve({ records: [personRecord] })

    // The Documents tab must still show its own rows — the stale People rows
    // must not replace them.
    await new Promise((r) => setTimeout(r, 25))
    expect(screen.queryByText('A Person')).toBeNull()
    expect(screen.getByText('Demo SOP')).toBeInTheDocument()
  })
})
