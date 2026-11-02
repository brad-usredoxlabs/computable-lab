/**
 * FAME-7 (W5) — the Run-method card's declared-input controls + the createRun
 * body that carries them + the "Use result downstream" routing.
 *
 * Component-level: the apiClient is mocked (no server), per the lane rule
 * (TEST-scoped ids, generic names — never lane record ids / domain literals).
 *
 * D1: the card renders ONE row per DECLARED input (zero declarations ⇒ zero
 *     rows — no dead chrome) with the declared name, required marker, and
 *     accepted names; a required unbound slot BLOCKS the Create button with a
 *     named visible line.
 * D2: Bind… stages the typed ref and the row renders the FROZEN IDENTITY
 *     (artifact id, DREF id, producer run + contentSha, DREF contentHash)
 *     BEFORE submit; the createRun body CONTAINS the bound ref (the exact
 *     wire shape {kind:'record', id, type} — never a hardcoded inputs: {}).
 * D3: "Use result downstream" promotes (idempotent door) and ROUTES to the
 *     same staging path — declared-data matching stages the artifact into the
 *     accepting slot; a 0-match artifact names that nothing was staged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'
import { apiClient } from '../shared/api/client'
import { AnalysisPage } from './AnalysisPage'

vi.mock('../shared/api/client', () => ({
  apiClient: {
    listAnalysisRevisions: vi.fn(),
    listAnalysisRuns: vi.fn(),
    createAnalysisRevision: vi.fn(),
    createAnalysisRun: vi.fn(),
    executeAnalysisRun: vi.fn(),
    getAnalysisRun: vi.fn(),
    getSurfaces: vi.fn().mockResolvedValue({ surfaces: [] }),
    draftAnalysisRevision: vi.fn(),
    promoteAnalysisArtifact: vi.fn(),
    getRecord: vi.fn(),
  },
}))

function wrap(ui: React.ReactNode, initialPath = '/analysis') {
  return (
    <ThemeProvider>
      <OpenTabsProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          {ui}
        </MemoryRouter>
      </OpenTabsProvider>
    </ThemeProvider>
  )
}

// --- fixtures (generic names; the declared contract is DATA) ----------------

const SCHEMA = {
  type: 'object',
  properties: { label: { type: 'string', default: 'x' } },
}

/** A revision that DECLARES a two-slot input contract (the FAME-7 shape). */
const DECLARING_REV = {
  recordId: 'ANREV-TEST-D-1',
  payload: {
    id: 'ANREV-TEST-D-1',
    title: 'TEST declared-inputs revision',
    parameterSchema: SCHEMA,
    inputs: [
      { name: 'left_table', dataKind: 'table', required: true, acceptsKinds: ['data-reference'] },
      { name: 'right_table', dataKind: 'table', required: true, acceptedArtifactNames: ['right_summary'] },
    ],
  },
}

/** D7: a slot that declares NO acceptsKinds (the Bind… kind options are
 *  server-owned — the page must show no options beyond the placeholder). */
const OPEN_KIND_REV = {
  recordId: 'ANREV-TEST-OK-1',
  payload: {
    id: 'ANREV-TEST-OK-1',
    title: 'TEST open-kind revision',
    inputs: [
      { name: 'open_table', dataKind: 'table', required: true },
    ],
  },
}

/** D9: TWO slots both accept the artifact name (one name-gated, one open) —
 *  the "Use result downstream" stage must render the slot chooser. */
const TWO_MATCH_REV = {
  recordId: 'ANREV-TEST-2M-1',
  payload: {
    id: 'ANREV-TEST-2M-1',
    title: 'TEST two-match revision',
    inputs: [
      { name: 'right_table', dataKind: 'table', required: true, acceptedArtifactNames: ['right_summary'] },
      { name: 'open_table', dataKind: 'table', required: true },
    ],
  },
}

/** A legacy revision with NO inputs declaration (the OQ-3 skip — zero rows). */
const LEGACY_REV = {
  recordId: 'ANREV-TEST-NS-1',
  payload: { id: 'ANREV-TEST-NS-1', title: 'TEST legacy revision' },
}

