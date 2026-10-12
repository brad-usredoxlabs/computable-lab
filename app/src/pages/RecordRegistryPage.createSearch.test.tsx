/**
 * EDITOR-9 FIX-1 (RED-first) — registry create-from-search must receive the
 * REAL schemaId for the tab's kind.
 *
 * Browser-gate defect (EDITOR-9-EMPTY-OPTIONAL-SAVE/20261011T0415-tier2):
 * RecordRegistryPage passes schemaId="" to RecordSearchCombobox, so
 * precompileRecord (RecordSearchCombobox.tsx:180) rejects with
 * "schemaId is required and must be a non-empty string" — the create-from-
 * search affordance is dead for EVERY registry kind (shot
 * c1-create/shots/09-create-person-error-visible.png).
 *
 * Contract: the page resolves the tab kind's schema $id from the schema
 * registry metadata (apiClient.getSchemas() + deriveSchemaNode — the same
 * declarative kind→schema wiring /browser already uses, SchemaTree.tsx) and
 * passes it to the combobox. No new hardcoded kind→schema literal in the page.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import RecordRegistryPage from './RecordRegistryPage'
import { apiClient } from '../shared/api/client'

const mocked = vi.hoisted(() => ({
  PERSON_SCHEMA_ID: 'https://computable-lab.com/schema/computable-lab/person.schema.yaml',
  EQUIPMENT_SCHEMA_ID: 'https://computable-lab.com/schema/computable-lab/equipment.schema.yaml',
  EQUIPMENT_CLASS_SCHEMA_ID: 'https://computable-lab.com/schema/computable-lab/equipment-class.schema.yaml',
  projection: {
    schemaId: 'x',
    recordId: '',
    title: 'New Record',
    blocks: [{ id: 'b1', kind: 'section', label: 'Identity', slotIds: ['s1'] }],
    slots: [{ id: 's1', path: '$.displayName', label: 'Display Name', widget: 'text' }],
    diagnostics: [],
  },
  draftProjectionCalls: [] as string[],
  mockComboboxSchemaId: null as string | null,
  mockComboboxKinds: null as string[] | null,
  mockOnSelect: null as ((r: { recordId: string; schemaId: string; payload: Record<string, unknown>; isNew: boolean }) => void) | null,
  // FIX-2: stand-in for the TipTap editor instance taptabRef exposes to
  // handleSave (RecordRegistryPage.tsx:179-194). getJSON returns a doc whose
  // fieldRows are exactly the two fields the projection marks required
  // (Display Name, Status) — optionals carry their unset value.
  editorDoc: null as unknown,
  editorDataProp: null as Record<string, unknown> | null,
  editorOnUpdate: null as ((payload: Record<string, unknown>, dirty: boolean) => void) | null,
  // The precompile payload the real combobox forwards on a web hit
  // (RecordSearchCombobox.tsx:187-193; the server's precompile prompt emits
  // kind/id/displayName/status — RecordSearchHandlers.ts:225-232).
  precompilePayload: {
    kind: 'person',
    id: 'PER-EDITOR9-FIX2',
    displayName: 'EDITOR9 FIX2 PERSON',
    status: 'active',
    organizationId: 'ORG-FIX2',
  } as Record<string, unknown>,
}))

const { PERSON_SCHEMA_ID, EQUIPMENT_SCHEMA_ID } = mocked

vi.mock('../shared/api/client', () => ({
  apiClient: {
    listRecordsByKind: vi.fn().mockResolvedValue({ records: [] }),
    searchRecordsByKind: vi.fn().mockResolvedValue({ records: [] }),
    updateRecord: vi.fn().mockResolvedValue(undefined),
    createRecord: vi.fn().mockResolvedValue(undefined),
    getRecordEditorProjection: vi.fn().mockResolvedValue(mocked.projection),
    getEditorDraftProjection: vi.fn((schemaId: string) => {
      mocked.draftProjectionCalls.push(schemaId)
      return Promise.resolve(mocked.projection)
    }),
    getValidTransitions: vi.fn().mockResolvedValue({ transitions: [] }),
    getRecord: vi.fn(),
    createDraftCopy: vi.fn(),
    createSignature: vi.fn(),
    listRecordRevisions: vi.fn().mockResolvedValue({ records: [] }),
    // The schema registry endpoint the page must use to resolve kind → $id.
    getSchemas: vi.fn(() =>
      Promise.resolve([
        { id: mocked.PERSON_SCHEMA_ID, path: 'lab/person.schema.yaml', title: 'Person' },
        { id: mocked.EQUIPMENT_SCHEMA_ID, path: 'lab/equipment.schema.yaml', title: 'Equipment' },
        { id: mocked.EQUIPMENT_CLASS_SCHEMA_ID, path: 'lab/equipment-class.schema.yaml', title: 'Equipment Class' },
        { id: 'https://computable-lab.com/schema/computable-lab/common.schema.yaml', path: 'lab/common.schema.yaml', title: 'Common' },
      ]),
    ),
  },
}))

vi.mock('../components/registry/RecordSearchCombobox', () => ({
  RecordSearchCombobox: ({
    kinds,
    schemaId,
    onSelect,
  }: {
    kinds: string[]
    schemaId: string
    placeholder?: string
    onSelect: (r: { recordId: string; schemaId: string; payload: Record<string, unknown>; isNew: boolean }) => void
    disabled?: boolean
  }) => {
    // Stand in for the real combobox: it forwards the page's schemaId to
    // precompileRecord and to onSelect (RecordSearchCombobox.tsx:180-190).
    mocked.mockComboboxSchemaId = schemaId
    mocked.mockComboboxKinds = kinds
    mocked.mockOnSelect = onSelect
    return (
      <div data-testid="record-search-combobox">
        <button
          data-testid="simulate-web-create"
          onClick={() =>
            onSelect({
              recordId: '',
              schemaId,
              // FIX-2: the real combobox forwards the precompile payload
              // verbatim on a web hit (RecordSearchCombobox.tsx:188-193).
              payload: { ...mocked.precompilePayload },
              isNew: true,
            })
          }
        >
          Simulate Web Create
        </button>
      </div>
    )
  },
}))

vi.mock('../components/registry/CsvImportModal', () => ({ CsvImportModal: () => null }))
vi.mock('../components/registry/RelatedRecordsCard', () => ({ RelatedRecordsCard: () => null }))
vi.mock('../editor/taptab/TapTabEditor', () => ({
  // FIX-2: stand-in for ProjectionTapTabEditor. Captures the `data` prop (the
  // create base payload the page feeds the editor) and exposes getEditor()
  // through the forwarded ref, exactly as the real component does
  // (TapTabEditor.tsx:218). getJSON returns the doc handleSave serializes.
  ProjectionTapTabEditor: React.forwardRef(
    (
      props: {
        data: Record<string, unknown>
        onUpdate?: (payload: Record<string, unknown>, dirty: boolean) => void
      },
      ref: React.Ref<{ getEditor: () => { getJSON: () => unknown } | null }>,
    ) => {
      mocked.editorDataProp = props.data
      mocked.editorOnUpdate = props.onUpdate ?? null
      React.useImperativeHandle(ref, () => ({
        getEditor: () => ({ getJSON: () => mocked.editorDoc }),
      }))
      return <div data-testid="projection-taptab-editor" />
    },
  ),
}))

describe('RecordRegistryPage — create-from-search schemaId wiring (EDITOR-9 fix-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.draftProjectionCalls = []
    mocked.mockComboboxSchemaId = null
    mocked.mockComboboxKinds = null
    mocked.mockOnSelect = null
    mocked.editorDataProp = null
    mocked.editorOnUpdate = null
    // The doc the editor holds after the user fills ONLY the two required
    // fields (Display Name, Status). Optionals carry their unset value — the
    // serializer must omit them (EDITOR-9 contract, exercised here too).
    mocked.editorDoc = {
      type: 'doc',
      content: [
        { type: 'fieldRow', attrs: { path: '$.displayName', widget: 'text', value: 'EDITOR9 FIX2 PERSON' } },
        { type: 'fieldRow', attrs: { path: '$.status', widget: 'select', value: 'active' } },
        { type: 'fieldRow', attrs: { path: '$.organizationId', widget: 'text', value: '' } },
        { type: 'fieldRow', attrs: { path: '$.contact.email', widget: 'text', value: '' } },
        { type: 'fieldRow', attrs: { path: '$.contact.phone', widget: 'text', value: '' } },
        { type: 'fieldRow', attrs: { path: '$.notes', widget: 'textarea', value: null } },
      ],
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('passes the person schema $id (not "") to the combobox on the People tab', async () => {
    render(<RecordRegistryPage />)
    await waitFor(() => {
      expect(mocked.mockComboboxSchemaId).not.toBeNull()
    })
    expect(mocked.mockComboboxKinds).toEqual(['person'])
    // RED at base: the page hardcodes schemaId="" (RecordRegistryPage.tsx:277).
    expect(mocked.mockComboboxSchemaId).toBe(PERSON_SCHEMA_ID)
  })

  it('passes the equipment schema $id on the Equipment tab (per-tab kind metadata)', async () => {
    render(<RecordRegistryPage />)
    await waitFor(() => {
      expect(mocked.mockComboboxSchemaId).not.toBeNull()
    })
    fireEvent.click(screen.getByText('Equipment'))
    await waitFor(() => {
      expect(mocked.mockComboboxSchemaId).toBe(EQUIPMENT_SCHEMA_ID)
    })
    expect(mocked.mockComboboxKinds).toEqual(['equipment', 'equipment-class'])
  })

  it('create-from-search reaches handleCreateRecord with the real schemaId (draft projection loads)', async () => {
    render(<RecordRegistryPage />)
    await waitFor(() => {
      expect(mocked.mockComboboxSchemaId).toBe(PERSON_SCHEMA_ID)
    })
    fireEvent.click(screen.getByTestId('simulate-web-create'))
    await waitFor(() => {
      expect(screen.getByTestId('projection-taptab-editor')).toBeTruthy()
    })
    // The draft projection must be requested with the person schema $id —
    // at base it is requested with "" and the server refuses (400/404).
    expect(mocked.draftProjectionCalls).toContain(PERSON_SCHEMA_ID)
    expect(mocked.draftProjectionCalls).not.toContain('')
  })
})

/**
 * EDITOR-9 FIX-2 (RED-first) — the create base must carry the precompile
 * payload the combobox already passes in.
 *
 * Browser-gate defect (EDITOR-9-EMPTY-OPTIONAL-SAVE/20261011T0550-regate,
 * defect 1, VERDICT: fix): handleCreateRecord (RecordRegistryPage.tsx:136-144)
 * sets payload:{} and DISCARDS the precompile payload (RecordSearchCombobox.tsx:
 * 187-193 — kind/id/displayName/status). serializeDocument clones the empty
 * base and overlays only projection slot paths; the person draft projection has
 * no `kind` slot, so the POST body lacks kind (Ajv 422 "Missing required
 * property: kind") and, unless the ID is hand-typed, id (server 400 "payload
 * must contain recordId or id field"). Edit mode works precisely because its
 * base keeps the record's own kind/id — create must get the same mechanism.
 *
 * Contract (mandated fix direction, smallest): thread the combobox payload into
 * handleCreateRecord and seed selectedRecord.payload with it. No client-side id
 * minting, no server change, no serializer omission-semantics change.
 */
