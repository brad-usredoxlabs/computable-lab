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
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import RecordRegistryPage from './RecordRegistryPage'

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
            onSelect({ recordId: '', schemaId, payload: { displayName: 'New Person' }, isNew: true })
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
  ProjectionTapTabEditor: () => <div data-testid="projection-taptab-editor" />,
}))

describe('RecordRegistryPage — create-from-search schemaId wiring (EDITOR-9 fix-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.draftProjectionCalls = []
    mocked.mockComboboxSchemaId = null
    mocked.mockComboboxKinds = null
    mocked.mockOnSelect = null
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
