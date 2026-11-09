/**
 * GC-2R (RED-first) — GC-2's acceptance criterion "a gc-method record is
 * visible in the /registry UI": REGISTRY_TABS carries exactly one tab whose
 * kinds DATA includes 'gc-method' (id 'methods', label 'Methods'), and the
 * page's data-driven paths (tab strip + per-tab Create) derive from it with
 * zero kind-specific code.
 *
 * Contract this suite pins (no new policy invented):
 * - The tab/kinds DATA (REGISTRY_TABS) is the single source for the tab
 *   strip, the listing filter, and the Create affordance
 *   (RecordRegistryPage.tsx header comment) — the tests read the SAME data
 *   the page renders; no test-side kind maps.
 * - Single-kind tab: Create opens the governed draft path DIRECTLY for the
 *   tab's kinds[0] (no picker), resolving kind -> schema $id through the
 *   schema registry (GET /schemas) — the QMS7-5 mechanism, not a
 *   kind→schema map.
 * - The seeded id satisfies the gc-method schema's DECLARED
 *   properties.id.pattern `^GCM-[A-Za-z0-9_-]+$` (schema/lab/
 *   gc-method.schema.yaml) — derived from the schema document, never a
 *   fabricated prefix.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react'
import RecordRegistryPage, { REGISTRY_TABS } from './RecordRegistryPage'

const SCHEMA_ID = (kind: string) =>
  `https://computable-lab.com/schema/computable-lab/${kind}.schema.yaml`

// The id pattern exactly as schema/lab/gc-method.schema.yaml declares it
// (line 27) — note: this kind's declared pattern is NOT the uniform
// ^PREFIX-[A-Z0-9][A-Z0-9_-]*$ shape of the older registry kinds.
const GCM_DECLARED_PATTERN = '^GCM-[A-Za-z0-9_-]+$'

const mocked = vi.hoisted(() => ({
  draftProjectionCalls: [] as string[],
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
    // The schema-registry metadata endpoint (EDITOR-9 fix-1 wiring): the
    // gc-method schema as GET /schemas serves it (kind from the file stem,
    // cf. RecordRegistryPage.createTab.test.tsx mock shape).
    getSchemas: vi.fn(() =>
      Promise.resolve([
        {
          id: SCHEMA_ID('gc-method'),
          path: 'lab/gc-method.schema.yaml',
          title: 'gc-method',
        },
      ]),
    ),
    // GET /schemas/:id — the FULL schema document with the DECLARED
    // properties.id.pattern (the seed derivation reads ONLY this).
    getSchema: vi.fn((schemaId: string) =>
      Promise.resolve({
        id: schemaId,
        path: 'lab/gc-method.schema.yaml',
        title: schemaId,
        schema: {
          $id: schemaId,
          type: 'object',
          properties: { id: { type: 'string', pattern: GCM_DECLARED_PATTERN } },
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
  // RecordRegistryPage.createTab.test.tsx): captures the `data` prop — the
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

async function clickCreate() {
  await act(async () => {
    fireEvent.click(screen.getByTestId('registry-create-button'))
  })
}

describe('GC-2R — registry Methods tab row for the gc-method kind', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.draftProjectionCalls = []
    mocked.editorDataProp = null
  })

  afterEach(() => {
    cleanup()
  })

  // (a) RED at base (GC-2 merged c59890af): no REGISTRY_TABS row names the
  // gc-method kind, so gc-method records are invisible in /registry.
  it('REGISTRY_TABS contains exactly one tab whose kinds include gc-method — id methods, full-word label Methods', () => {
    const matches = REGISTRY_TABS.filter((tab) =>
      (tab.kinds as readonly string[]).includes('gc-method'),
    )
    expect(matches).toHaveLength(1)
    expect(matches[0].id).toBe('methods')
    // Full-word label — 'Methods', not a longer label that merely contains it.
    expect(matches[0].label).toBe('Methods')
  })

  // (b) The tab strip renders the tab from the SAME data (no test-side kind
  // map): find the tab IN REGISTRY_TABS and open it by its label.
  it('the page renders a Methods tab in the tab strip, derived from the REGISTRY_TABS row', async () => {
    const tab = REGISTRY_TABS.find((t) =>
      (t.kinds as readonly string[]).includes('gc-method'),
    )
    expect(tab).toBeTruthy()
    render(<RecordRegistryPage />)
    await openTab(tab!.label)
    // The active tab's Create button is actionable — the data-driven wiring
    // (schemaNodes from GET /schemas) resolved the row's kind.
    expect(screen.getByTestId('registry-create-button')).toBeTruthy()
    // The listing read goes through the EXISTING refreshRecords path over
    // the tab's kinds DATA — gc-method is requested verbatim (one kind).
    const { apiClient } = await import('../shared/api/client')
    expect(apiClient.listRecordsByKind).toHaveBeenCalledWith('gc-method', 100)
  })

  // (c) The Create affordance derives from the SAME data: open the tab by
  // its REGISTRY_TABS label, Create for its kinds[0], and the governed draft
  // path opens for the gc-method schema $id with a kind + declared-pattern
  // compliant id base — the QMS7-5 mechanism, single-kind tab, no picker.
  it('Create on the data-derived Methods tab opens the gc-method draft with a kind + declared-pattern id base', async () => {
    const tab = REGISTRY_TABS.find((t) =>
      (t.kinds as readonly string[]).includes('gc-method'),
    )
    expect(tab).toBeTruthy()
    render(<RecordRegistryPage />)
    await openTab(tab!.label)
    await clickCreate()

    await waitFor(() => {
      expect(screen.getByTestId('projection-taptab-editor')).toBeTruthy()
    })
    // Single-kind tab: no kind picker, the draft projection is requested
    // DIRECTLY with the gc-method schema $id — never ''.
    expect(screen.queryByTestId('registry-create-kind-picker')).toBeNull()
    expect(mocked.draftProjectionCalls).toContain(SCHEMA_ID('gc-method'))
    expect(mocked.draftProjectionCalls).not.toContain('')

    // The create base carries the tab's kind verbatim and an id seeded from
    // the schema's DECLARED pattern (no client-side prefix table).
    await waitFor(() => {
      expect(mocked.editorDataProp).not.toBeNull()
    })
    expect(mocked.editorDataProp!['kind']).toBe('gc-method')
    const seededId = mocked.editorDataProp!['id']
    expect(typeof seededId).toBe('string')
    expect(new RegExp(GCM_DECLARED_PATTERN).test(seededId as string)).toBe(true)
  })
})
