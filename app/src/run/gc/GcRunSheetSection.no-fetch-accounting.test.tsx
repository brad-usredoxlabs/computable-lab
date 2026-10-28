/**
 * GC-12 (deliverable F / D7) — GcRunSheetSection: the MOUNT-FETCH ACCOUNTING
 * PIN (the AnalysisPage.no-execute idiom transplanted to the run-sheet).
 *
 * This is the NEW fence the spec's D7 calls for: the DNA case (the probe
 * finds no sequence) makes EXACTLY the read-only calls the design allows and
 * NOTHING else — the section NEVER calls registerAcquisitionPackage,
 * createAnalysisRun, or executeAnalysisRun on mount (register/analyze are
 * click-only; execute stays a click on /analysis — the GC-9/11 no-execute
 * accounting survives, bait #5). The GC case makes the probe + one getRecord
 * per linked entry, each ONCE. The probe fires at most once per runId
 * (deduped on the resolved id — a re-render with the same runId must not
 * re-fire it).
 *
 * Pinned here, separate from the section's rendering tests (the D7 pin is
 * the leg-F deliverable — "accounting pin + docs").
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, act, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../shared/shell'
import { OpenTabsProvider } from '../../shared/shell/OpenTabsContext'
import { apiClient } from '../../shared/api/client'
import { GcRunSheetSection } from './GcRunSheetSection'
import type { EntryPayload, SequencePayload } from './gcRunSheetModel'

const RUN_DNA = 'RUN-dna-only'
const RUN_GC = 'RUN-gc-sheet-f'

const LINKED_SEQUENCE: { recordId: string; payload: SequencePayload } = {
  recordId: 'ISEQ-F-1',
  payload: {
    kind: 'instrument-sequence',
    id: 'ISEQ-F-1',
    title: 'F sheet',
    runRef: { kind: 'record', id: RUN_GC, type: 'run' },
    entryRefs: [
      { kind: 'record', id: 'ISEN-F-1', type: 'instrument-sequence-entry' },
      { kind: 'record', id: 'ISEN-F-2', type: 'instrument-sequence-entry' },
    ],
  },
}

const ENTRY_1: { recordId: string; payload: EntryPayload } = {
  recordId: 'ISEN-F-1',
  payload: {
    kind: 'instrument-sequence-entry',
    id: 'ISEN-F-1',
    position: { vial: '1' },
    runRef: { kind: 'record', id: RUN_GC, type: 'run' },
    sampleRef: { kind: 'record', id: 'SMP-F-1', type: 'sample' },
    gcMethodRef: { kind: 'record', id: 'GCM-F', type: 'gc-method' },
    acquisitionPackageRef: { kind: 'record', id: 'ACQP-F-1', type: 'acquisition-package' },
  },
}

const ENTRY_2: { recordId: string; payload: EntryPayload } = {
  recordId: 'ISEN-F-2',
  payload: {
    kind: 'instrument-sequence-entry',
    id: 'ISEN-F-2',
    position: { vial: '2' },
    runRef: { kind: 'record', id: RUN_GC, type: 'run' },
    sampleRef: { kind: 'record', id: 'SMP-F-2', type: 'sample' },
    gcMethodRef: { kind: 'record', id: 'GCM-F', type: 'gc-method' },
  },
}

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    listRecordsByKind: vi.fn(),
    getRecord: vi.fn(),
    listAnalysisRevisions: vi.fn().mockResolvedValue({ revisions: [], total: 0 }),
    getAnalysisRun: vi.fn(),
    registerAcquisitionPackage: vi.fn(),
    getPackageAnalysisInputs: vi.fn(),
    createAnalysisRun: vi.fn(),
    updateRecord: vi.fn(),
    createRecord: vi.fn(),
    executeAnalysisRun: vi.fn(),
    getConfig: vi.fn().mockResolvedValue({ storageDevices: [] }),
  },
}))

function wrap(runId: string, key: string) {
  return (
    <ThemeProvider>
      <OpenTabsProvider>
        <MemoryRouter>
          {/* Remounting with a different key models a fresh page mount for
              the same run (the dedupe ref must survive a re-render, and a
              fresh mount of the SAME run must not double the probe within
              one component life — the ref is the pin). */}
          <div key={key}>
            <GcRunSheetSection runId={runId} />
          </div>
        </MemoryRouter>
      </OpenTabsProvider>
    </ThemeProvider>
  )
}

