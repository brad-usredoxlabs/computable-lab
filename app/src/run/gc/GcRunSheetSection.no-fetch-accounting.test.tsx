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
 * FAME-1 (OQ-2, orch-ratified 2026-11-01): the allowed set is EXTENDED by
 * exactly ONE read — one getRecord per DISTINCT attached
 * acquisitionPackageRef (deduped across entries), each ONCE, at mount (and
 * again after a user-triggered refresh, mirroring the entry fetch). RATIONALE
 * (this commit, per the fence-edit rule): surfacing the acquisition status
 * on the run sheet (aborted / stopped / unknown = visibly qualified) REQUIRES
 * the ACQP record's own payload — the entry payloads carry only the ACQP REF,
 * not the status — and "visibly qualified" on a FRESH mount rules out a
 * show-status-only-after-reload reading. The alternative (no ACQP fetch)
 * fails the FAME-1 acceptance on a fresh mount, so the fence is extended
 * deliberately and minimally: ONE getRecord per DISTINCT attached ACQP,
 * deduped, cancel-on-unmount (mirroring the entry-fetch pattern). Silently
 * relaxing counts, or fetching the package on every re-render, would be a
 * reject — the counts below pin the extended set exactly.
 *
 * Pinned here, separate from the section's rendering tests (the D7 pin is
 * the leg-F deliverable — "accounting pin + docs").
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, act, cleanup, fireEvent } from '@testing-library/react'
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
  // FAME-1 (OQ-2): the attached ACQP record for ENTRY_1 (the fence's extended
  // set — one getRecord per DISTINCT attached ACQP).
  const ACQP_1: { recordId: string; payload: Record<string, unknown> } = {
    recordId: 'ACQP-F-1',
    payload: {
      kind: 'acquisition-package',
      id: 'ACQP-F-1',
      acquisitionStatus: 'aborted',
      acquisitionStatusEvidence: {
        ruleset: { id: 'gc-acquisition-status', version: 1, sourceFile: 'config/gc-acquisition-status/log-patterns.yaml' },
        sourceMember: { relativePath: 'RUN.LOG' },
        decode: { encoding: 'utf-16le', bomPresent: true },
        matched: [
          { line: 'Method       Method aborted                                 13:19:33 10/23/26', ruleId: 'aborted-method-aborted', lineIndex: 5 },
        ],
      },
    },
  }
  vi.mocked(apiClient.getRecord).mockImplementation(async (id: string) => {
    const env = entryMap[id]
    if (env) return env as never
    if (id === ACQP_1.recordId) return ACQP_1 as never
    throw new Error(`404: ${id}`)
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

  it('GC case: the probe once + one getRecord per linked entry + one per DISTINCT attached ACQP, each ONCE; zero writes', async () => {
    render(wrap(RUN_GC, 'gc'))
    await screen.findByTestId('gc-run-sheet')
    await waitFor(() => {
      expect(probeCalls()).toBe(1)
    })
    // FAME-1 (OQ-2) extended set: the two linked entries + ONE getRecord for
    // the single DISTINCT attached ACQP (ENTRY_1's ACQP-F-1; ENTRY_2 has no
    // package). 2 entries + 1 ACQP = 3 getRecord calls, deduped.
    await waitFor(() => {
      expect(apiClient.getRecord).toHaveBeenCalledTimes(3)
    })
    const getCallIds = vi.mocked(apiClient.getRecord).mock.calls.map((c) => c[0])
    expect(new Set(getCallIds).size).toBe(3) // no duplicates (entries + the one ACQP)
    expect(getCallIds).toContain('ACQP-F-1') // the attached ACQP was fetched
    // The mount NEVER touches the write/execute surface.
    expect(apiClient.registerAcquisitionPackage).not.toHaveBeenCalled()
    expect(apiClient.getPackageAnalysisInputs).not.toHaveBeenCalled()
    expect(apiClient.createAnalysisRun).not.toHaveBeenCalled()
    expect(apiClient.executeAnalysisRun).not.toHaveBeenCalled()
    expect(apiClient.createRecord).not.toHaveBeenCalled()
    expect(apiClient.updateRecord).not.toHaveBeenCalled()
  })

  it('FAME-1 (OQ-2): two entries sharing ONE attached ACQP -> exactly ONE getRecord for it (deduped, not per-entry)', async () => {
    // Model two entries that BOTH attach the same ACQP (the dedup the fence
    // requires: DISTINCT attached ACQP, not per-entry). Override the probe so
    // the linked sequence references two entries that share an acquisitionPackageRef.
    vi.mocked(apiClient.listRecordsByKind).mockImplementation(async (kind: string) => {
      if (kind === 'instrument-sequence') {
        return {
          records: [
            {
              recordId: 'ISEQ-F-DUP',
              payload: {
                kind: 'instrument-sequence',
                id: 'ISEQ-F-DUP',
                title: 'Dup sheet',
                runRef: { kind: 'record', id: RUN_GC, type: 'run' },
                entryRefs: [
                  { kind: 'record', id: 'ISEN-F-D1', type: 'instrument-sequence-entry' },
                  { kind: 'record', id: 'ISEN-F-D2', type: 'instrument-sequence-entry' },
                ],
              },
            },
          ] as unknown as never,
          total: 1,
        }
      }
      return { records: [], total: 0 }
    })
    const dupEntry = (id: string): { recordId: string; payload: EntryPayload } => ({
      recordId: id,
      payload: {
        kind: 'instrument-sequence-entry',
        id,
        position: { vial: '1' },
        runRef: { kind: 'record', id: RUN_GC, type: 'run' },
        acquisitionPackageRef: { kind: 'record', id: 'ACQP-F-SHARED', type: 'acquisition-package' },
      },
    })
    vi.mocked(apiClient.getRecord).mockImplementation(async (id: string) => {
      if (id === 'ISEN-F-D1') return dupEntry('ISEN-F-D1') as never
      if (id === 'ISEN-F-D2') return dupEntry('ISEN-F-D2') as never
      if (id === 'ACQP-F-SHARED') {
        return {
          recordId: 'ACQP-F-SHARED',
          payload: { kind: 'acquisition-package', id: 'ACQP-F-SHARED', acquisitionStatus: 'unknown' },
        } as never
      }
      throw new Error(`404: ${id}`)
    })
    render(wrap(RUN_GC, 'gc-dup'))
    await screen.findByTestId('gc-run-sheet')
    // Two entries + ONE shared ACQP = 3 getRecord calls (NOT 4 — the ACQP is
    // deduped across the two entries that attach it).
    await waitFor(() => {
      expect(apiClient.getRecord).toHaveBeenCalledTimes(3)
    })
    const acqpFetches = vi
      .mocked(apiClient.getRecord)
      .mock.calls.filter((c) => c[0] === 'ACQP-F-SHARED').length
    expect(acqpFetches).toBe(1) // deduped: ONE fetch for the shared ACQP
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

  /**
   * GC-12 fix-cycle-1 (D2) — the reviewer-specified PROBE: one user action on
   * GC run A (refreshTick>0), then a runId change to a no-sequence run B in
   * the SAME component instance -> the section renders NOTHING. Pre-fix, the
   * sticky "last non-empty linkage" (linkedRef, never cleared on runId change
   * while refreshTick>0) rendered run A's sheet under run B's URL — cross-run
   * data exposure (bait #2 / D1 violation) and a live chrome whose
   * sequenceRef pointed at run A's header (a cross-run write).
   */
  it('D2 probe: refreshTick>0 on run A, then runId -> no-sequence run B renders NOTHING (no stale cross-run linkage)', async () => {
    // Run A (GC-linked) mounts; the sheet shows.
    const { rerender } = render(wrap(RUN_GC, 'd2'))
    const sheet = await screen.findByTestId('gc-run-sheet')
    expect(sheet).toBeDefined()
    expect(probeCalls()).toBe(1) // the mount probe

    // One USER action on run A: an NAS attach (the cheapest full click path
    // that triggers onEntryUpdated -> refreshTick 1). Attach via ENTRY_2 —
    // ENTRY_1 already carries an acquisitionPackageRef, so its attach toggle
    // is absent (hasPkg). Override the config to expose a device and the
    // register to resolve (the default harness returns no devices, so the
    // attach panel's not-configured arm would otherwise have no register
    // button).
    vi.mocked(apiClient.getConfig).mockResolvedValue({
      storageDevices: [{ id: 'gc-fid-nas', label: 'GC FID NAS (read-only)', kind: 'local-mount' }],
    } as never)
    vi.mocked(apiClient.registerAcquisitionPackage).mockResolvedValue({
      packageRecordId: 'ACQP-D2-1',
      packagePayload: { id: 'ACQP-D2-1' },
      entryRecordId: ENTRY_2.recordId,
    } as never)
    fireEvent.click(screen.getByTestId('gc-chrome-toggle'))
    // The attach toggle appears only once the entry row has fetched (rows
    // non-empty); await it so the click is deterministic (a sync read right
    // after the section header can race the entry-fetch phase).
    await screen.findByTestId(`gc-attach-toggle-${ENTRY_2.recordId}`)
    fireEvent.click(screen.getByTestId(`gc-attach-toggle-${ENTRY_2.recordId}`))
    const dev = (await screen.findByTestId(`gc-attach-device-${ENTRY_2.recordId}`)) as HTMLSelectElement
    fireEvent.change(dev, { target: { value: 'gc-fid-nas' } })
    fireEvent.change(screen.getByTestId(`gc-attach-key-${ENTRY_2.recordId}`), { target: { value: '2026-10-28/D2.D' } })
    fireEvent.click(screen.getByTestId(`gc-attach-register-${ENTRY_2.recordId}`))
    // The user-triggered refresh landed: the sequence probe fired a SECOND
    // time (mount + 1) — refreshTick is now >0 on run A.
    await waitFor(() => {
      expect(apiClient.registerAcquisitionPackage).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(probeCalls()).toBe(2)
    })

    // Now navigate to run B — the SAME component instance (same key), and
    // run B links NO sequence (the mock probe returns only the run-A-linked
    // sequence, so run B's probe resolves an empty linkage).
    rerender(wrap(RUN_DNA, 'd2'))
    // The new run's MOUNT probe fires exactly ONCE (at most once per runId).
    await waitFor(() => {
      expect(probeCalls()).toBe(3)
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(probeCalls()).toBe(3) // mount A + refresh A + mount B — no double probe
    // THE PROBE: run B renders NOTHING — never run A's stale sheet, never
    // run A's rows under run B's URL (bait #2: the DNA page is byte-identical).
    expect(screen.queryByTestId('gc-run-sheet')).toBeNull()
    expect(screen.queryByTestId(`gc-row-${ENTRY_1.recordId}`)).toBeNull()
    expect(screen.queryByTestId(`gc-row-${ENTRY_2.recordId}`)).toBeNull()
    // And the cross-run WRITE surface is gone: no live chrome (its
    // sequenceRef used to point at run A's header).
    expect(screen.queryByTestId('gc-chrome-toggle')).toBeNull()
    expect(screen.queryByTestId('gc-sample-add-btn')).toBeNull()
  })
})
