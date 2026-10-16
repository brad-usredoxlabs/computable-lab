/**
 * QMS7-5 (RED-first) — a discoverable Create affordance on EVERY registry tab
 * must open the exact governed draft path EDITOR-9 shipped.
 *
 * Task verified-by (wave3): "from EACH tab Create opens a projected draft
 * without needing a failed search; save creates a governed draft record
 * (state from stamping), visible in the list after save; invalid payload
 * errors actionably without losing entered content; approved/effective records
 * offer draft-copy not in-place save; no CSV modal in DOM."
 *
 * RED at base (cl/integration-1 @ c892847d): the ONLY create path on
 * /registry is the search combobox (RecordRegistryPage.tsx:352-369) — a
 * failed-search prerequisite. No Create button exists in the list panel.
 *
 * Contract this suite pins (no new policy invented):
 * - Create reuses handleCreateRecord (RecordRegistryPage.tsx:169) — the same
 *   editor-draft projection + serializeDocument base-seed mechanism as
 *   create-from-search. Nothing persists until Save.
 * - The kind source is the tab's `kinds` DATA (REGISTRY_TABS) only; the
 *   schema $id comes from schemaNodes (GET /schemas + deriveSchemaNode).
 *   No kind→schema map, no id-prefix table (CLAUDE.md hard boundary).
 * - The create base must carry `kind` + a schema-compliant `id` (EDITOR-9
 *   fix-2): the id is derived from the schema-DECLARED
 *   properties.id.pattern ^PREFIX- anchor (GET /schemas/:id). A schema whose
 *   id pattern is missing/unparseable yields an actionable error and the
 *   editor is NOT opened — never a fabricated prefix.
 * - Save-failure keeps the edited draft + surfaces the server message
 *   verbatim (RecordRegistryPage.tsx:247-248 pin).
 * - CsvImportModal dead chrome is deleted: no csv-import-modal node, and the
 *   module no longer resolves.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import React from 'react'
import { render, screen, waitFor, fireEvent, cleanup, within, act } from '@testing-library/react'
import RecordRegistryPage from './RecordRegistryPage'

// ---------------------------------------------------------------------------
// Mock data — mirrors the REAL registry shape measured live on :3092
// (GET /api/schemas lists 196 entries; every registry kind declares
// properties.id.pattern `^PREFIX-[A-Z0-9][A-Z0-9_-]*$`).
// ---------------------------------------------------------------------------

const SCHEMA_ID = (kind: string) =>
  `https://computable-lab.com/schema/computable-lab/${kind}.schema.yaml`

const REGISTRY_KINDS = [
  'person',
  'equipment',
  'equipment-class',
  'training-material',
  'training-record',
  'competency-authorization',
  'equipment-training-requirement',
  'instrument',
  'calibration-record',
  'qualification-record',
  'verb-definition',
  'equipment-capability',
  'controlled-document',
] as const

const mocked = vi.hoisted(() => ({
  draftProjectionCalls: [] as string[],
  schemaFetches: [] as string[],
  // schemaId -> declared properties.id.pattern, exactly as the server's
  // GET /schemas/:id returns it. Tests mutate this to model a schema
  // WITHOUT a parseable pattern.
  patterns: {} as Record<string, string | undefined>,
  editorDataProp: null as Record<string, unknown> | null,
  editorOnUpdate: null as ((payload: Record<string, unknown>, dirty: boolean) => void) | null,
  editorDoc: null as unknown,
  projection: {
    schemaId: 'x',
    recordId: '__draft__',
    title: 'New Record',
    blocks: [{ id: 'b1', kind: 'section', label: 'Identity', slotIds: ['s1', 's2'] }],
    slots: [
      { id: 's1', path: '$.id', label: 'ID', widget: 'text', readOnly: true },
      { id: 's2', path: '$.displayName', label: 'Display Name', widget: 'text' },
    ],
    diagnostics: [],
  },
}))

function declaredPattern(kind: string): string {
  // The uniform declared shape verified first-hand on :3092 for every
  // registry kind (person ^PER-…, equipment ^EQP-…, instrument ^INSTR-…).
  const prefixes: Record<string, string> = {
    person: 'PER',
    equipment: 'EQP',
    'equipment-class': 'EQC',
    'training-material': 'TRM',
    'training-record': 'TRR',
    'competency-authorization': 'AUTH',
    'equipment-training-requirement': 'ETR',
    instrument: 'INSTR',
    'calibration-record': 'CAL',
    'qualification-record': 'QUAL',
    'verb-definition': 'VERB',
    'equipment-capability': 'ECP',
    'controlled-document': 'DOC',
  }
  return `^${prefixes[kind]}-[A-Z0-9][A-Z0-9_-]*$`
}

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
    // The schema-registry metadata endpoint (EDITOR-9 fix-1 wiring).
    getSchemas: vi.fn(() =>
      Promise.resolve(
        REGISTRY_KINDS.map((kind) => ({
          id: SCHEMA_ID(kind),
          path: `lab/${kind}.schema.yaml`,
          title: kind,
        })),
      ),
    ),
    // GET /schemas/:id — returns the FULL schema document (verified live:
    // {id, path, schema:{…properties.id.pattern…}}).
    getSchema: vi.fn((schemaId: string) => {
      mocked.schemaFetches.push(schemaId)
      const pattern = mocked.patterns[schemaId]
      return Promise.resolve({
        id: schemaId,
        path: 'lab/schema.yaml',
        title: schemaId,
        schema: {
          $id: schemaId,
          type: 'object',
          properties: {
            ...(pattern ? { id: { type: 'string', pattern } } : {}),
          },
        },
      })
    }),
  },
}))

vi.mock('../components/registry/RecordSearchCombobox', () => ({
  RecordSearchCombobox: () => <div data-testid="record-search-combobox" />,
}))

vi.mock('../components/registry/RelatedRecordsCard', () => ({
  RelatedRecordsCard: () => null,
}))

vi.mock('../editor/taptab/TapTabEditor', () => ({
  // Stand-in for ProjectionTapTabEditor (same harness as
  // RecordRegistryPage.createSearch.test.tsx): captures the `data` prop —
  // the create base the page feeds the editor — and exposes getEditor()
  // through the forwarded ref. getJSON returns the doc handleSave serializes.
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

// The Create handler is async (GET /schemas/:id before opening the editor);
// wrap the click in act so the awaited continuation settles inside act.
async function clickCreate() {
  await act(async () => {
    fireEvent.click(screen.getByTestId('registry-create-button'))
  })
}

async function openTab(label: string) {
  fireEvent.click(screen.getByText(label))
  // The Create button is offered disabled until the schema registry resolves
  // (kind -> $id needs GET /schemas); wait for it to be actionable.
  await waitFor(() => {
    const button = screen.getByTestId('registry-create-button') as HTMLButtonElement
    expect(button.disabled).toBe(false)
  })
}

describe('RecordRegistryPage — per-tab Create affordance (QMS7-5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.draftProjectionCalls = []
    mocked.schemaFetches = []
    mocked.editorDataProp = null
    mocked.editorOnUpdate = null
    for (const kind of REGISTRY_KINDS) {
      mocked.patterns[SCHEMA_ID(kind)] = declaredPattern(kind)
    }
    // The doc the editor holds after the user fills the required fields.
    // Optionals carry their unset value — the serializer must omit them
    // (EDITOR-9 contract, re-pinned here for the Create-button path).
    mocked.editorDoc = {
      type: 'doc',
      content: [
        { type: 'fieldRow', attrs: { path: '$.id', widget: 'text', value: null, readOnly: true } },
        { type: 'fieldRow', attrs: { path: '$.displayName', widget: 'text', value: 'QMS75 CREATED PERSON' } },
        { type: 'fieldRow', attrs: { path: '$.status', widget: 'select', value: 'active' } },
        { type: 'fieldRow', attrs: { path: '$.organizationId', widget: 'text', value: '' } },
        { type: 'fieldRow', attrs: { path: '$.notes', widget: 'textarea', value: null } },
      ],
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('every registry tab offers a Create button once the schema registry is loaded', async () => {
    render(<RecordRegistryPage />)
    await waitFor(() => {
      expect(screen.getByTestId('registry-create-button')).toBeTruthy()
    })
    // RED at base: no Create affordance exists anywhere in the list panel —
    // the only create path is the combobox (a failed-search prerequisite).
    for (const label of [
      'People',
      'Equipment',
      'Training',
      'Authorizations',
      'Instruments',
      'Calibrations',
      'Verbs',
      'Capabilities',
      'Documents',
    ]) {
      await openTab(label)
      const button = screen.getByTestId('registry-create-button')
      expect(button.textContent).toMatch(/create/i)
    }
  })

  it('People tab Create opens the draft projection for the person schema $id with a kind+id base', async () => {
    render(<RecordRegistryPage />)
    await openTab('People')
    await clickCreate()

    await waitFor(() => {
      expect(screen.getByTestId('projection-taptab-editor')).toBeTruthy()
    })
    // The draft projection is requested with the REAL person $id — never ''.
    expect(mocked.draftProjectionCalls).toContain(SCHEMA_ID('person'))
    expect(mocked.draftProjectionCalls).not.toContain('')

    // The create base carries kind + a schema-compliant id derived from the
    // DECLARED pattern (EDITOR-9 fix-2 mechanism; no client-side prefix table).
    await waitFor(() => {
      expect(mocked.editorDataProp).not.toBeNull()
    })
    expect(mocked.editorDataProp!['kind']).toBe('person')
    const pattern = mocked.patterns[SCHEMA_ID('person')]!
    const seededId = mocked.editorDataProp!['id']
    expect(typeof seededId).toBe('string')
    expect(new RegExp(pattern).test(seededId as string)).toBe(true)
    // The prefix comes from the pattern's literal ^PREFIX- anchor, not a
    // client-side map.
    const prefix = /^\^([A-Z]+)-/.exec(pattern)![1]
    expect((seededId as string).startsWith(`${prefix}-`)).toBe(true)
  })

  it('Equipment tab Create offers exactly the tab kinds (from kinds data), default first, and resolves the chosen kind to its $id', async () => {
    render(<RecordRegistryPage />)
    await openTab('Equipment')
    await clickCreate()

    // Multi-kind tab: a picker listing the tab's kinds — no third kind,
    // no invented display vocab (ontology kind strings verbatim).
    const picker = await screen.findByTestId('registry-create-kind-picker')
    const optionNames = within(picker)
      .getAllByRole('button')
      .map((b) => b.textContent)
      .filter((t) => t !== 'Confirm' && t !== 'Cancel')
    expect(optionNames).toEqual(['equipment', 'equipment-class'])

    fireEvent.click(within(picker).getByRole('button', { name: 'equipment-class' }))
    await act(async () => {
      fireEvent.click(within(picker).getByRole('button', { name: 'Confirm' }))
    })

    await waitFor(() => {
      expect(mocked.draftProjectionCalls).toContain(SCHEMA_ID('equipment-class'))
    })
    expect(mocked.draftProjectionCalls).not.toContain(SCHEMA_ID('equipment'))
    expect(mocked.draftProjectionCalls).not.toContain('')
    await waitFor(() => {
      expect(mocked.editorDataProp!['kind']).toBe('equipment-class')
    })
  })

  it('Equipment tab Create defaults to the tab primary kind when confirmed without choosing', async () => {
    render(<RecordRegistryPage />)
    await openTab('Equipment')
    await clickCreate()
    const picker = await screen.findByTestId('registry-create-kind-picker')
    await act(async () => {
      fireEvent.click(within(picker).getByRole('button', { name: 'Confirm' }))
    })
    await waitFor(() => {
      expect(mocked.draftProjectionCalls).toContain(SCHEMA_ID('equipment'))
    })
  })

  it('a schema without a parseable id pattern errors actionably, opens no editor, and never calls createRecord', async () => {
    // Model a schema that declares no properties.id.pattern.
    mocked.patterns[SCHEMA_ID('verb-definition')] = undefined
    render(<RecordRegistryPage />)
    await openTab('Verbs')
    await clickCreate()

    await waitFor(() => {
      expect(screen.getByTestId('registry-create-error')).toBeTruthy()
    })
    expect(screen.getByTestId('registry-create-error').textContent).toMatch(/id pattern/i)
    expect(screen.queryByTestId('projection-taptab-editor')).toBeNull()
    expect(mocked.draftProjectionCalls).not.toContain(SCHEMA_ID('verb-definition'))
    expect(mocked.draftProjectionCalls).not.toContain('')
    expect(mocked.editorDataProp).toBeNull()
    const { apiClient } = await import('../shared/api/client')
    expect(apiClient.createRecord).not.toHaveBeenCalled()
  })

  it('Create + edit + Save posts a governed body carrying kind + seeded id and omits empty optionals', async () => {
    const { apiClient } = await import('../shared/api/client')
    render(<RecordRegistryPage />)
    await openTab('People')
    await clickCreate()
    await waitFor(() => {
      expect(mocked.editorDataProp).not.toBeNull()
    })
    // The editor reports the user's edit — flips Save from disabled to enabled.
    mocked.editorOnUpdate!({ displayName: 'QMS75 CREATED PERSON', status: 'active' }, true)
    const saveButton = await screen.findByRole('button', { name: /^save/i })
    expect((saveButton as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(apiClient.createRecord).toHaveBeenCalledTimes(1)
    })
    const [schemaIdArg, body] = (apiClient.createRecord as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(schemaIdArg).toBe(SCHEMA_ID('person'))
    expect(body['kind']).toBe('person')
    expect(new RegExp(mocked.patterns[SCHEMA_ID('person')]!).test(body['id'] as string)).toBe(true)
    expect(body['displayName']).toBe('QMS75 CREATED PERSON')
    expect(body['status']).toBe('active')
    // EDITOR-9 shipped contract must NOT regress on the Create-button path:
    // empty optionals serialize to ABSENCE, not '' / null.
    expect('organizationId' in body).toBe(false)
    expect('notes' in body).toBe(false)
  })

  it('a rejected save keeps the editor and the entered content, shows the server message verbatim, and Cancel exits cleanly', async () => {
    const { apiClient } = await import('../shared/api/client')
    ;(apiClient.createRecord as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('422 Unprocessable Entity: Missing required property: displayName'),
    )
    render(<RecordRegistryPage />)
    await openTab('People')
    await clickCreate()
    await waitFor(() => {
      expect(mocked.editorDataProp).not.toBeNull()
    })
    mocked.editorOnUpdate!({ displayName: 'QMS75 REJECTED PERSON', status: 'active' }, true)
    fireEvent.click(await screen.findByRole('button', { name: /^save/i }))

    // The server message renders verbatim and the draft survives (pin:
    // RecordRegistryPage.tsx:247-251 sets error WITHOUT clearing selection).
    await waitFor(() => {
      expect(screen.getByText(/Missing required property: displayName/)).toBeTruthy()
    })
    expect(screen.getByTestId('projection-taptab-editor')).toBeTruthy()
    expect(mocked.editorDataProp!['displayName']).toBeUndefined // base untouched by the failure
    expect(mocked.editorDataProp!['kind']).toBe('person')

    fireEvent.click(await screen.findByRole('button', { name: /cancel/i }))
    await waitFor(() => {
      expect(screen.getByText('Select a record to edit')).toBeTruthy()
    })
    expect(screen.queryByTestId('projection-taptab-editor')).toBeNull()
  })

  it('no CSV import chrome exists in the DOM or on disk (dead-code removal)', async () => {
    render(<RecordRegistryPage />)
    await waitFor(() => {
      expect(screen.getByTestId('registry-create-button')).toBeTruthy()
    })
    expect(screen.queryByTestId('csv-import-modal')).toBeNull()
    await clickCreate()
    expect(screen.queryByTestId('csv-import-modal')).toBeNull()
    // The module itself is deleted (dead chrome is a defect — OQ-1 ruling).
    // Checked on disk: a static import() of the deleted path would itself
    // fail vite's transform, so the pin is the file's absence.
    expect(existsSync(path.resolve(__dirname, '../components/registry/CsvImportModal.tsx'))).toBe(false)
  })
})
