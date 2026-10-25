/**
 * REG-3 FIX1 D2 (RED-first) — Create while a record is open must open a
 * BLANK New Record form carrying the freshly seeded id, and a Save/abandon
 * in that state must never write the previously open record's content.
 *
 * Gate evidence (20261018T065824Z, shots/29-C3-carryover-new-record-prefilled.png):
 * /registry -> Training -> open TRR-DEMO-1 -> Create -> training-record ->
 * Confirm: header "New Record" but the ID field shows TRR-DEMO-1 (read-only)
 * and the fields carry TRR-DEMO-1's values. "A Save in that state would
 * WRITE TO THE OPEN RECORD."
 *
 * Mechanism (verified first-hand in node_modules/@tiptap/react/dist/index.cjs):
 * useEditor(options, deps = []) -> EditorInstanceManager.onRender: with
 * `deps.length === 0` the manager NEVER recreates the instance on a changed
 * `content` option — it only calls editor.setOptions(), and Editor.setOptions
 * merges options + view.updateState(this.state): the existing ProseMirror doc
 * (every fieldRow's attrs.value) is REUSED. RecordRegistryPage mounts
 * ProjectionTapTabEditor with no identity key, so the edit->create flip keeps
 * the open record's doc; serializeDocument(oldDoc, seedBase) then overlays the
 * OLD doc's values on the seed base — including the open record's id.
 *
 * The mock below models exactly that: the doc is built from `data` at MOUNT
 * and reused across re-renders (a `data` prop change alone does NOT rebuild
 * it). A remount (React `key` change) builds a fresh doc. That is the
 * mount-identity question this defect is about.
 *
 * Pins:
 *  (i)  create-while-open renders the NEW seeded id and an EMPTY form;
 *  (ii) a Save in the create state POSTs the NEW seeded id (never the open
 *       record's), and Cancel issues no write at all.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react'
import RecordRegistryPage from './RecordRegistryPage'

const SCHEMA_ID = (kind: string) =>
  `https://computable-lab.com/schema/computable-lab/${kind}.schema.yaml`

const TRR_SCHEMA = SCHEMA_ID('training-record')

const mocked = vi.hoisted(() => ({
  patterns: {} as Record<string, string | undefined>,
  editorOnUpdate: null as ((payload: Record<string, unknown>, dirty: boolean) => void) | null,
  projection: {
    schemaId: 'x',
    recordId: '__draft__',
    title: 'New Record',
    blocks: [{ id: 'b1', kind: 'section', label: 'Identity', slotIds: ['s1', 's2', 's3'] }],
    slots: [
      { id: 's1', path: '$.id', label: 'ID', widget: 'text', readOnly: true },
      { id: 's2', path: '$.personRef', label: 'Person', widget: 'text' },
      { id: 's3', path: '$.completedAt', label: 'Completed At', widget: 'text' },
    ],
    diagnostics: [],
  },
}))

vi.mock('../shared/api/client', () => ({
  apiClient: {
    listRecordsByKind: vi.fn((kind: string) =>
      Promise.resolve({
        records:
          kind === 'training-record'
            ? [
                {
                  recordId: 'TRR-DEMO-1',
                  schemaId: SCHEMA_ID('training-record'),
                  payload: {
                    kind: 'training-record',
                    id: 'TRR-DEMO-1',
                    personRef: { kind: 'record', type: 'person', id: 'PER-DEMO-AUTHOR' },
                    status: 'completed',
                    completedAt: '2026-10-03T15:10:13.995Z',
                  },
                },
              ]
            : [],
        total: 0,
      }),
    ),
    searchRecordsByKind: vi.fn().mockResolvedValue({ records: [] }),
    updateRecord: vi.fn().mockResolvedValue(undefined),
    createRecord: vi.fn().mockResolvedValue(undefined),
    getRecordEditorProjection: vi.fn().mockResolvedValue(mocked.projection),
    getEditorDraftProjection: vi.fn().mockResolvedValue(mocked.projection),
    getValidTransitions: vi.fn().mockResolvedValue({ transitions: [] }),
    getRecord: vi.fn(),
    createDraftCopy: vi.fn(),
    createSignature: vi.fn(),
    listRecordRevisions: vi.fn().mockResolvedValue({ records: [] }),
    getSchemas: vi.fn(() =>
      Promise.resolve([
        { id: SCHEMA_ID('training-material'), path: 'lab/training-material.schema.yaml', title: 'training-material' },
        { id: TRR_SCHEMA, path: 'lab/training-record.schema.yaml', title: 'training-record' },
      ]),
    ),
    getSchema: vi.fn((schemaId: string) =>
      Promise.resolve({
        id: schemaId,
        path: 'lab/schema.yaml',
        title: schemaId,
        schema: {
          $id: schemaId,
          type: 'object',
          properties: {
            ...(mocked.patterns[schemaId]
              ? { id: { type: 'string', pattern: mocked.patterns[schemaId] } }
              : {}),
          },
        },
      }),
    ),
  },
}))

vi.mock('../components/registry/RecordSearchCombobox', () => ({
  RecordSearchCombobox: () => <div data-testid="record-search-combobox" />,
}))

vi.mock('../components/registry/RelatedRecordsCard', () => ({
  RelatedRecordsCard: () => null,
}))

vi.mock('../editor/taptab/TapTabEditor', () => ({
  /**
   * Stand-in for ProjectionTapTabEditor that models @tiptap/react's mount
   * semantics (verified in dist/index.cjs): the doc is built from `data` at
   * MOUNT; a later `data` change reaches only editor.setOptions() and the
   * doc is REUSED. Only a remount (new React key) builds a fresh doc.
   * Field values render from the DOC (as the real FieldRow NodeViews do),
   * not from the current `data` prop.
   */
  ProjectionTapTabEditor: React.forwardRef(
    (
      props: {
        data: Record<string, unknown>
        onUpdate?: (payload: Record<string, unknown>, dirty: boolean) => void
      },
      ref: React.Ref<{ getEditor: () => { getJSON: () => unknown } | null }>,
    ) => {
      const docRef = React.useRef<Record<string, unknown> | null>(null)
      if (docRef.current === null) docRef.current = { ...props.data }
      const doc = docRef.current

      mocked.editorOnUpdate = props.onUpdate ?? null

      React.useImperativeHandle(ref, () => ({
        getEditor: () => ({
          getJSON: () => ({
            type: 'doc',
            content: mocked.projection.slots.map((slot) => ({
              type: 'fieldRow',
              attrs: {
                path: slot.path,
                widget: slot.widget,
                value: doc[slot.path.replace(/^\$\./, '')] ?? null,
                ...(slot.readOnly ? { readOnly: true } : {}),
              },
            })),
          }),
        }),
      }))

      return (
        <div data-testid="projection-taptab-editor">
          {Object.entries(doc).map(([key, value]) => (
            <div key={key} data-testid={`editor-field-${key}`}>
              {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')}
            </div>
          ))}
        </div>
      )
    },
  ),
}))

