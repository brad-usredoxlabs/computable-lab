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
  vi.mocked(apiClient.listAnalysisRevisions).mockResolvedValue({ revisions: [DECLARING_REV, LEGACY_REV], total: 2 })
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

    // The STAGED FROZEN IDENTITY renders before submit (artifact + DREF +
    // producer run + contentSha + contentHash).
    await waitFor(() => expect(screen.queryByTestId('analysis-declared-input-staged-right_table')).not.toBeNull(), { timeout: 4000 })
    const stagedText = screen.getByTestId('analysis-declared-input-staged-right_table').textContent ?? ''
    expect(stagedText).toContain('AOUT-TEST-9')
    expect(stagedText).toContain('DREF DREF-TEST-7')
    expect(stagedText).toContain('producer run ANR-TEST-PROD')
    expect(stagedText).toContain('contentHash deadbeef')

    // Bind the DREF into left_table too (the gate then clears).
    fireEvent.change(screen.getByTestId('analysis-declared-input-id-left_table'), { target: { value: 'DREF-TEST-7' } })
    fireEvent.click(screen.getByTestId('analysis-declared-input-bind-left_table'))
    await waitFor(() => expect(screen.queryByTestId('analysis-declared-input-staged-left_table')).not.toBeNull(), { timeout: 4000 })
    await waitFor(() => expect(screen.queryByTestId('analysis-inputs-blocked')).toBeNull(), { timeout: 4000 })
    expect((screen.getByTestId('analysis-run-create-btn') as HTMLButtonElement).disabled).toBe(false)

    // Submit: the body CONTAINS the bound refs (the exact wire shape).
    fireEvent.click(screen.getByTestId('analysis-run-create-btn'))
    await waitFor(() => expect(apiClient.createAnalysisRun).toHaveBeenCalledTimes(1), { timeout: 4000 })
    const body = vi.mocked(apiClient.createAnalysisRun).mock.calls[0][0] as { inputs: Record<string, { kind: string; id: string; type: string }> }
    expect(body.inputs).toEqual({
      left_table: { kind: 'record', id: 'DREF-TEST-7', type: 'data-reference' },
      right_table: { kind: 'record', id: 'AOUT-TEST-9', type: 'analysis-output-artifact' },
    })
    expect(body.inputs.right_table.id).toBe('AOUT-TEST-9')
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
    const stagedText = screen.getByTestId('analysis-declared-input-staged-right_table').textContent ?? ''
    expect(stagedText).toContain('AOUT-TEST-9')
    expect(stagedText).toContain('DREF DREF-TEST-7')
    const outcome = (await waitFor(() => screen.getByTestId('analysis-staged-promote-result'))) as HTMLElement
    expect(outcome.textContent).toContain("slot 'right_table'")
    expect(vi.mocked(apiClient.promoteAnalysisArtifact)).toHaveBeenCalledTimes(1)
    expect(apiClient.createAnalysisRun).not.toHaveBeenCalled()
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