describe('RecordRegistryPage — create-from-search base carries the precompile payload (EDITOR-9 fix-2)', () => {
  it('seeds the create-mode editor base with the precompile payload (kind + id present)', async () => {
    render(<RecordRegistryPage />)
    await waitFor(() => {
      expect(mocked.mockComboboxSchemaId).toBe(PERSON_SCHEMA_ID)
    })
    fireEvent.click(screen.getByTestId('simulate-web-create'))
    await waitFor(() => {
      expect(mocked.editorDataProp).not.toBeNull()
    })
    // RED at base: the page seeds payload:{} (RecordRegistryPage.tsx:137), so
    // the editor base has neither kind nor id.
    expect(mocked.editorDataProp!['kind']).toBe('person')
    expect(mocked.editorDataProp!['id']).toBe('PER-EDITOR9-FIX2')
  })

  it('save POST body from a create-from-search session includes kind + id and omits empty optionals', async () => {
    render(<RecordRegistryPage />)
    await waitFor(() => {
      expect(mocked.mockComboboxSchemaId).toBe(PERSON_SCHEMA_ID)
    })
    fireEvent.click(screen.getByTestId('simulate-web-create'))
    await waitFor(() => {
      expect(mocked.editorDataProp).not.toBeNull()
    })
    // The editor reports the user's edit (only the required fields filled) —
    // this is what flips Save from disabled to enabled (dirty tracking).
    mocked.editorOnUpdate!({ displayName: 'EDITOR9 FIX2 PERSON', status: 'active' }, true)
    const saveButton = await screen.findByText('Save')
    expect((saveButton as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(apiClient.createRecord).toHaveBeenCalledTimes(1)
    })
    const [schemaIdArg, body] = (apiClient.createRecord as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(schemaIdArg).toBe(PERSON_SCHEMA_ID)
    // RED at base: body = { displayName, status } only — no kind (Ajv 422),
    // no id (server 400). GREEN: the base clone carries kind/id through.
    expect(body['kind']).toBe('person')
    expect(body['id']).toBe('PER-EDITOR9-FIX2')
    expect(body['displayName']).toBe('EDITOR9 FIX2 PERSON')
    expect(body['status']).toBe('active')
    // EDITOR-9 shipped contract must NOT regress: empty optionals serialize
    // to ABSENCE, not '' / null / {}.
    expect('organizationId' in body).toBe(false)
    expect('contact' in body).toBe(false)
    expect('notes' in body).toBe(false)
  })
})