function probeCalls() {
  return vi
    .mocked(apiClient.listRecordsByKind)
    .mock.calls.filter((c) => c[0] === 'instrument-sequence').length
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.mocked(apiClient.listRecordsByKind).mockImplementation(async (kind: string) => {
    if (kind === 'instrument-sequence') {
      return { records: [LINKED_SEQUENCE] as unknown as never, total: 1 }
    }
    return { records: [], total: 0 }
  })
  const entryMap: Record<string, { recordId: string; payload: EntryPayload }> = {
    [ENTRY_1.recordId]: ENTRY_1,
    [ENTRY_2.recordId]: ENTRY_2,
  }
  vi.mocked(apiClient.getRecord).mockImplementation(async (id: string) => {
    const env = entryMap[id]
    if (!env) throw new Error(`404: ${id}`)
    return env as never
  })
  vi.mocked(apiClient.getAnalysisRun).mockResolvedValue({
    record: { recordId: 'ANR-F-1', payload: { status: 'succeeded' } },
  } as never)
})

describe('GcRunSheetSection — D7 no-fetch-accounting pin (bait #5)', () => {
  it('DNA case: the probe fires EXACTLY once, nothing else; zero writes (byte-identical surface)', async () => {
    // The probe finds a sequence that does NOT link this run.
    vi.mocked(apiClient.listRecordsByKind).mockImplementation(async (kind: string) => {
      if (kind === 'instrument-sequence') {
        return {
          records: [
            {
              recordId: 'ISEQ-OTHER',
              payload: {
                kind: 'instrument-sequence',
                id: 'ISEQ-OTHER',
                runRef: { kind: 'record', id: 'RUN-other', type: 'run' },
                entryRefs: [],
              },
            },
          ] as unknown as never,
          total: 1,
        }
      }
      return { records: [], total: 0 }
    })
    render(wrap(RUN_DNA, 'dna'))
    // The probe fired (it is the gate)…
    await waitFor(() => {
      expect(probeCalls()).toBe(1)
    })
    // …and NOTHING else: no entry fetches (no linkage), no attach/analyze
    // machinery, and the section rendered nothing.
    expect(apiClient.getRecord).not.toHaveBeenCalled()
    expect(apiClient.getAnalysisRun).not.toHaveBeenCalled()
    expect(apiClient.registerAcquisitionPackage).not.toHaveBeenCalled()
    expect(apiClient.getPackageAnalysisInputs).not.toHaveBeenCalled()
    expect(apiClient.createAnalysisRun).not.toHaveBeenCalled()
    expect(apiClient.executeAnalysisRun).not.toHaveBeenCalled()
    expect(apiClient.createRecord).not.toHaveBeenCalled()
    expect(apiClient.updateRecord).not.toHaveBeenCalled()
    expect(screen.queryByTestId('gc-run-sheet')).toBeNull()
  })

  it('GC case: the probe once + one getRecord per linked entry, each ONCE; zero writes', async () => {
    render(wrap(RUN_GC, 'gc'))
    await screen.findByTestId('gc-run-sheet')
    await waitFor(() => {
      expect(probeCalls()).toBe(1)
    })
    // The two linked entries are fetched ONCE each (no second list, no
    // duplicate getRecord).
    await waitFor(() => {
      expect(apiClient.getRecord).toHaveBeenCalledTimes(2)
    })
    const entryGetCalls = vi.mocked(apiClient.getRecord).mock.calls.map((c) => c[0])
    expect(new Set(entryGetCalls).size).toBe(2) // no duplicates
    // The mount NEVER touches the write/execute surface.
    expect(apiClient.registerAcquisitionPackage).not.toHaveBeenCalled()
    expect(apiClient.getPackageAnalysisInputs).not.toHaveBeenCalled()
    expect(apiClient.createAnalysisRun).not.toHaveBeenCalled()
    expect(apiClient.executeAnalysisRun).not.toHaveBeenCalled()
    expect(apiClient.createRecord).not.toHaveBeenCalled()
    expect(apiClient.updateRecord).not.toHaveBeenCalled()
  })

  it('the probe fires at most ONCE per runId — a re-render (same run) does not re-fire it', async () => {
    const { rerender } = render(wrap(RUN_GC, 'k1'))
    await screen.findByTestId('gc-run-sheet')
    await waitFor(() => {
      expect(probeCalls()).toBe(1)
    })
    // A re-render of the same section (same runId) — the dedupe ref holds.
    rerender(wrap(RUN_GC, 'k1'))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(probeCalls()).toBe(1)
    // (A NEW run id in a fresh component life would fire once for that id —
    // the dedupe is per-runId, not global.)
  })

  it('a runId CHANGE (same component life) fires the probe once for the NEW runId only', async () => {
    const { rerender } = render(wrap(RUN_GC, 'k1'))
    await screen.findByTestId('gc-run-sheet')
    await waitFor(() => {
      expect(probeCalls()).toBe(1)
    })
    // The user navigates to a different run (same mounted component): the
    // probe re-fires ONCE for the new runId (a new run is a new gate check),
    // and the DNA result renders nothing.
    rerender(wrap(RUN_DNA, 'k1'))
    await waitFor(() => {
      expect(probeCalls()).toBe(2)
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(probeCalls()).toBe(2) // exactly one per runId
    expect(screen.queryByTestId('gc-run-sheet')).toBeNull()
  })
})
