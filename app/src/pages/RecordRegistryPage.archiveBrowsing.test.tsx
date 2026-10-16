/**
 * QMS7-6 (RED-first) — archived browsing on /registry (CRUA "A", AC-5/6/8).
 *
 * Task verified-by (wave3): "Archived record vanishes from the default list,
 * appears under archived browsing, opens read-only, references from it
 * resolve. [...] No delete button exists."
 *
 * RED at base (post-QMS7-5 tip 5082ac9b): RecordRegistryPage.tsx has ZERO
 * archived-browsing handling (grep confirms no toggle, no filter) — archived
 * rows render in the default list and the editor offers Save for them.
 *
 * Design contract pinned here (OQ-1(A)/OQ-2(A) rulings):
 * - The hide rule is DATA: a row is hidden iff its lifecycle's declared
 *   terminal set (GET /lifecycle/:lifecycleId/transitions -> terminalStates,
 *   the read-only echo of the YAML `terminal: true` facts) contains the row's
 *   payload.state. The page contains NO state-string literal; this suite mocks
 *   the facts endpoint (fixture data, not policy).
 * - Bait 2 (state vs status): the archived fixture row deliberately carries
 *   status:'active' next to state:'archived' (equipment payloads carry both —
 *   measured on :3092). A filter that read `status` would keep the row visible
 *   and this suite fails; the rule MUST read payload.state.
 * - Bait 6 (toggle-vs-refresh race): toggling is render-level state — it must
 *   NOT trigger a list refetch (listRecordsByKind call count unchanged).
 * - OQ-2(A): archived (terminal) selection -> editor read-only: no Save,
 *   draft-copy offered instead (OQ-3: draft-copy KEPT — new record id, never
 *   an unarchive), editor disabled, RelatedRecordsCard still mounts (AC-6).
 * - AC-8: zero delete affordances in any browsing state; zero DELETE fetches
 *   spied. (client.ts DOES carry DELETE methods for group members / AI
 *   profiles — the accurate claim is: no RECORD-level delete verb.)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import RecordRegistryPage from './RecordRegistryPage'

// ---------------------------------------------------------------------------
// Mock data — mirrors the REAL registry rows measured live on :3092
// (payload carries lifecycleId + state; equipment payloads ALSO carry status;
// archived rows are returned by GET /records today — no server state filter).
// ---------------------------------------------------------------------------

const SCHEMA_ID = (kind: string) =>
  `https://computable-lab.com/schema/computable-lab/${kind}.schema.yaml`

// Hoisted vi.fn() handles + data: the vi.mock factory is hoisted above module
// constants, so everything it references must live in vi.hoisted (the
// REGISTRY_KINDS ReferenceError trap the older suites dodge).
const mocked = vi.hoisted(() => ({
  REGISTRY_KINDS: [
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
  ] as string[],
  listRecordsByKind: vi.fn(),
  getValidTransitions: vi.fn(),
  updateRecord: vi.fn(),
  getLifecycleTerminalStates: vi.fn(),
  getRecord: vi.fn(),
  createDraftCopy: vi.fn(),
  editorDataProp: null as Record<string, unknown> | null,
  editorDisabled: null as boolean | null,
  projection: {
    schemaId: 'x',
    recordId: '__p__',
    title: 'Record',
    blocks: [{ id: 'b1', kind: 'section', label: 'Identity', slotIds: ['s1'] }],
    slots: [{ id: 's1', path: '$.displayName', label: 'Display Name', widget: 'text' }],
    diagnostics: [],
  },
}))

// Registry-ops rows (fixture ids mirror the lane fixtures; the state strings
// here are MOCKED SERVER DATA — the product predicate never names them).
const EQP_ACTIVE_ROW = {
  recordId: 'EQP-QUANTSTUDIO5',
  schemaId: SCHEMA_ID('equipment'),
  payload: {
    kind: 'equipment',
    id: 'EQP-QUANTSTUDIO5',
    displayName: 'EQP-QUANTSTUDIO5',
    lifecycleId: 'registry-ops',
    state: 'active',
    // Measured: the EQP payload carries BOTH state and status.
    status: 'active',
  },
}
const EQC_ARCHIVED_ROW = {
  recordId: 'EQC-QUANTSTUDIO5',
  schemaId: SCHEMA_ID('equipment-class'),
  payload: {
    kind: 'equipment-class',
    id: 'EQC-QUANTSTUDIO5',
    displayName: 'EQC-QUANTSTUDIO5',
    lifecycleId: 'registry-ops',
    state: 'archived',
    // Bait-2 discriminating probe: status says 'active' while the lifecycle
    // state is terminal. A status-reading filter would keep this row visible.
    status: 'active',
  },
}
const PERSON_PLAIN_ROW = {
  recordId: 'PER-PLAIN-1',
  schemaId: SCHEMA_ID('person'),
  payload: {
    kind: 'person',
    id: 'PER-PLAIN-1',
    name: 'PER-PLAIN-1',
    // No lifecycleId: ungoverned rows are NEVER hidden by the browsing filter.
  },
}

const ARCHIVE_TRANSITION = {
  event: 'ARCHIVE',
  targetState: 'archived',
  label: 'Archive',
  role: 'approver',
  allowed: true,
  // Measured registry-ops payload carries NO `requires` key — omitted entirely.
}

const fetchSpy = vi.hoisted(() => vi.fn())

vi.mock('../shared/api/client', async (importOriginal) => {
  // Keep the REAL isSignatureRejection / ApiError predicates (the page mounts
  // DocumentControlBar, whose catch path uses them); replace only the client.
  const actual = await importOriginal<typeof import('../shared/api/client')>()
  return {
    ...actual,
    apiClient: {
      listRecordsByKind: mocked.listRecordsByKind,
    searchRecordsByKind: vi.fn().mockResolvedValue({ records: [] }),
    updateRecord: mocked.updateRecord,
    createRecord: vi.fn().mockResolvedValue(undefined),
    getRecordEditorProjection: vi.fn().mockResolvedValue(mocked.projection),
    getEditorDraftProjection: vi.fn().mockResolvedValue(mocked.projection),
    getValidTransitions: mocked.getValidTransitions,
    // QMS7-6 OQ-1(A): the lifecycle-scoped terminal-facts accessor. The mock
    // models the server's read-only echo of the YAML terminal declarations.
    getLifecycleTerminalStates: mocked.getLifecycleTerminalStates,
    getRecord: mocked.getRecord,
    createDraftCopy: mocked.createDraftCopy,
    createSignature: vi.fn(),
    listRecordRevisions: vi.fn().mockResolvedValue({ records: [] }),
    getSchemas: vi.fn().mockResolvedValue(
      mocked.REGISTRY_KINDS.map((kind: string) => ({
        id: `https://computable-lab.com/schema/computable-lab/${kind}.schema.yaml`,
        path: `lab/${kind}.schema.yaml`,
        title: kind,
      })),
    ),
    },
  }
})

vi.mock('../components/registry/RecordSearchCombobox', () => ({
  RecordSearchCombobox: () => <div data-testid="record-search-combobox" />,
}))

vi.mock('../components/registry/RelatedRecordsCard', () => ({
  RelatedRecordsCard: ({ recordId }: { recordId: string }) => (
    <div data-testid="related-records-card" data-record-id={recordId} />
  ),
}))

vi.mock('../editor/taptab/TapTabEditor', () => ({
  // Same harness as RecordRegistryPage.createTab.test.tsx: captures the props
  // the page feeds the editor — including `disabled` (the OQ-2(A) read-only
  // wiring) — and exposes getEditor() through the forwarded ref.
  ProjectionTapTabEditor: React.forwardRef(
    (
      props: {
        data: Record<string, unknown>
        disabled?: boolean
        onUpdate?: (payload: Record<string, unknown>, dirty: boolean) => void
      },
      ref: React.Ref<{ getEditor: () => { getJSON: () => unknown } | null }>,
    ) => {
      mocked.editorDataProp = props.data
      mocked.editorDisabled = props.disabled ?? false
      React.useImperativeHandle(ref, () => ({
        getEditor: () => ({ getJSON: () => ({ type: 'doc', content: [] }) }),
      }))
      return <div data-testid="projection-taptab-editor" />
    },
  ),
}))

function listRecordsByKindFixture() {
  mocked.listRecordsByKind.mockImplementation(async (kind: string) => {
    if (kind === 'equipment') return { records: [EQP_ACTIVE_ROW], total: 1 }
    if (kind === 'equipment-class') return { records: [EQC_ARCHIVED_ROW], total: 1 }
    if (kind === 'person') return { records: [PERSON_PLAIN_ROW], total: 1 }
    // SignOffReceipt / other internal lookups: nothing.
    return { records: [], total: 0 }
  })
}

async function openEquipmentTab() {
  fireEvent.click(screen.getByText('Equipment'))
  await screen.findByText('EQP-QUANTSTUDIO5')
}

function toggleShowArchived() {
  const checkbox = screen.getByTestId('registry-show-archived') as HTMLInputElement
  fireEvent.click(checkbox)
  return checkbox
}

function deleteButtons() {
  return screen
    .queryAllByRole('button')
    .filter((b) => /delete/i.test(b.textContent ?? ''))
}

function expectNoDeleteFetches() {
  const deleteCalls = fetchSpy.mock.calls.filter(
    (call) => (call[1] as RequestInit | undefined)?.method === 'DELETE',
  )
  expect(deleteCalls.length).toBe(0)
}

describe('RecordRegistryPage — archived browsing (QMS7-6)', () => {
  beforeEach(() => {
    mocked.listRecordsByKind.mockReset()
    mocked.getValidTransitions.mockReset()
    mocked.updateRecord.mockReset()
    mocked.getLifecycleTerminalStates.mockReset()
    mocked.getRecord.mockReset()
    mocked.createDraftCopy.mockReset()
    mocked.editorDataProp = null
    mocked.editorDisabled = null
    listRecordsByKindFixture()
    // Default lifecycle facts: registry-ops declares its terminal state (the
    // server's read-only echo of the YAML). The fail-open test overrides this.
    mocked.getLifecycleTerminalStates.mockImplementation(async (lifecycleId: string) =>
      lifecycleId === 'registry-ops' ? ['archived'] : [],
    )
    mocked.getValidTransitions.mockResolvedValue({ transitions: [] })
    mocked.updateRecord.mockResolvedValue({
      record: {},
      validation: { valid: true, errors: [] },
      lint: { valid: true, violations: [] },
    })
    mocked.getRecord.mockImplementation(async (recordId: string) => ({
      recordId,
      schemaId: SCHEMA_ID('equipment-class'),
      payload: EQC_ARCHIVED_ROW.payload,
    }))
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  // THE RED TEST (AC-5). RED at base: no 'registry-show-archived' toggle
  // exists AND the archived row renders in the default list.
  it('terminal rows are hidden from the default list; active and ungoverned rows remain (AC-5)', async () => {
    render(<RecordRegistryPage />)
    await openEquipmentTab()

    // The toggle exists and defaults OFF. RED at base: getByTestId throws —
    // no archived-browsing affordance exists on the page.
    const checkbox = screen.getByTestId('registry-show-archived') as HTMLInputElement
    expect(checkbox.checked).toBe(false)

    await screen.findByText('EQP-QUANTSTUDIO5')
    // Hidden by default once the lifecycle facts resolve (data-driven:
    // terminalStates('registry-ops') contains the row's payload.state).
    await waitFor(() => {
      expect(screen.queryByText('EQC-QUANTSTUDIO5')).toBeNull()
    })
    // Active row and ungoverned (no-lifecycleId) rows are never hidden.
    expect(screen.getByText('EQP-QUANTSTUDIO5')).toBeTruthy()
  })

  // RED at base: no toggle to click.
  it('toggling "Show archived" reveals the terminal row WITHOUT refetching the list (AC-5, bait 6)', async () => {
    render(<RecordRegistryPage />)
    await openEquipmentTab()
    await waitFor(() => {
      expect(screen.queryByText('EQC-QUANTSTUDIO5')).toBeNull()
    })
    const callsBefore = mocked.listRecordsByKind.mock.calls.length

    const checkbox = toggleShowArchived()
    expect(checkbox.checked).toBe(true)

    await screen.findByText('EQC-QUANTSTUDIO5')
    // Bait 6: the toggle is render-level state over whatever `records` holds —
    // it must NOT fire a new list refresh (the seq-token stays untouched).
    expect(mocked.listRecordsByKind.mock.calls.length).toBe(callsBefore)

    // Toggle back OFF -> hidden again.
    toggleShowArchived()
    await waitFor(() => {
      expect(screen.queryByText('EQC-QUANTSTUDIO5')).toBeNull()
    })
    expect(mocked.listRecordsByKind.mock.calls.length).toBe(callsBefore)
  })

  // Bait 2 (state vs status). RED at base (row visible, no filter at all).
  it('the filter reads payload.state, never payload.status (bait 2)', async () => {
    // EQC_ARCHIVED_ROW carries status:'active' AND state:'archived'.
    // A status-reading predicate would keep it visible -> this assertion bites.
    render(<RecordRegistryPage />)
    await openEquipmentTab()
    await waitFor(() => {
      expect(screen.queryByText('EQC-QUANTSTUDIO5')).toBeNull()
    })
    expect(screen.getByText('EQP-QUANTSTUDIO5')).toBeTruthy()
  })

  // Pin (lands green at base — rows are visible at base too): hiding happens
  // ONLY when the lifecycle facts say terminal. A lifecycle whose facts are
  // unavailable/empty fails OPEN: rows stay visible, no invented policy.
  it('rows whose lifecycle reports no terminal states stay visible (fail-open, data-driven)', async () => {
    // Model a lifecycle that declares NO terminal states (facts endpoint says []).
    mocked.getLifecycleTerminalStates.mockResolvedValue([])
    render(<RecordRegistryPage />)
    await openEquipmentTab()
    await screen.findByText('EQP-QUANTSTUDIO5')
    expect(screen.getByText('EQC-QUANTSTUDIO5')).toBeTruthy()
  })

  // OQ-2(A)/OQ-3 + AC-6. RED at base: the archived row offers in-place Save
  // and the editor is not disabled.
  it('archived record opens read-only: no Save, draft-copy offered, editor disabled, related card mounts (AC-6, OQ-2A/OQ-3)', async () => {
    render(<RecordRegistryPage />)
    await openEquipmentTab()
    // Prove the terminal facts resolved (row hidden by the data-driven rule)
    // BEFORE toggling — the read-only wiring depends on the same facts map.
    await waitFor(() => {
      expect(screen.queryByText('EQC-QUANTSTUDIO5')).toBeNull()
    })
    toggleShowArchived()
    const row = await screen.findByText('EQC-QUANTSTUDIO5')
    fireEvent.click(row)

    await screen.findByTestId('projection-taptab-editor')
    // No in-place Save affordance for a terminal record...
    expect(screen.queryByRole('button', { name: /^save/i })).toBeNull()
    // ...instead the DECLARED draft-copy machinery (OQ-3: kept — it mints a
    // NEW record id, never an unarchive).
    expect(screen.getByRole('button', { name: /create draft revision/i })).toBeTruthy()
    // Editor content disabled (read-only).
    await waitFor(() => {
      expect(mocked.editorDisabled).toBe(true)
    })
    // References pin (AC-6): RelatedRecordsCard still mounts for the archived
    // record with its recordId (forward refs resolve server-side; gate lap 6).
    const card = screen.getByTestId('related-records-card')
    expect(card.getAttribute('data-record-id')).toBe('EQC-QUANTSTUDIO5')
  })

  // AC-8 sweep. RED at base for the toggle-ON phase (no toggle).
  it('no delete affordance anywhere: default view, toggle ON, and archived record open; zero DELETE fetches (AC-8)', async () => {
    render(<RecordRegistryPage />)
    await openEquipmentTab()

    expect(deleteButtons()).toHaveLength(0)
    expectNoDeleteFetches()

    toggleShowArchived()
    await screen.findByText('EQC-QUANTSTUDIO5')
    expect(deleteButtons()).toHaveLength(0)

    fireEvent.click(screen.getByText('EQC-QUANTSTUDIO5'))
    await screen.findByTestId('projection-taptab-editor')
    expect(deleteButtons()).toHaveLength(0)
    expectNoDeleteFetches()
  })

  // Pin (AC-4 / bait 7): a rejected Archive PUT must NOT optimistically flip
  // the displayed state. The DocumentControlBar machinery exists at base, so
  // this lands pin-green — it pins the page-mounted behavior.
  it('rejected Archive leaves displayed state consistent: chip stays Active, error renders, transitions refetch (AC-4, bait 7)', async () => {
    mocked.getValidTransitions.mockResolvedValue({ transitions: [ARCHIVE_TRANSITION] })
    mocked.updateRecord.mockRejectedValueOnce(
      Object.assign(
        new Error('LIFECYCLE_TRANSITION_DENIED: You do not have the required role for this transition.'),
        { status: 422, code: 'HTTP_422' },
      ),
    )
    render(<RecordRegistryPage />)
    await openEquipmentTab()

    // The bar mounts for the SELECTED record (page-mounted DocumentControlBar).
    fireEvent.click(screen.getByText('EQP-QUANTSTUDIO5'))

    const archiveButton = await screen.findByRole('button', { name: 'Archive' })
    fireEvent.click(archiveButton)

    const err = await screen.findByTestId('transition-error')
    expect(err.textContent).toMatch(/did not change/)
    // Displayed state stays what the server has: active (the chip renders
    // currentState lowercased). NO optimistic "archived" before/without a
    // resolved PUT.
    expect(screen.getByText('active')).toBeTruthy()
    expect(screen.queryByText('archived')).toBeNull()
    // The bar refetches transitions after the failure (server's actual state).
    await waitFor(() => {
      expect(mocked.getValidTransitions.mock.calls.length).toBeGreaterThanOrEqual(2)
    })
    expectNoDeleteFetches()
  })

  // QMS7-6 FIX1 (adversarial review DEFECT 1, MAJOR): the in-flight race.
  // A `records` identity change while the terminalStates GET is in flight
  // (effect cleanup fires — e.g. a tab switch triggers refreshRecords) must
  // NOT consume the lifecycle: a discarded result may not leave the lifecycle
  // flagged fetched, or the terminal filter is permanently disabled for the
  // rest of the page session and AC-5 silently degrades to "no filtering".
  // RED at 95f52fd1: the lifecycle was added to terminalFetchedRef BEFORE
  // the await and the cancelled run drops the entries -> never refetched,
  // the archived row never hides.
  it('a records change while the terminalStates fetch is in flight does not permanently suppress the facts (FIX1 defect 1)', async () => {
    let resolveFirst: ((states: string[]) => void) | undefined
    mocked.getLifecycleTerminalStates.mockImplementationOnce(
      () => new Promise<string[]>((resolve) => { resolveFirst = resolve }),
    )

    render(<RecordRegistryPage />)
    await openEquipmentTab()
    // The registry-ops facts GET is now in flight (deferred above).
    await waitFor(() => expect(mocked.getLifecycleTerminalStates).toHaveBeenCalledTimes(1))

    // Interleave a `records` identity change while it is in flight:
    // Equipment -> People -> Equipment (each refresh replaces the records array).
    fireEvent.click(screen.getByText('People'))
    await screen.findByText('PER-PLAIN-1')
    fireEvent.click(screen.getByText('Equipment'))
    await screen.findByText('EQP-QUANTSTUDIO5')

    // Let the superseded GET resolve — its result must NOT be consumed.
    resolveFirst!(['archived'])

    // The lifecycle must be refetched (the superseded run did not consume it)
    // and the facts must take effect: the archived row hides (AC-5).
    await waitFor(() =>
      expect(mocked.getLifecycleTerminalStates.mock.calls.length).toBeGreaterThanOrEqual(2),
    )
    await waitFor(() => expect(screen.queryByText('EQC-QUANTSTUDIO5')).toBeNull())
    expect(screen.getByText('EQP-QUANTSTUDIO5')).toBeTruthy()
  })

  // QMS7-6 FIX1 (adversarial review DEFECT 2, MINOR): a transient failure
  // (network blip / 5xx — apiClient.getLifecycleTerminalStates already
  // normalises 404 to [] and never throws for a missing lifecycle, so any
  // error reaching the page catch is transient/server-failure) must fail open
  // for the current render but must NOT be cached as fetched: a later
  // records change retries the lifecycle.
  // RED at 95f52fd1: the catch maps ANY error to [] while the lifecycle was
  // already marked fetched before the await -> permanent non-retry.
  it('a transient terminalStates failure fails open for the render but retries on the next records change (FIX1 defect 2)', async () => {
    mocked.getLifecycleTerminalStates.mockImplementationOnce(() =>
      Promise.reject(Object.assign(new Error('simulated transient blip'), { status: 503 })),
    )

    render(<RecordRegistryPage />)
    await openEquipmentTab()
    await waitFor(() => expect(mocked.getLifecycleTerminalStates).toHaveBeenCalledTimes(1))
    // Let the rejection settle through the page's catch.
    await new Promise((resolve) => setTimeout(resolve, 0))
    // Fail open: nothing is hidden on a guess — the archived row stays visible.
    expect(screen.getByText('EQC-QUANTSTUDIO5')).toBeTruthy()

    // A later records change must RETRY the transiently-failed lifecycle.
    fireEvent.click(screen.getByText('People'))
    await screen.findByText('PER-PLAIN-1')
    fireEvent.click(screen.getByText('Equipment'))
    await screen.findByText('EQP-QUANTSTUDIO5')

    await waitFor(() =>
      expect(mocked.getLifecycleTerminalStates.mock.calls.length).toBeGreaterThanOrEqual(2),
    )
    await waitFor(() => expect(screen.queryByText('EQC-QUANTSTUDIO5')).toBeNull())
  })
})
