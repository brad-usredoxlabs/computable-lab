/**
 * GC-16 (W2) — the knowledge triplet (assertion / claim / evidence) is
 * authorable in the /registry UI: REGISTRY_TABS carries exactly one tab whose
 * kinds DATA is the triplet (id 'knowledge', grouping label 'Knowledge'), and
 * the page's data-driven paths (tab strip + listing filter + QMS7-5
 * multi-kind Create picker) derive from it with zero kind-specific code.
 *
 * Contract this suite pins (no new policy invented; the row IS the feature —
 * the gc-method precedent, pinned the same way in
 * RecordRegistryPage.gcmethod.test.tsx):
 * - The tab/kinds DATA (REGISTRY_TABS) is the single source for the tab
 *   strip, the listing filter, and the Create affordance — the tests read the
 *   SAME data the page renders; no test-side kind maps.
 * - "Knowledge" is a GROUPING label mirroring the schema/knowledge/
 *   directory — NOT a record kind and NOT a new entity term (one term per
 *   entity: the kinds are the schema kind names assertion/claim/evidence
 *   themselves, rendered verbatim in the picker).
 * - The listing filter reads each kind VERBATIM through the existing
 *   listRecordsByKind path (three kinds, one per array element).
 * - A multi-kind tab's Create opens the QMS7-5 kinds picker (default = the
 *   primary kind); the picker lists the row's kinds DATA.
 * - Confirming a served kind whose schema declares NO properties.id.pattern
 *   (the knowledge triplet declares none — verified against the raw YAML and
 *   the live served schema) is refused LOUD and actionable ("No id pattern
 *   declared … a schema-compliant id cannot be derived") — never a
 *   fabricated prefix (OQ-3: "No prefix is ever fabricated") and never a
 *   dead "Create undefined" form (dead-chrome ban). The refusal is the
 *   governed seed path's own actionable error; the test pins that it fires
 *   and that no draft projection / create is attempted past it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react'
import RecordRegistryPage, { REGISTRY_TABS } from './RecordRegistryPage'

const SCHEMA_ID = (kind: string) =>
  `https://computable-lab.com/schema/computable-lab/${kind}.schema.yaml`

const KNOWLEDGE_KINDS = ['assertion', 'claim', 'evidence'] as const

const mocked = vi.hoisted(() => ({
  draftProjectionCalls: [] as string[],
  createRecordCalls: [] as unknown[],
  editorDataProp: null as Record<string, unknown> | null,
  projection: {
    schemaId: 'x',
    recordId: '__draft__',
    title: 'New Record',
    blocks: [{ id: 'b1', kind: 'section', label: 'Identity', slotIds: ['s1'] }],
    slots: [{ id: 's1', path: '$.id', label: 'ID', widget: 'text', readOnly: true }],
    diagnostics: [],
  },
}))

vi.mock('../shared/api/client', () => ({
  apiClient: {
    listRecordsByKind: vi.fn().mockResolvedValue({ records: [] }),
    searchRecordsByKind: vi.fn().mockResolvedValue({ records: [] }),
    updateRecord: vi.fn().mockResolvedValue(undefined),
    createRecord: vi.fn((schemaId: string, payload: unknown) => {
      mocked.createRecordCalls.push([schemaId, payload])
      return Promise.resolve(undefined)
    }),
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
    // The schema-registry metadata endpoint (EDITOR-9 fix-1 wiring): the
    // three knowledge schemas as GET /schemas serves them (kind from the file
    // stem, cf. RecordRegistryPage.gcmethod.test.tsx mock shape).
    getSchemas: vi.fn(() =>
      Promise.resolve(
        KNOWLEDGE_KINDS.map((kind) => ({
          id: SCHEMA_ID(kind),
          path: `knowledge/${kind}.schema.yaml`,
          title: kind,
        })),
      ),
    ),
    // GET /schemas/:id — the FULL schema document. The knowledge triplet
    // declares `properties.id` as a plain string with NO `pattern` (verified
    // against the raw YAML and the live served schema), so the registry's
    // OQ-3 seed derivation has no declared anchor and must refuse rather
    // than fabricate a prefix.
    getSchema: vi.fn((schemaId: string) =>
      Promise.resolve({
        id: schemaId,
        path: `knowledge/${schemaId.split('/').pop() ?? ''}`,
        title: schemaId,
        schema: {
          $id: schemaId,
          type: 'object',
          properties: { id: { type: 'string' } }, // no pattern — by schema
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
  // Stand-in for ProjectionTapTabEditor (same harness as
  // RecordRegistryPage.gcmethod.test.tsx): captures the `data` prop — the
  // create base the page feeds the editor.
  ProjectionTapTabEditor: React.forwardRef(
    (
      props: {
        data: Record<string, unknown>
        onUpdate?: (payload: Record<string, unknown>, dirty: boolean) => void
      },
      ref: React.Ref<{ getEditor: () => { getJSON: () => unknown } | null }>,
    ) => {
      mocked.editorDataProp = props.data
      React.useImperativeHandle(ref, () => ({
        getEditor: () => ({ getJSON: () => null }),
      }))
      return <div data-testid="projection-taptab-editor" />
    },
  ),
}))

async function openTab(label: string) {
  fireEvent.click(screen.getByText(label))
  // The Create button is offered disabled until the schema registry resolves
  // (kind -> $id needs GET /schemas); wait for it to be actionable.
  await waitFor(() => {
    const button = screen.getByTestId('registry-create-button') as HTMLButtonElement
    expect(button.disabled).toBe(false)
  })
}

describe('GC-16 W2 — registry Knowledge tab row for the assertion/claim/evidence triplet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.draftProjectionCalls = []
    mocked.createRecordCalls = []
    mocked.editorDataProp = null
  })

  afterEach(() => {
    cleanup()
  })

  // (a) The row DATA is the single source: exactly one tab names the
  // triplet, with id 'knowledge' and the grouping label 'Knowledge'. The
  // kinds are the schema kind names verbatim (one term per entity).
  it('REGISTRY_TABS contains exactly one tab whose kinds are assertion/claim/evidence — id knowledge, grouping label Knowledge', () => {
    const matches = REGISTRY_TABS.filter((tab) =>
      KNOWLEDGE_KINDS.every((k) => (tab.kinds as readonly string[]).includes(k)),
    )
    expect(matches).toHaveLength(1)
    expect(matches[0].id).toBe('knowledge')
    // Full-word grouping label — 'Knowledge', mirroring schema/knowledge/.
    expect(matches[0].label).toBe('Knowledge')
    // The kinds are the schema kind names themselves, verbatim (no invented
    // display vocab, no 'knowledge' kind).
    expect([...matches[0].kinds]).toEqual(['assertion', 'claim', 'evidence'])
  })

  // (b) The tab strip renders the tab from the SAME data (no test-side kind
  // map): find the tab IN REGISTRY_TABS and open it by its label. The
  // listing filter reads each kind VERBATIM through listRecordsByKind.
  it('the page renders a Knowledge tab derived from the REGISTRY_TABS row, and lists all three kinds verbatim', async () => {
    const tab = REGISTRY_TABS.find((t) => t.id === 'knowledge')
    expect(tab).toBeTruthy()
    render(<RecordRegistryPage />)
    await openTab(tab!.label)
    expect(screen.getByTestId('registry-create-button')).toBeTruthy()
    // The listing read goes through the EXISTING refreshRecords path over the
    // tab's kinds DATA — all three kinds are requested verbatim.
    const { apiClient } = await import('../shared/api/client')
    for (const kind of KNOWLEDGE_KINDS) {
      expect(apiClient.listRecordsByKind).toHaveBeenCalledWith(kind, 100)
    }
  })

  // (c) The Create affordance derives from the SAME data: a multi-kind tab
  // opens the QMS7-5 kinds picker (default = primary kind), and the picker
  // lists the row's kinds verbatim — the schema kind names, not the grouping
  // label.
  it('Create on the data-derived Knowledge tab opens the multi-kind picker listing the row kinds verbatim', async () => {
    const tab = REGISTRY_TABS.find((t) => t.id === 'knowledge')
    expect(tab).toBeTruthy()
    render(<RecordRegistryPage />)
    await openTab(tab!.label)
    await act(async () => {
      fireEvent.click(screen.getByTestId('registry-create-button'))
    })
    // Multi-kind tab: the QMS7-5 picker opens (no single-kind direct create).
    const picker = screen.getByTestId('registry-create-kind-picker')
    expect(picker).toBeTruthy()
    // The picker chips are the row's kinds DATA verbatim — the schema kind
    // names. 'Knowledge' (the grouping label) is NOT a chip; it is only the
    // tab strip label.
    for (const kind of KNOWLEDGE_KINDS) {
      expect(screen.getByText(kind)).toBeTruthy()
    }
    expect(screen.getByText('Knowledge')).toBeTruthy() // the tab strip label
  })

  // (d) Confirming a served knowledge kind whose schema declares NO
  // properties.id.pattern is refused LOUD and actionable — the OQ-3 seed
  // path's own error. It never fabricates a prefix and never opens a dead
  // "Create undefined" form (dead-chrome ban): no draft projection and no
  // create are attempted past the refusal.
  it('Confirm a served kind with no declared id pattern is refused loudly and actionably (no fabricated prefix, no dead form)', async () => {
    const tab = REGISTRY_TABS.find((t) => t.id === 'knowledge')
    expect(tab).toBeTruthy()
    render(<RecordRegistryPage />)
    await openTab(tab!.label)
    await act(async () => {
      fireEvent.click(screen.getByTestId('registry-create-button'))
    })
    // Select the primary kind (assertion) and Confirm.
    fireEvent.click(screen.getByText('assertion'))
    await act(async () => {
      fireEvent.click(screen.getByText('Confirm'))
    })
    // The actionable, named refusal — the governed seed path's own error
    // (no declared anchor -> no fabricable id). It names the kind.
    // GC-16 FIX RUN 2 (defect 7, provisional R-1): the refusal NAMES THE
    // WORKING DOOR (/record/new/<kind>) — the actionable next step, since the
    // registry door does not mint ids.
    await waitFor(() => {
      const err = screen.getByTestId('registry-create-error')
      expect(err.textContent).toContain('No id pattern declared')
      expect(err.textContent).toContain('assertion')
      expect(err.textContent).toContain('/record/new/assertion')
    })
    // No fabricated-prefix draft was opened: no editor, no draft projection,
    // no create. (Dead-chrome ban: a served kind with an unseedable id is
    // refused, not rendered as a dead "Create undefined" form.)
    expect(screen.queryByTestId('projection-taptab-editor')).toBeNull()
    expect(mocked.draftProjectionCalls).toEqual([])
    expect(mocked.createRecordCalls).toEqual([])
  })
})
