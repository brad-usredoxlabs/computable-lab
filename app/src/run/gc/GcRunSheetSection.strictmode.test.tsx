/**
 * GC-12 browser-gate fix — GcRunSheetSection under <React.StrictMode>.
 *
 * Defect of record (browser receipt 20261028T185555, blocker #1): on a REAL
 * browser the section never rendered on /runs/:runId. main.tsx:37 wraps the
 * app in <React.StrictMode> (the labware-fixture branch at main.tsx:17 is
 * wrapped too), and the development build runs every mount
 * effect as mount → cleanup → re-mount. The mount probe stamped its dedupe
 * ref SYNCHRONOUSLY before the request while its setSequences/setProbed
 * callbacks were gated on the `cancelled` flag the cleanup sets — so pass 1
 * fired the only fetch and its result was discarded, and pass 2 saw the
 * ref already stamped and early-returned. `probed` never flipped, `linked`
 * stayed [], and the component rendered null — the entire GC surface dead.
 *
 * This suite renders the section INSIDE <React.StrictMode> (the harness's
 * development react build double-invokes effects, matching the browser).
 * Contract pinned HERE — the OBSERVABLE contract, not the framework's
 * double-invoke count (GC12 bfix2, orch ruling on advreview F1):
 *   - production dedupe = at most one probe per runId, pinned in the
 *     UNTOUCHED D7 accounting fence GcRunSheetSection.no-fetch-accounting.test.tsx
 *     (the toBe(1) legs);
 *   - under StrictMode the framework's mount → cleanup → re-mount
 *     double-invoke MAY re-fire the idempotent probe (pass 1 + surviving
 *     pass) — that count is framework-internal, not the contract;
 *   - the contract pinned HERE is: the sheet RENDERS, the probe fires >=1,
 *     and NO re-fire after settle (no storm).
 * The DNA case still renders NOTHING, and mount never touches the
 * write/execute surface.
 *
 * RED (pre-fix): the sheet-present assertions fail — under StrictMode the
 * sheet is ABSENT because the dedupe ref was stamped before the (discarded)
 * request, so the surviving pass never settles the probe.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StrictMode } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../shared/shell'
import { OpenTabsProvider } from '../../shared/shell/OpenTabsContext'
import { apiClient } from '../../shared/api/client'
import { GcRunSheetSection } from './GcRunSheetSection'
import type { EntryPayload, SequencePayload } from './gcRunSheetModel'

const RUN_GC = 'RUN-gc-sm-1'
const RUN_DNA = 'RUN-dna-sm-1'

const LINKED_SEQUENCE: { recordId: string; payload: SequencePayload } = {
  recordId: 'ISEQ-SM-1',
  payload: {
    kind: 'instrument-sequence',
    id: 'ISEQ-SM-1',
    title: 'SM sheet',
    runRef: { kind: 'record', id: RUN_GC, type: 'run' },
    entryRefs: [
      { kind: 'record', id: 'ISEN-SM-1', type: 'instrument-sequence-entry' },
      { kind: 'record', id: 'ISEN-SM-2', type: 'instrument-sequence-entry' },
    ],
  },
}

const UNLINKED_SEQUENCE: { recordId: string; payload: SequencePayload } = {
  recordId: 'ISEQ-SM-OTHER',
  payload: {
    kind: 'instrument-sequence',
    id: 'ISEQ-SM-OTHER',
    title: 'Someone else sheet',
    runRef: { kind: 'record', id: 'RUN-other', type: 'run' },
    entryRefs: [],
  },
}

const ENTRY_1: { recordId: string; payload: EntryPayload } = {
  recordId: 'ISEN-SM-1',
  payload: {
    kind: 'instrument-sequence-entry',
    id: 'ISEN-SM-1',
    position: { vial: '1' },
    runRef: { kind: 'record', id: RUN_GC, type: 'run' },
    sampleRef: { kind: 'record', id: 'SMP-SM-1', type: 'sample' },
    gcMethodRef: { kind: 'record', id: 'GCM-SM', type: 'gc-method' },
  },
}

const ENTRY_2: { recordId: string; payload: EntryPayload } = {
  recordId: 'ISEN-SM-2',
  payload: {
    kind: 'instrument-sequence-entry',
    id: 'ISEN-SM-2',
    position: { vial: '2' },
    runRef: { kind: 'record', id: RUN_GC, type: 'run' },
    sampleRef: { kind: 'record', id: 'SMP-SM-2', type: 'sample' },
    gcMethodRef: { kind: 'record', id: 'GCM-SM', type: 'gc-method' },
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

function wrap(runId: string) {
  return (
    <ThemeProvider>
      <OpenTabsProvider>
        <MemoryRouter>
          {/* main.tsx:37 wraps the app in <StrictMode> (the labware-fixture
              branch at main.tsx:17 is wrapped too) — the development
              build's mount → cleanup → re-mount effect double-invoke is
              exactly what dead-locked the mount probe in the browser. */}
          <StrictMode>
            <GcRunSheetSection runId={runId} />
          </StrictMode>
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