/** The artifact record the "Use result downstream" routing resolves. */
function aoutRecord(overrides: { name: string; dref?: string }) {
  // client.ts getRecord returns the UNWRAPPED RecordEnvelope (it does
  // `return response.record` itself) — the mock mirrors that.
  return {
    recordId: 'AOUT-TEST-9',
    schemaId: 'https://computable-lab.com/schema/computable-lab/analysis-output-artifact.schema.yaml',
    payload: {
      kind: 'analysis-output-artifact',
      id: 'AOUT-TEST-9',
      name: overrides.name,
      runRef: { kind: 'record', id: 'ANR-TEST-PROD', type: 'analysis-run' },
      dataKind: 'table',
      ...(overrides.dref ? { dataReferenceRef: { kind: 'record', id: overrides.dref, type: 'data-reference' } } : {}),
    },
    meta: { contentSha: 'aaaabbbbccccddddeeeeffff00001111' },
  } as never
}

// Unwrapped RecordEnvelope shape (client.ts getRecord already unwraps).
const DREF_RECORD = {
  recordId: 'DREF-TEST-7',
  schemaId: 'https://computable-lab.com/schema/computable-lab/data-reference.schema.yaml',
  payload: { kind: 'data-reference', id: 'DREF-TEST-7', dataKind: 'table', contentHash: 'deadbeef0000' },
  meta: { contentSha: 'drefsha123' },
} as never

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiClient.listAnalysisRevisions).mockResolvedValue({ revisions: [DECLARING_REV, LEGACY_REV, OPEN_KIND_REV, TWO_MATCH_REV], total: 4 })
  vi.mocked(apiClient.listAnalysisRuns).mockResolvedValue({ runs: [], total: 0 })
  vi.mocked(apiClient.createAnalysisRun).mockResolvedValue({ success: true, recordId: 'ANR-TEST-NEW-1', run: {} })
})

/** A landed (succeeded) run in the run list — the promote pane's
 *  `activeProcessed` gate needs the run PRESENT with status 'succeeded'. */
function landedRunList() {
  return {
    runs: [{ recordId: 'ANR-TEST-LANDED', payload: { id: 'ANR-TEST-LANDED', title: 'TEST landed run', status: 'succeeded' } }],
    total: 1,
  }
}

// --- D1 — declared rows + the named block line ------------------------------

describe('D1 — declared-input rows render per declaration; unbound required blocks Create with a named line', () => {
  it('renders one row per declared input (name + required marker + accepted names) and blocks Create until bound', async () => {
    render(wrap(<AnalysisPage />))
    await waitFor(() => expect(screen.queryByTestId('analysis-run-rev')).not.toBeNull(), { timeout: 4000 })
    fireEvent.change(screen.getByTestId('analysis-run-rev'), { target: { value: 'ANREV-TEST-D-1' } })
    await waitFor(() => expect(screen.queryByTestId('analysis-declared-inputs')).not.toBeNull(), { timeout: 4000 })
    expect(screen.queryByTestId('analysis-declared-input-left_table')).not.toBeNull()
    expect(screen.queryByTestId('analysis-declared-input-right_table')).not.toBeNull()
    // The declared name + required marker + the slot's accepted names (DATA).
    expect(screen.getByText('left_table *')).toBeDefined()
    expect(screen.getByText('right_table *')).toBeDefined()
    expect(screen.getByText(/accepts: right_summary/)).toBeDefined()
    // A required unbound slot fires the NAMED block line(s) + the disabled
    // button (both declared slots are required — two named lines, one each).
    await waitFor(() => {
      const lines = screen.queryAllByTestId('analysis-inputs-blocked-reason')
      expect(lines.length).toBeGreaterThanOrEqual(1)
      expect(lines.map((el) => el.textContent)).toContain("required input 'left_table' is not bound")
      expect(lines.map((el) => el.textContent)).toContain("required input 'right_table' is not bound")
    }, { timeout: 4000 })
    expect((screen.getByTestId('analysis-run-create-btn') as HTMLButtonElement).disabled).toBe(true)
  })

  it('renders ZERO declared-input rows for a legacy revision with no inputs declaration (no dead chrome)', async () => {
    render(wrap(<AnalysisPage />))
    await waitFor(() => expect(screen.queryByTestId('analysis-run-rev')).not.toBeNull(), { timeout: 4000 })
    fireEvent.change(screen.getByTestId('analysis-run-rev'), { target: { value: 'ANREV-TEST-NS-1' } })
    await waitFor(() => expect(screen.queryByTestId('analysis-declared-inputs')).toBeNull(), { timeout: 4000 })
    // The gate line is gone too — a legacy revision is fully inputless.
    expect(screen.queryByTestId('analysis-inputs-blocked')).toBeNull()
    expect((screen.getByTestId('analysis-run-create-btn') as HTMLButtonElement).disabled).toBe(false)
  })
})