async function clickCreate() {
  await act(async () => {
    fireEvent.click(screen.getByTestId('registry-create-button'))
  })
}

async function openTab(label: string) {
  fireEvent.click(screen.getByText(label))
  await waitFor(() => {
    const button = screen.getByTestId('registry-create-button') as HTMLButtonElement
    expect(button.disabled).toBe(false)
  })
}

async function openTrainingCreate() {
  await clickCreate()
  await screen.findByTestId('registry-create-kind-picker')
  fireEvent.click(screen.getByRole('button', { name: 'training-record' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
  await screen.findByTestId('projection-taptab-editor')
}

describe('RecordRegistryPage — Create while a record is open (D2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.patterns = { [TRR_SCHEMA]: '^TRR-[A-Z0-9][A-Z0-9_-]*$' }
    mocked.editorOnUpdate = null
  })

  afterEach(() => {
    cleanup()
  })

  it('Create after opening a record renders a blank form with the NEW seeded id, not the open record values', async () => {
    render(<RecordRegistryPage />)
    await openTab('Training')

    // Open the existing training record first (the gate's precondition).
    fireEvent.click(await screen.findByText('TRR-DEMO-1'))
    await waitFor(() => expect(screen.getByTestId('editor-field-id').textContent).toBe('TRR-DEMO-1'))

    // Create -> multi-kind picker -> training-record -> Confirm.
    await openTrainingCreate()

    // (i) The create form is a FRESH subject: the ID field carries the NEW
    // seeded id, and the open record's values are NOT carried over.
    // RED at base: the editor instance (and its doc) is reused, so the
    // form renders TRR-DEMO-1 + its personRef/completedAt.
    const idText = screen.getByTestId('editor-field-id').textContent
    expect(idText).toMatch(/^TRR-NEW-/)
    expect(idText).not.toBe('TRR-DEMO-1')
    expect(screen.queryByTestId('editor-field-personRef')).toBeNull()
    expect(screen.queryByTestId('editor-field-completedAt')).toBeNull()
    expect(screen.queryByTestId('editor-field-status')).toBeNull()
  })

  it('a Save in the create state posts the NEW seeded id, never the previously open record', async () => {
    render(<RecordRegistryPage />)
    await openTab('Training')

    fireEvent.click(await screen.findByText('TRR-DEMO-1'))
    await waitFor(() => expect(screen.getByTestId('editor-field-id').textContent).toBe('TRR-DEMO-1'))

    await openTrainingCreate()

    // Simulate the user filling the form (the gate's C3 leg): the harness
    // fires onUpdate so dirty=true and Save is enabled.
    await act(async () => {
      mocked.editorOnUpdate!({ status: 'completed' }, true)
    })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    const { apiClient } = await import('../shared/api/client')
    await waitFor(() => expect(apiClient.createRecord).toHaveBeenCalled())
    const [schemaId, payload] = (apiClient.createRecord as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0]
    expect(schemaId).toBe(TRR_SCHEMA)
    // (ii) RED at base: serializeDocument re-applies the reused doc's values,
    // so the POST body carries the OPEN record's id (TRR-DEMO-1) and its
    // personRef/completedAt — a write to the already-open record.
    expect((payload as Record<string, unknown>).id).toMatch(/^TRR-NEW-/)
    expect((payload as Record<string, unknown>).id).not.toBe('TRR-DEMO-1')
    expect((payload as Record<string, unknown>).personRef).toBeUndefined()
    expect((payload as Record<string, unknown>).completedAt).toBeUndefined()
    expect(apiClient.updateRecord).not.toHaveBeenCalled()
  })

  it('abandoning the create (Cancel) issues no write against the previously open record', async () => {
    render(<RecordRegistryPage />)
    await openTab('Training')

    fireEvent.click(await screen.findByText('TRR-DEMO-1'))
    await waitFor(() => expect(screen.getByTestId('editor-field-id').textContent).toBe('TRR-DEMO-1'))

    await openTrainingCreate()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    await waitFor(() => expect(screen.queryByTestId('projection-taptab-editor')).toBeNull())
    const { apiClient } = await import('../shared/api/client')
    expect(apiClient.updateRecord).not.toHaveBeenCalled()
    expect(apiClient.createRecord).not.toHaveBeenCalled()
  })
})