function settle() {
  return act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
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
    record: { recordId: 'ANR-SM-1', payload: { status: 'succeeded' } },
  } as never)
})

describe('GcRunSheetSection — <React.StrictMode> (the browser-gate dead-lock)', () => {
  it('the GC sheet RENDERS under StrictMode (the surviving pass settles the probe)', async () => {
    render(wrap(RUN_GC))
    // PRE-fix: pass 1 fires the only fetch, its cleanup discards the result
    // (cancelled), and pass 2 early-returns on the already-stamped dedupe
    // ref — probed never flips and this never resolves (RED leg).
    await screen.findByTestId('gc-run-sheet', undefined, { timeout: 4000 })
    // Both entry rows appear (the entry-fetch phase after the probe).
    expect(await screen.findByTestId('gc-row-ISEN-SM-1')).toBeDefined()
    expect(screen.getByTestId('gc-row-ISEN-SM-2')).toBeDefined()
  })

  it('no re-fire storm: the probe fires >=1 and does NOT grow after settle (no storm)', async () => {
    const { rerender } = render(wrap(RUN_GC))
    await screen.findByTestId('gc-run-sheet', undefined, { timeout: 4000 })
    // Sheet up (the sheet-renders leg). The probe has fired at least once —
    // the framework's StrictMode double-invoke MAY have re-fired the
    // idempotent probe (pass 1 + surviving pass), so the exact count is
    // framework-internal, NOT the contract: production single-fire is pinned
    // separately in GcRunSheetSection.no-fetch-accounting.test.tsx (toBe(1)).
    expect(probeCalls()).toBeGreaterThanOrEqual(1)
    // Contract: after settle the count STOPS GROWING. Another settle + a
    // re-render must NOT re-fire the probe (dedupe on the stamped key).
    await settle()
    const after = probeCalls()
    await settle()
    rerender(wrap(RUN_GC))
    expect(probeCalls()).toBe(after)
  })

  it('the DNA case still renders NOTHING under StrictMode (byte-identical surface)', async () => {
    vi.mocked(apiClient.listRecordsByKind).mockImplementation(async (kind: string) => {
      if (kind === 'instrument-sequence') {
        return { records: [UNLINKED_SEQUENCE] as unknown as never, total: 1 }
      }
      return { records: [], total: 0 }
    })
    render(wrap(RUN_DNA))
    // The probe ran (it is the gate)…
    await waitFor(() => {
      expect(probeCalls()).toBeGreaterThanOrEqual(1)
    })
    await settle()
    // …and NOTHING renders (no linkage, no entry fetches, no sheet).
    expect(screen.queryByTestId('gc-run-sheet')).toBeNull()
    expect(screen.queryByTestId('gc-run-table')).toBeNull()
    expect(apiClient.getRecord).not.toHaveBeenCalled()
  })

  it('mount NEVER touches the write/execute surface under StrictMode', async () => {
    render(wrap(RUN_GC))
    await settle()
    expect(apiClient.registerAcquisitionPackage).not.toHaveBeenCalled()
    expect(apiClient.getPackageAnalysisInputs).not.toHaveBeenCalled()
    expect(apiClient.createAnalysisRun).not.toHaveBeenCalled()
    expect(apiClient.executeAnalysisRun).not.toHaveBeenCalled()
    expect(apiClient.createRecord).not.toHaveBeenCalled()
    expect(apiClient.updateRecord).not.toHaveBeenCalled()
  })
})