// --- D2 — Bind… stages the frozen identity; the body CONTAINS the bound ref --

describe('D2 — Bind… stages the FROZEN IDENTITY before submit; the createRun body carries the bound ref', () => {
  it('stages the typed artifact ref (frozen identity rendered) and the create body contains the exact wire ref', async () => {
    vi.mocked(apiClient.getRecord).mockImplementation(async (id: string) => {
      if (id === 'AOUT-TEST-9') return aoutRecord({ name: 'right_summary', dref: 'DREF-TEST-7' })
      return DREF_RECORD
    })
    render(wrap(<AnalysisPage />))
    await waitFor(() => expect(screen.queryByTestId('analysis-run-rev')).not.toBeNull(), { timeout: 4000 })
    fireEvent.change(screen.getByTestId('analysis-run-rev'), { target: { value: 'ANREV-TEST-D-1' } })
    await waitFor(() => expect(screen.queryByTestId('analysis-declared-input-right_table')).not.toBeNull(), { timeout: 4000 })

    // Bind the artifact into right_table (type: analysis-output-artifact).
    fireEvent.change(screen.getByTestId('analysis-declared-input-id-right_table'), { target: { value: 'AOUT-TEST-9' } })
    fireEvent.change(screen.getByTestId('analysis-declared-input-type-right_table'), { target: { value: 'analysis-output-artifact' } })
    fireEvent.click(screen.getByTestId('analysis-declared-input-bind-right_table'))

    // The STAGED FROZEN IDENTITY renders before submit (manual Bind keeps the
    // TYPED artifact ref in the body — the DREF id, producer run and
    // contentHash stay visible in the identity line).
    await waitFor(() => expect(screen.queryByTestId('analysis-declared-input-staged-right_table')).not.toBeNull(), { timeout: 4000 })
    const stagedText = screen.getByTestId('analysis-declared-input-staged-right_table').textContent ?? ''
    expect(stagedText).toContain('AOUT-TEST-9 (analysis-output-artifact)')
    expect(stagedText).toContain('DREF DREF-TEST-7')
    expect(stagedText).toContain('producer run ANR-TEST-PROD')
    expect(stagedText).toContain('contentHash deadbeef')

    // Bind the DREF into left_table too (the gate then clears).
    fireEvent.change(screen.getByTestId('analysis-declared-input-id-left_table'), { target: { value: 'DREF-TEST-7' } })
    fireEvent.click(screen.getByTestId('analysis-declared-input-bind-left_table'))
    await waitFor(() => expect(screen.queryByTestId('analysis-declared-input-staged-left_table')).not.toBeNull(), { timeout: 4000 })
    await waitFor(() => expect(screen.queryByTestId('analysis-inputs-blocked')).toBeNull(), { timeout: 4000 })
    expect((screen.getByTestId('analysis-run-create-btn') as HTMLButtonElement).disabled).toBe(false)

    // Submit: the body CONTAINS the bound refs (the exact wire shape). The
    // manual bind stages the TYPED ref — right_table binds the artifact id;
    // the DREF-for-that-slot pin lives on the "Use result downstream" path
    // (D1 fix cycle 1, below).
    fireEvent.click(screen.getByTestId('analysis-run-create-btn'))
    await waitFor(() => expect(apiClient.createAnalysisRun).toHaveBeenCalledTimes(1), { timeout: 4000 })
    const body = vi.mocked(apiClient.createAnalysisRun).mock.calls[0][0] as { inputs: Record<string, { kind: string; id: string; type: string }> }
    expect(body.inputs).toEqual({
      left_table: { kind: 'record', id: 'DREF-TEST-7', type: 'data-reference' },
      right_table: { kind: 'record', id: 'AOUT-TEST-9', type: 'analysis-output-artifact' },
    })
  })

  it('blocks the button (named line) when a staged ref type violates the slot acceptsKinds', async () => {
    vi.mocked(apiClient.getRecord).mockImplementation(async (id: string) => (id === 'AOUT-TEST-9' ? aoutRecord({ name: 'right_summary' }) : DREF_RECORD))
    render(wrap(<AnalysisPage />))
    await waitFor(() => expect(screen.queryByTestId('analysis-run-rev')).not.toBeNull(), { timeout: 4000 })
    fireEvent.change(screen.getByTestId('analysis-run-rev'), { target: { value: 'ANREV-TEST-D-1' } })
    await waitFor(() => expect(screen.queryByTestId('analysis-declared-input-left_table')).not.toBeNull(), { timeout: 4000 })
    // left_table admits ONLY data-reference — stage an artifact ref there.
    fireEvent.change(screen.getByTestId('analysis-declared-input-id-left_table'), { target: { value: 'AOUT-TEST-9' } })
    fireEvent.change(screen.getByTestId('analysis-declared-input-type-left_table'), { target: { value: 'analysis-output-artifact' } })
    fireEvent.click(screen.getByTestId('analysis-declared-input-bind-left_table'))
    await waitFor(() => expect(screen.queryByTestId('analysis-declared-input-staged-left_table')).not.toBeNull(), { timeout: 4000 })
    // The named kind-mismatch line fires and the button stays blocked.
    await waitFor(() => {
      const lines = screen.queryAllByTestId('analysis-inputs-blocked-reason').map((el) => el.textContent)
      expect(lines.some((t) => t?.includes('accepts kinds data-reference'))).toBe(true)
    }, { timeout: 4000 })
    expect((screen.getByTestId('analysis-run-create-btn') as HTMLButtonElement).disabled).toBe(true)
  })

  it('refuses (named line, nothing staged) when a data-reference bind resolves to a NON-data-reference record kind', async () => {
    // FAME-8 GATEFIX1 (A8/D2): bind-time kind gate — a record whose own
    // declared `kind` (a record fact from getRecord, NOT an id-pattern
    // heuristic) is not 'data-reference' must show a named refusal and NOT
    // stage: never a silent "(data-reference)" substitution that fails only
    // at submit. TEST-scoped id (generic, per this file's fixture rule).
    vi.mocked(apiClient.getRecord).mockResolvedValue({
      recordId: 'ACQP-TEST-3',
      schemaId: 'https://computable-lab.com/schema/computable-lab/acquisition-package.schema.yaml',
      payload: { kind: 'acquisition-package', id: 'ACQP-TEST-3', title: 'TEST package record' },
    } as never)
    render(wrap(<AnalysisPage />))
    await waitFor(() => expect(screen.queryByTestId('analysis-run-rev')).not.toBeNull(), { timeout: 4000 })
    fireEvent.change(screen.getByTestId('analysis-run-rev'), { target: { value: 'ANREV-TEST-D-1' } })
    await waitFor(() => expect(screen.queryByTestId('analysis-declared-input-left_table')).not.toBeNull(), { timeout: 4000 })

    // left_table admits ONLY data-reference; the type select defaults to it.
    // Type the PACKAGE id (declared kind: acquisition-package) and Bind.
    fireEvent.change(screen.getByTestId('analysis-declared-input-id-left_table'), { target: { value: 'ACQP-TEST-3' } })
    fireEvent.click(screen.getByTestId('analysis-declared-input-bind-left_table'))

    // The named refusal is visible (names the record + its real declared kind).
    await waitFor(() => {
      const err = screen.queryByTestId('analysis-error')
      expect(err?.textContent).toContain('ACQP-TEST-3')
      expect(err?.textContent).toContain('acquisition-package')
    }, { timeout: 4000 })
    // Nothing was staged — the row stays unbound (never a silent substitution).
    await waitFor(() => expect(screen.queryByTestId('analysis-declared-input-staged-left_table')).toBeNull(), { timeout: 4000 })
    expect(screen.getByTestId('analysis-declared-input-unbound-left_table')).toBeDefined()
  })
})

