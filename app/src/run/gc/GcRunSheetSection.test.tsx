/**
 * GC-12 (deliverable A/D7) — GcRunSheetSection: the client-side additive
 * GC run-sheet section on /runs/:runId.
 *
 * D1 gating: the section renders NOTHING when the probe finds no sequence
 * linking the run (the DNA case — byte-identical surface, bait #2). When a
 * sequence links the run, the section renders the run sheet (header + the
 * full-column entry table + the per-row actions).
 *
 * D7 mount accounting (the no-execute idiom transplanted): the sequence
 * probe fires EXACTLY ONCE per runId (deduped), the entry fetch happens
 * once per linked entry, and mount NEVER calls registerAcquisitionPackage,
 * createAnalysisRun, or executeAnalysisRun (register/analyze are click-only).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '../../shared/shell'
import { OpenTabsProvider } from '../../shared/shell/OpenTabsContext'
import { apiClient } from '../../shared/api/client'
import { GcRunSheetSection } from './GcRunSheetSection'
import type { EntryPayload, SequencePayload } from './gcRunSheetModel'

// --- the fixture chain (bait #12: build the chain, never hard-code the lane DB) ---

const RUN_ID = 'RUN-gc-sheet-abc1'

const LINKED_SEQUENCE: { recordId: string; payload: SequencePayload } = {
  recordId: 'ISEQ-GC12-A',
  payload: {
    kind: 'instrument-sequence',
    id: 'ISEQ-GC12-A',
    title: 'FAME sheet A',
    runRef: { kind: 'record', id: RUN_ID, type: 'run' },
    entryRefs: [
      { kind: 'record', id: 'ISEN-GC12-A-001', type: 'instrument-sequence-entry' },
      { kind: 'record', id: 'ISEN-GC12-A-002', type: 'instrument-sequence-entry' },
    ],
  },
}

const UNLINKED_SEQUENCE: { recordId: string; payload: SequencePayload } = {
  recordId: 'ISEQ-OTHER',
  payload: {
    kind: 'instrument-sequence',
    id: 'ISEQ-OTHER',
    title: 'Someone else sheet',
    runRef: { kind: 'record', id: 'RUN-other', type: 'run' },
    entryRefs: [],
  },
}

const ENTRY_1: { recordId: string; payload: EntryPayload } = {
  recordId: 'ISEN-GC12-A-001',
  payload: {
    kind: 'instrument-sequence-entry',
    id: 'ISEN-GC12-A-001',
    position: { vial: '101', tray: 'front' },
    runRef: { kind: 'record', id: RUN_ID, type: 'run' },
    sampleRef: { kind: 'record', id: 'SMP-GC12-001', type: 'sample' },
    gcMethodRef: { kind: 'record', id: 'GCM-DEMO-AOAC-FAME', type: 'gc-method' },
    sampleName: 'RES35077-4',
    amountUninterpreted: 10,
    multiplier: 2,
    manualInjection: false,
    vendorMethodLabel: 'AOAC_FAME_NO_INJECTION.M',
    uninterpreted: { ECM: '3.41' },
  },
}

const ENTRY_2: { recordId: string; payload: EntryPayload } = {
  recordId: 'ISEN-GC12-A-002',
  payload: {
    kind: 'instrument-sequence-entry',
    id: 'ISEN-GC12-A-002',
    position: { vial: '102' },
    runRef: { kind: 'record', id: RUN_ID, type: 'run' },
    sampleRef: { kind: 'record', id: 'SMP-GC12-002', type: 'sample' },
    gcMethodRef: { kind: 'record', id: 'GCM-DEMO-AOAC-FAME', type: 'gc-method' },
    sampleName: 'RES35077-5',
    acquisitionPackageRef: { kind: 'record', id: 'ACQP-000042', type: 'acquisition-package' },
    analysisRunRefs: [{ kind: 'record', id: 'ANR-000099', type: 'analysis-run' }],
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
    executeAnalysisRun: vi.fn(),
    getConfig: vi.fn().mockResolvedValue({
      storageDevices: [
        { id: 'vast', label: 'Lab NAS (vast)', kind: 'local-mount', default: true, mountPath: '/nas/lab-data' },
        { id: 'gc-fid-nas', label: 'GC FID NAS (read-only)', kind: 'local-mount', mountPath: '/nas/gc-fid' },
      ],
    }),
  },
}))

function wrap(ui: React.ReactNode) {
  return (
    <ThemeProvider>
      <OpenTabsProvider>
        <MemoryRouter>
          <Routes>
            <Route path="/analysis" element={<div data-testid="analysis-landing">/analysis</div>} />
            <Route path="/" element={ui} />
          </Routes>
        </MemoryRouter>
      </OpenTabsProvider>
    </ThemeProvider>
  )
}

function mockProbe(sequences: Array<{ recordId: string; payload: SequencePayload }>) {
  // The client returns untyped RecordEnvelope[]; the fixtures are typed for
  // the model — the cast is at the mock boundary only.
  const envelope = <T,>(recs: Array<{ recordId: string; payload: T }>) =>
    recs as unknown as import('../../types/kernel').RecordEnvelope[]
  vi.mocked(apiClient.listRecordsByKind).mockImplementation(async (kind: string) => {
    if (kind === 'instrument-sequence') {
      return { records: envelope(sequences), total: sequences.length }
    }
    if (kind === 'instrument-sequence-entry') {
      return { records: envelope([ENTRY_1, ENTRY_2]), total: 2 }
    }
    return { records: [], total: 0 }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiClient.listAnalysisRevisions).mockResolvedValue({ revisions: [], total: 0 })
  vi.mocked(apiClient.getConfig).mockResolvedValue({
    storageDevices: [
      { id: 'gc-fid-nas', label: 'GC FID NAS (read-only)', kind: 'local-mount', mountPath: '/nas/gc-fid' },
    ],
  } as never)
  // The entry fetch (one getRecord per distinct linked entryRef) resolves the
  // fixture entries by id; an unknown id is a 404 the section skips.
  const entryMap: Record<string, { recordId: string; payload: EntryPayload }> = {
    [ENTRY_1.recordId]: ENTRY_1,
    [ENTRY_2.recordId]: ENTRY_2,
  }
  // FAME-1 (OQ-2): the attached ACQP record (ENTRY_2's ACQP-000042) — the
  // extended fence set fetches it by id at mount.
  const ACQP_PKG: { recordId: string; payload: Record<string, unknown> } = {
    recordId: 'ACQP-000042',
    payload: {
      kind: 'acquisition-package',
      id: 'ACQP-000042',
      acquisitionStatus: 'completed',
      files: [
        { relativePath: 'RUN.LOG', role: 'run_log', dataReferenceRef: { kind: 'record', type: 'data-reference', id: 'DREF-000103' } },
      ],
    },
  }
  vi.mocked(apiClient.getRecord).mockImplementation(async (id: string) => {
    const env = entryMap[id]
    if (env) return env as never
    if (id === ACQP_PKG.recordId) return ACQP_PKG as never
    throw new Error(`404: ${id}`)
  })
  vi.mocked(apiClient.getAnalysisRun).mockResolvedValue({
    record: { recordId: 'ANR-000099', payload: { id: 'ANR-000099', title: 'prior analysis', status: 'succeeded' } },
  } as never)
})

describe('GcRunSheetSection — D1 gating (the DNA case, bait #2)', () => {
  it('renders NOTHING when the probe finds no sequence linking the run', async () => {
    mockProbe([UNLINKED_SEQUENCE])
    const { container } = render(wrap(<GcRunSheetSection runId={RUN_ID} />))
    // The probe ran (it is the gate) — but nothing rendered.
    await waitFor(() => {
      expect(apiClient.listRecordsByKind).toHaveBeenCalledTimes(1)
    })
    expect(container.querySelector('[data-testid^="gc-run-sheet"]')).toBeNull()
    // Nothing but the probe: no attach/analyze machinery, no table.
    expect(screen.queryByTestId('gc-run-table')).toBeNull()
    expect(apiClient.registerAcquisitionPackage).not.toHaveBeenCalled()
    expect(apiClient.createAnalysisRun).not.toHaveBeenCalled()
    expect(apiClient.executeAnalysisRun).not.toHaveBeenCalled()
  })

  it('renders NOTHING when there are no sequences at all', async () => {
    mockProbe([])
    const { container } = render(wrap(<GcRunSheetSection runId={RUN_ID} />))
    await waitFor(() => {
      expect(apiClient.listRecordsByKind).toHaveBeenCalledTimes(1)
    })
    expect(container.querySelector('[data-testid^="gc-run-sheet"]')).toBeNull()
  })
})

describe('GcRunSheetSection — the GC case (a linked sequence renders the sheet)', () => {
  it('renders the sheet with BOTH entries and the full-column table', async () => {
    mockProbe([LINKED_SEQUENCE, UNLINKED_SEQUENCE])
    render(wrap(<GcRunSheetSection runId={RUN_ID} />))
    // Two-phase render: the sheet header appears when the PROBE resolves; the
    // rows appear when the ENTRY fetch (getRecord per entry) resolves. Await
    // the rows (the second phase) so this is load-timing-robust — a sync
    // getByTestId right after finding the header would race the entry fetch
    // under a heavy parallel batch.
    expect(await screen.findByTestId('gc-run-sheet')).toBeDefined()
    expect(await screen.findByTestId('gc-run-table')).toBeDefined()
    // Both entries appear (in entryRefs order) — awaited (entry-fetch phase).
    expect(await screen.findByTestId('gc-row-ISEN-GC12-A-001')).toBeDefined()
    expect(screen.getByTestId('gc-row-ISEN-GC12-A-002')).toBeDefined()
    // The full columns incl. the honesty arms (bait #9).
    expect(screen.getByTestId('gc-cell-ISEN-GC12-A-001-sampleName')).toHaveTextContent('RES35077-4')
    expect(screen.getByTestId('gc-cell-ISEN-GC12-A-001-position')).toHaveTextContent('Vial 101')
    expect(screen.getByTestId('gc-cell-ISEN-GC12-A-001-uninterpreted.ECM')).toHaveTextContent('3.41')
    expect(screen.getByTestId('gc-cell-ISEN-GC12-A-001-amountUninterpreted')).toHaveTextContent('10 (unit unknown)')
    // The acquisition package + analysis-run history flow back (D5).
    expect(screen.getByTestId('gc-cell-ISEN-GC12-A-002-acquisitionPackageRef')).toHaveTextContent('ACQP-000042')
    expect(screen.getByTestId('gc-cell-ISEN-GC12-A-002-analysisRunRefs')).toHaveTextContent('ANR-000099')
  })

  it('mount accounting (D7 + FAME-1/OQ-2): probe EXACTLY once, one getRecord per entry + one per DISTINCT attached ACQP, zero writes (bait #5)', async () => {
    mockProbe([LINKED_SEQUENCE])
    render(wrap(<GcRunSheetSection runId={RUN_ID} />))
    await screen.findByTestId('gc-run-sheet')
    await waitFor(() => {
      // The probe is the ONLY listRecordsByKind call (deduped on runId).
      expect(apiClient.listRecordsByKind).toHaveBeenCalledTimes(1)
    })
    // Each linked entry is fetched ONCE for its table row (2), PLUS one
    // getRecord for the single DISTINCT attached ACQP (FAME-1/OQ-2 fence
    // extension, ratified 2026-11-01 — the ACQP payload carries the
    // acquisition status the run sheet must show on a fresh mount). 2 + 1 = 3.
    await waitFor(() => {
      expect(apiClient.getRecord).toHaveBeenCalledTimes(3)
    })
    expect(vi.mocked(apiClient.getRecord).mock.calls.map((c) => c[0])).toContain('ACQP-000042')
    // Mount NEVER touches the write/execute surface.
    expect(apiClient.registerAcquisitionPackage).not.toHaveBeenCalled()
    expect(apiClient.getPackageAnalysisInputs).not.toHaveBeenCalled()
    expect(apiClient.createAnalysisRun).not.toHaveBeenCalled()
    expect(apiClient.executeAnalysisRun).not.toHaveBeenCalled()
  })
})
