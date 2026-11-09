/**
 * GC-12 (deliverable C) — GcRunSheetSection: the USER-TRIGGERED refresh
 * behavior (the continuation leg the committed B section did not cover).
 *
 * Pins: a user action in the chrome (sample add / NAS attach / Analyze
 * append) triggers a fresh probe + entry refetch so the new data shows in
 * the table (the appended entry row / the ACQP ref / the appended
 * analysis-run ref). The refresh is USER-triggered — the MOUNT accounting
 * pin lives in GcRunSheetSection.no-fetch-accounting.test.tsx (D7/bait #5);
 * here the probe count AFTER a user action is exactly MOUNT + 1.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { ThemeProvider } from '../../shared/shell'
import { OpenTabsProvider } from '../../shared/shell/OpenTabsContext'
import { apiClient } from '../../shared/api/client'
import { GcRunSheetSection } from './GcRunSheetSection'
import type { EntryPayload, SequencePayload } from './gcRunSheetModel'

const RUN_ID = 'RUN-gc-rc-1'

const LINKED_SEQUENCE: { recordId: string; payload: SequencePayload } = {
  recordId: 'ISEQ-RC-1',
  payload: {
    kind: 'instrument-sequence',
    id: 'ISEQ-RC-1',
    title: 'RC sheet',
    runRef: { kind: 'record', id: RUN_ID, type: 'run' },
    entryRefs: [{ kind: 'record', id: 'ISEN-RC-1', type: 'instrument-sequence-entry' }],
  },
}

// The entry WITHOUT the package (the attach target).
const ENTRY_BARE: { recordId: string; payload: EntryPayload } = {
  recordId: 'ISEN-RC-1',
  payload: {
    kind: 'instrument-sequence-entry',
    id: 'ISEN-RC-1',
    position: { vial: '101' },
    runRef: { kind: 'record', id: RUN_ID, type: 'run' },
    sampleRef: { kind: 'record', id: 'SMP-RC-1', type: 'sample' },
    gcMethodRef: { kind: 'record', id: 'GCM-DEMO-AOAC-FAME', type: 'gc-method' },
  },
}

// The entry AFTER the server attach PUT: the ACQP ref + the PRIOR run ref.
const ENTRY_ATTACHED: { recordId: string; payload: EntryPayload } = {
  ...ENTRY_BARE,
  payload: {
    ...ENTRY_BARE.payload,
    acquisitionPackageRef: { kind: 'record', id: 'ACQP-RC-77', type: 'acquisition-package' },
    analysisRunRefs: [{ kind: 'record', id: 'ANR-OLD-RC', type: 'analysis-run' }],
  },
}

// The analysis revision the Analyze handoff selects. GC-12 fix-cycle-1 (D3,
// architect ruling OPT-A): the run sheet's Analyze now getRecords the
// selected revision and applies its parameterSchema defaults to the created
// run (the amended V7(f): the created run carries parameters). This fixture
// declares DEFAULTS so the amended receipt is non-trivially pinned.
const REVISION: { recordId: string; payload: { title: string; parameterSchema: Record<string, unknown> } } = {
  recordId: 'ANREV-RC-1',
  payload: {
    title: 'GC FID revision',
    parameterSchema: {
      type: 'object',
      properties: {
        baseline_window_s: { type: 'number', default: 20 },
        peak_width_s: { type: 'number', default: 5 },
      },
    },
  },
}

// The entry AFTER the Analyze append: the ACQP ref + the PRIOR ref + the NEW
// appended ref (bait #8: the history grew, never replaced).
const ENTRY_ANALYZED: { recordId: string; payload: EntryPayload } = {
  ...ENTRY_ATTACHED,
  payload: {
    ...ENTRY_ATTACHED.payload,
    analysisRunRefs: [
      { kind: 'record', id: 'ANR-OLD-RC', type: 'analysis-run' },
      { kind: 'record', id: 'ANR-NEW-RC', type: 'analysis-run' },
    ],
  },
}

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    listRecordsByKind: vi.fn(),
    getRecord: vi.fn(),
    listAnalysisRevisions: vi.fn(),
    getAnalysisRun: vi.fn(),
    registerAcquisitionPackage: vi.fn(),
    getPackageAnalysisInputs: vi.fn(),
    createAnalysisRun: vi.fn(),
    updateRecord: vi.fn(),
    createRecord: vi.fn(),
    executeAnalysisRun: vi.fn(),
    getConfig: vi.fn(),
  },
}))

function NavProbe() {
  const loc = useLocation()
  return <span data-testid="nav-probe">{loc.pathname + loc.search}</span>
}

function wrap(ui: React.ReactNode) {
  return (
    <ThemeProvider>
      <OpenTabsProvider>
        <MemoryRouter>
          <NavProbe />
          {ui}
        </MemoryRouter>
      </OpenTabsProvider>
    </ThemeProvider>
  )
}

// The mock state machine: the entry getRecord returns the STAGE's payload.
// A user action advances the stage (the section's refetch then sees the new
// record shape — exactly what the server-side attach PUT / entry append
// produced).
function setStage(stage: 'bare' | 'attached' | 'analyzed') {
  const stageMap: Record<string, { recordId: string; payload: EntryPayload }> = {
    bare: ENTRY_BARE,
    attached: ENTRY_ATTACHED,
    analyzed: ENTRY_ANALYZED,
  }
  const env = { recordId: 'ISEQ-RC-1', payload: LINKED_SEQUENCE.payload }
  const entryEnv = stageMap[stage]
  vi.mocked(apiClient.getRecord).mockImplementation(async (id: string) => {
    if (id === 'ISEQ-RC-1') return env as never
    if (id === REVISION.recordId) return REVISION as never // the Analyze collectDefaults getRecord
    if (id === entryEnv.recordId) return entryEnv as never
    throw new Error(`404: ${id}`)
  })
  vi.mocked(apiClient.listRecordsByKind).mockImplementation(async (kind: string) => {
    if (kind === 'instrument-sequence') {
      return { records: [env] as unknown as never, total: 1 }
    }
    if (kind === 'gc-method') {
      return {
        records: [
          { recordId: 'GCM-DEMO-AOAC-FAME', payload: { name: 'AOAC FAME GC-FID method (demo)' } },
        ] as unknown as never,
        total: 1,
      }
    }
    return { records: [], total: 0 }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  setStage('bare')
  vi.mocked(apiClient.getConfig).mockResolvedValue({
    storageDevices: [{ id: 'gc-fid-nas', label: 'GC FID NAS (read-only)', kind: 'local-mount' }],
  } as never)
  vi.mocked(apiClient.registerAcquisitionPackage).mockImplementation(async () => {
    // The server attach PUT lands: the next section refetch sees the ACQP
    // ref on the entry.
    setStage('attached')
    return {
      packageRecordId: 'ACQP-RC-77',
      packagePayload: { id: 'ACQP-RC-77' },
      entryRecordId: 'ISEN-RC-1',
    } as never
  })
  vi.mocked(apiClient.listAnalysisRevisions).mockResolvedValue({
    revisions: [{ recordId: 'ANREV-RC-1', payload: { title: 'GC FID revision' } }],
    total: 1,
  } as never)
  vi.mocked(apiClient.getPackageAnalysisInputs).mockResolvedValue({
    signal: { kind: 'record', id: 'DREF-RC-1', type: 'data-reference' },
    package: { kind: 'record', id: 'DREF-RC-2', type: 'data-reference' },
  } as never)
  vi.mocked(apiClient.createAnalysisRun).mockImplementation(async () => {
    // The entry append PUT lands: the next refetch sees BOTH run refs.
    setStage('analyzed')
    return { success: true, recordId: 'ANR-NEW-RC', run: {} } as never
  })
  vi.mocked(apiClient.updateRecord).mockResolvedValue({ recordId: 'ISEN-RC-1', success: true } as never)
  vi.mocked(apiClient.getAnalysisRun).mockImplementation(async (id: string) => ({
    record: { recordId: id, payload: { id, status: 'succeeded' } },
  }) as never)
})

describe('GcRunSheetSection — user-triggered refresh (the C leg)', () => {
  it('mount shows the bare entry; the ACQP ref appears only AFTER the user attaches (probe = mount + 1)', async () => {
    render(wrap(<GcRunSheetSection runId={RUN_ID} />))
    const sheet = await screen.findByTestId('gc-run-sheet')
    expect(sheet).toBeDefined()
    // Mount state: the entry row WITHOUT the ACQP ref. Awaited — the row
    // renders in the entry-fetch phase (after the probe), so a sync read
    // right after finding the header would race under a heavy batch.
    expect(await screen.findByTestId('gc-row-ISEN-RC-1')).toBeDefined()
    expect(screen.queryByTestId('gc-cell-ISEN-RC-1-acquisitionPackageRef')).toBeNull()
    const sequenceProbeCalls = () =>
      vi
        .mocked(apiClient.listRecordsByKind)
        .mock.calls.filter((c) => c[0] === 'instrument-sequence').length
    expect(sequenceProbeCalls()).toBe(1) // the mount probe

    // The user attaches (the full click path: disclosure → attach toggle →
    // device/key → register).
    fireEvent.click(screen.getByTestId('gc-chrome-toggle'))
    fireEvent.click(screen.getByTestId('gc-attach-toggle-ISEN-RC-1'))
    const dev = (await screen.findByTestId('gc-attach-device-ISEN-RC-1')) as HTMLSelectElement
    fireEvent.change(dev, { target: { value: 'gc-fid-nas' } })
    fireEvent.change(screen.getByTestId('gc-attach-key-ISEN-RC-1'), { target: { value: '2026-10-28/X.D' } })
    fireEvent.click(screen.getByTestId('gc-attach-register-ISEN-RC-1'))
    await waitFor(() => expect(apiClient.registerAcquisitionPackage).toHaveBeenCalledTimes(1))

    // The USER-TRIGGERED refresh landed: the table shows the ACQP ref.
    await screen.findByTestId('gc-cell-ISEN-RC-1-acquisitionPackageRef')
    expect(screen.getByTestId('gc-cell-ISEN-RC-1-acquisitionPackageRef')).toHaveTextContent('ACQP-RC-77')
    // The sequence refresh fired EXACTLY one extra probe (mount + 1 — no
    // spin; the disclosure's gc-method list is the chrome's own lazy fetch,
    // not a sequence probe).
    await waitFor(() => {
      expect(sequenceProbeCalls()).toBe(2)
    })
  })

  it('Analyze (user) creates the run, appends the ref (prior ref survives), lands /analysis?run=<id>; the table shows BOTH refs', async () => {
    // Start from the attached stage (the Analyze button only exists with a
    // package — the honest state machine).
    setStage('attached')
    render(wrap(<GcRunSheetSection runId={RUN_ID} />))
    await screen.findByTestId('gc-cell-ISEN-RC-1-acquisitionPackageRef')
    // The PRIOR run ref flows back in the table + the results list.
    expect(screen.getByTestId('gc-cell-ISEN-RC-1-analysisRunRefs')).toHaveTextContent('ANR-OLD-RC')

    fireEvent.click(screen.getByTestId('gc-chrome-toggle'))
    const rev = (await screen.findByTestId('gc-analyze-rev')) as HTMLSelectElement
    fireEvent.change(rev, { target: { value: 'ANREV-RC-1' } })
    fireEvent.click(screen.getByTestId('gc-analyze-btn-ISEN-RC-1'))

    await waitFor(() => expect(apiClient.createAnalysisRun).toHaveBeenCalledTimes(1))
    expect(apiClient.getPackageAnalysisInputs).toHaveBeenCalledWith('ACQP-RC-77')

    // GC-12 fix-cycle-1 (D3, amended V7(f)): the created run carries the
    // revision's parameterSchema defaults (collectDefaults applied — the run
    // sheet does not render a ParameterForm, so the run would otherwise
    // carry NO parameters).
    // GC-12 fix-cycle-3 (DIRFIX-1, architect ruling B-amended): the created
    // run pins the FILE-level data-reference ONLY (inputs = { signal }) —
    // the directory-kind package manifest DREF is NOT a runner-consumable
    // input (it stays in the provenance hierarchy via the entry's
    // acquisitionPackageRef → ACQP record). The run's title still names the
    // entry (provenance anchor).
    const createArg = vi.mocked(apiClient.createAnalysisRun).mock.calls[0][0] as {
      title: string
      parameters?: Record<string, unknown>
      inputs: Record<string, { id: string }>
    }
    expect(createArg.parameters).toEqual({ baseline_window_s: 20, peak_width_s: 5 })
    // The verify-first pinned FILE input is still the run's inputs (unchanged).
    expect(createArg.inputs.signal.id).toBe('DREF-RC-1')
    // The directory-kind package DREF is NOT in the created run's inputs.
    expect(createArg.inputs.package).toBeUndefined()
    expect(Object.keys(createArg.inputs)).toEqual(['signal'])
    // The created run's title still names the entry (provenance anchor).
    expect(createArg.title).toContain('ISEN-RC-1')

    // The appended ref lands in the table (BOTH refs — bait #8: history kept).
    await screen.findByTestId('gc-cell-ISEN-RC-1-analysisRunRefs')
    const cell = screen.getByTestId('gc-cell-ISEN-RC-1-analysisRunRefs')
    expect(cell.textContent).toContain('ANR-OLD-RC')
    expect(cell.textContent).toContain('ANR-NEW-RC')
    // The GC-11 seam: the created run IS the results surface.
    expect(screen.getByTestId('nav-probe').textContent).toBe('/analysis?run=ANR-NEW-RC')
    // No execute from the run sheet (bait #5).
    expect(apiClient.executeAnalysisRun).not.toHaveBeenCalled()
  })
})