// --- D3 — "Use result downstream" routes to the same staging path -----------

describe('D3 — "Use result downstream" promotes and stages into the accepting declared slot (declared-data matching)', () => {
  it('routes the promoted artifact into the slot whose acceptedArtifactNames accept it; the outcome line names the staged slot', async () => {
    vi.mocked(apiClient.getAnalysisRun).mockResolvedValue({
      record: {
        recordId: 'ANR-TEST-LANDED',
        payload: {
          id: 'ANR-TEST-LANDED',
          title: 'TEST landed run',
          status: 'succeeded',
          revisionRef: { id: 'ANREV-TEST-D-1' },
          inputs: {},
          outputManifest: {
            artifacts: [{ name: 'right_summary', dataKind: 'table', value: { columns: [], rows: [] } }],
            views: [],
            metrics: [],
            artifactRefs: { right_summary: { artifactRecordId: 'AOUT-TEST-9' } },
          },
        },
      },
    } as never)
    vi.mocked(apiClient.promoteAnalysisArtifact).mockResolvedValue({ success: true, artifactId: 'AOUT-TEST-9', dataReferenceId: 'DREF-TEST-7', created: true })
    vi.mocked(apiClient.listAnalysisRuns).mockResolvedValue(landedRunList())
    vi.mocked(apiClient.getRecord).mockImplementation(async (id: string) => {
      if (id === 'AOUT-TEST-9') return aoutRecord({ name: 'right_summary', dref: 'DREF-TEST-7' })
      return DREF_RECORD
    })
    render(wrap(<AnalysisPage />, '/analysis?run=ANR-TEST-LANDED'))
    // Select the declaring revision so the declared slots are visible.
    await waitFor(() => expect(screen.queryByTestId('analysis-run-rev')).not.toBeNull(), { timeout: 4000 })
    fireEvent.change(screen.getByTestId('analysis-run-rev'), { target: { value: 'ANREV-TEST-D-1' } })
    // The promote pane lists the artifact (artifactRefs seeded from the landing).
    await waitFor(() => expect(screen.queryByTestId('analysis-promote-right_summary')).not.toBeNull(), { timeout: 4000 })
    fireEvent.click(screen.getByTestId('analysis-promote-right_summary'))

    // The SAME path: the artifact is staged into the accepting slot and the
    // frozen identity renders on the card (no auto-submit — the user presses
    // Create run).
    await waitFor(() => expect(screen.queryByTestId('analysis-declared-input-staged-right_table')).not.toBeNull(), { timeout: 4000 })
    // D1 fix cycle 1: the staged ref IS the DREF (the run body will contain
    // it); the artifact id stays in the FROZEN-IDENTITY display.
    const stagedText = screen.getByTestId('analysis-declared-input-staged-right_table').textContent ?? ''
    expect(stagedText).toContain('DREF-TEST-7 (data-reference)')
    expect(stagedText).toContain('artifact AOUT-TEST-9')
    expect(stagedText).toContain('producer run ANR-TEST-PROD')
    expect(stagedText).toContain('contentHash deadbeef')
    const outcome = (await waitFor(() => screen.getByTestId('analysis-staged-promote-result'))) as HTMLElement
    expect(outcome.textContent).toContain("slot 'right_table'")
    expect(outcome.textContent).toContain('DREF-TEST-7')
    expect(vi.mocked(apiClient.promoteAnalysisArtifact)).toHaveBeenCalledTimes(1)
    // Bind the other required slot (left_table, admits data-reference) with
    // the same DREF so the pre-submit gate clears — then the Create body must
    // pin the DREF for the routed slot.
    fireEvent.change(screen.getByTestId('analysis-declared-input-id-left_table'), { target: { value: 'DREF-TEST-7' } })
    fireEvent.click(screen.getByTestId('analysis-declared-input-bind-left_table'))
    await waitFor(() => expect(screen.queryByTestId('analysis-declared-input-staged-left_table')).not.toBeNull(), { timeout: 4000 })
    await waitFor(() => expect(screen.queryByTestId('analysis-inputs-blocked')).toBeNull(), { timeout: 4000 })
    // The staged body (what Create run would send) binds the DREF, not the AOUT id.
    fireEvent.click(screen.getByTestId('analysis-run-create-btn'))
    await waitFor(() => expect(apiClient.createAnalysisRun).toHaveBeenCalledTimes(1), { timeout: 4000 })
    const body = vi.mocked(apiClient.createAnalysisRun).mock.calls[0][0] as { inputs: Record<string, { id: string; type: string }> }
    expect(body.inputs.right_table).toEqual({ kind: 'record', id: 'DREF-TEST-7', type: 'data-reference' })
    expect(body.inputs.left_table).toEqual({ kind: 'record', id: 'DREF-TEST-7', type: 'data-reference' })
    expect(JSON.stringify(body.inputs)).not.toContain('AOUT-TEST-9')
  })

  it('names the 0-match case when no declared slot accepts the artifact (no silent drop)', async () => {
    vi.mocked(apiClient.getAnalysisRun).mockResolvedValue({
      record: {
        recordId: 'ANR-TEST-LANDED',
        payload: {
          id: 'ANR-TEST-LANDED',
          title: 'TEST landed run',
          status: 'succeeded',
          revisionRef: { id: 'ANREV-TEST-D-1' },
          inputs: {},
          outputManifest: {
            artifacts: [{ name: 'unwanted_thing', dataKind: 'table', value: { columns: [], rows: [] } }],
            views: [],
            metrics: [],
            artifactRefs: { unwanted_thing: { artifactRecordId: 'AOUT-TEST-9' } },
          },
        },
      },
    } as never)
    vi.mocked(apiClient.promoteAnalysisArtifact).mockResolvedValue({ success: true, artifactId: 'AOUT-TEST-9', dataReferenceId: 'DREF-TEST-7', created: false })
    vi.mocked(apiClient.listAnalysisRuns).mockResolvedValue(landedRunList())
    vi.mocked(apiClient.getRecord).mockResolvedValue(aoutRecord({ name: 'unwanted_thing', dref: 'DREF-TEST-7' }))
    render(wrap(<AnalysisPage />, '/analysis?run=ANR-TEST-LANDED'))
    await waitFor(() => expect(screen.queryByTestId('analysis-run-rev')).not.toBeNull(), { timeout: 4000 })
    fireEvent.change(screen.getByTestId('analysis-run-rev'), { target: { value: 'ANREV-TEST-D-1' } })
    await waitFor(() => expect(screen.queryByTestId('analysis-promote-unwanted_thing')).not.toBeNull(), { timeout: 4000 })
    fireEvent.click(screen.getByTestId('analysis-promote-unwanted_thing'))
    // 0 declared slots accept 'unwanted_thing' (right_table names
    // 'right_summary') — the NAMED line says nothing was staged.
    await waitFor(() => {
      const outcome = screen.queryByTestId('analysis-staged-promote-result')
      expect(outcome?.textContent).toContain('No declared input slot')
    }, { timeout: 4000 })
    expect(screen.queryByTestId('analysis-declared-input-staged-right_table')).toBeNull()
    expect(apiClient.createAnalysisRun).not.toHaveBeenCalled()
  })
})

// --- D7 — the Bind… kind select is DATA-DERIVED (server-owned policy) --------

describe('D7 — Bind… kind options derive from the slot acceptsKinds (no page literals)', () => {
  it('declares the kinds line per slot and renders no kind options beyond the declared set', async () => {
    render(wrap(<AnalysisPage />))
    await waitFor(() => expect(screen.queryByTestId('analysis-run-rev')).not.toBeNull(), { timeout: 4000 })
    fireEvent.change(screen.getByTestId('analysis-run-rev'), { target: { value: 'ANREV-TEST-D-1' } })
    await waitFor(() => expect(screen.queryByTestId('analysis-declared-input-left_table')).not.toBeNull(), { timeout: 4000 })
    // The declared acceptsKinds line renders per row (OQ-4 #4): left_table
    // declares data-reference; right_table declares nothing.
    expect(screen.getByText(/kinds: data-reference/)).toBeDefined()
    const rightRow = screen.getByTestId('analysis-declared-input-right_table')
    expect(rightRow.textContent ?? '').not.toContain('kinds:')
    // left_table's select offers ONLY the declared kind (a single option —
    // not a hardcoded two-kind list).
    const leftSelect = screen.getByTestId('analysis-declared-input-type-left_table') as HTMLSelectElement
    expect(Array.from(leftSelect.options).map((o) => o.value)).toEqual(['data-reference'])
  })

  it('an undeclared slot offers no kind options (placeholder) and Bind infers the type from the record kind', async () => {
    render(wrap(<AnalysisPage />))
    await waitFor(() => expect(screen.queryByTestId('analysis-run-rev')).not.toBeNull(), { timeout: 4000 })
    fireEvent.change(screen.getByTestId('analysis-run-rev'), { target: { value: 'ANREV-TEST-OK-1' } })
    await waitFor(() => expect(screen.queryByTestId('analysis-declared-input-open_table')).not.toBeNull(), { timeout: 4000 })
    // No acceptsKinds declared ⇒ the select shows only the placeholder
    // option (no server-owned kinds beyond that).
    const select = screen.getByTestId('analysis-declared-input-type-open_table') as HTMLSelectElement
    expect(Array.from(select.options)).toHaveLength(1)
    expect(Array.from(select.options)[0].value).toBe('')
    // Bind with an empty select ⇒ the ref type is INFERRED from the record's
    // own kind (DREF_RECORD declares kind: data-reference).
    vi.mocked(apiClient.getRecord).mockResolvedValue(DREF_RECORD)
    fireEvent.change(screen.getByTestId('analysis-declared-input-id-open_table'), { target: { value: 'DREF-TEST-7' } })
    fireEvent.click(screen.getByTestId('analysis-declared-input-bind-open_table'))
    await waitFor(() => expect(screen.queryByTestId('analysis-declared-input-staged-open_table')).not.toBeNull(), { timeout: 4000 })
    const staged = screen.getByTestId('analysis-declared-input-staged-open_table').textContent ?? ''
    expect(staged).toContain('DREF-TEST-7 (data-reference)')
  })
})

// --- D9 — the ≥2-match slot chooser (one button per matching slot) ----------

describe('D9 — ≥2 matching slots render a per-slot chooser (the user picks)', () => {
  it('renders a button per matching slot; picking one stages into that slot', async () => {
    vi.mocked(apiClient.getAnalysisRun).mockResolvedValue({
      record: {
        recordId: 'ANR-TEST-LANDED',
        payload: {
          id: 'ANR-TEST-LANDED',
          title: 'TEST landed run',
          status: 'succeeded',
          revisionRef: { id: 'ANREV-TEST-2M-1' },
          inputs: {},
          outputManifest: {
            artifacts: [{ name: 'right_summary', dataKind: 'table', value: { columns: [], rows: [] } }],
            views: [],
            metrics: [],
            artifactRefs: { right_summary: { artifactRecordId: 'AOUT-TEST-9' } },
          },
        },
      },
    } as never)
    vi.mocked(apiClient.promoteAnalysisArtifact).mockResolvedValue({ success: true, artifactId: 'AOUT-TEST-9', dataReferenceId: 'DREF-TEST-7', created: true })
    vi.mocked(apiClient.listAnalysisRuns).mockResolvedValue(landedRunList())
    vi.mocked(apiClient.getRecord).mockImplementation(async (id: string) => (id === 'AOUT-TEST-9' ? aoutRecord({ name: 'right_summary', dref: 'DREF-TEST-7' }) : DREF_RECORD))
    render(wrap(<AnalysisPage />, '/analysis?run=ANR-TEST-LANDED'))
    // Select the two-match revision (right_table names right_summary;
    // open_table declares nothing — both accept the artifact).
    await waitFor(() => expect(screen.queryByTestId('analysis-run-rev')).not.toBeNull(), { timeout: 4000 })
    fireEvent.change(screen.getByTestId('analysis-run-rev'), { target: { value: 'ANREV-TEST-2M-1' } })
    await waitFor(() => expect(screen.queryByTestId('analysis-promote-right_summary')).not.toBeNull(), { timeout: 4000 })
    fireEvent.click(screen.getByTestId('analysis-promote-right_summary'))
    // The chooser renders: the outcome line names the match + ONE BUTTON PER
    // MATCHING SLOT (no auto-pick, no hand-typing).
    await waitFor(() => expect(screen.queryByTestId('analysis-staged-chooser')).not.toBeNull(), { timeout: 4000 })
    expect(screen.queryByTestId('analysis-staged-chooser-right_table')).not.toBeNull()
    expect(screen.queryByTestId('analysis-staged-chooser-open_table')).not.toBeNull()
    // Nothing is staged YET — the user must pick.
    expect(screen.queryByTestId('analysis-declared-input-staged-right_table')).toBeNull()
    expect(screen.queryByTestId('analysis-declared-input-staged-open_table')).toBeNull()
    // Picking open_table stages there (open_table admits no kinds ⇒ the
    // DREF ref binds; the body carries the DREF).
    fireEvent.click(screen.getByTestId('analysis-staged-chooser-open_table'))
    await waitFor(() => expect(screen.queryByTestId('analysis-declared-input-staged-open_table')).not.toBeNull(), { timeout: 4000 })
    expect(screen.queryByTestId('analysis-declared-input-staged-right_table')).toBeNull()
    expect(screen.queryByTestId('analysis-staged-chooser')).toBeNull()
  })
})
