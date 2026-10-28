/**
 * GC-12 (deliverables C/D3/E) — GcSectionChrome: the run-sheet's interactive
 * affordances (method author/select, sample add, NAS attach, Analyze handoff).
 *
 * Pins:
 *  - LAZY mount (the D7 pin, bait #5): mounting the chrome makes ZERO calls
 *    — gc-methods + revisions are fetched only when the user OPENS the
 *    disclosure (the section's sequence probe stays the only mount
 *    listRecordsByKind).
 *  - D3 sample add: mints the minimal party→request→sample→entry chain via
 *    the EXISTING createRecord (the lane has 0 requests/samples — bait #12)
 *    and APPENDS the new entry ref to the sequence's entryRefs via
 *    updateRecord (append-only — the existing rows are NEVER dropped).
 *  - C NAS attach: per entry WITHOUT a package, an "Attach .D" affordance
 *    opens the GcAttachPanel (device dropdown = CONFIG data, click-only
 *    register); a successful register closes the panel and triggers the
 *    section refetch (onEntryUpdated) so the ACQP ref shows in the table.
 *  - E Analyze: for an entry WITH a package, Analyze calls the VERIFY-FIRST
 *    getPackageAnalysisInputs route (bait #11 — the trust boundary), CREATES
 *    the analysis-run with the pinned inputs, APPENDS the new run ref to
 *    the entry's analysisRunRefs (bait #8 — the prior ref SURVIVES), and
 *    navigates /analysis?run=<new id> (the GC-11 seam). No execute
 *    (bait #5). For an entry WITHOUT a package it renders a NAMED
 *    "attach first" reason (not a disabled button — dead-chrome clause,
 *    bait #6); no revision selected renders a NAMED reason.
 *  - no gc-methods → a NAMED not-ready reason + a working authoring link.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { ThemeProvider } from '../../shared/shell'
import { OpenTabsProvider } from '../../shared/shell/OpenTabsContext'
import { apiClient } from '../../shared/api/client'
import { GcSectionChrome, type GcChromeEntry } from './GcSectionChrome'

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    listRecordsByKind: vi.fn(),
    listAnalysisRevisions: vi.fn(),
    createRecord: vi.fn(),
    updateRecord: vi.fn(),
    getRecord: vi.fn(),
    getPackageAnalysisInputs: vi.fn(),
    createAnalysisRun: vi.fn(),
    registerAcquisitionPackage: vi.fn(),
    getConfig: vi.fn().mockResolvedValue({ storageDevices: [] }),
    executeAnalysisRun: vi.fn(),
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

const ENTRY_WITH_PKG: GcChromeEntry = {
  recordId: 'ISEN-C-1',
  payload: {
    id: 'ISEN-C-1',
    position: { vial: '101' },
    runRef: { kind: 'record', id: 'RUN-C-1', type: 'run' },
    sampleRef: { kind: 'record', id: 'SMP-C-1', type: 'sample' },
    gcMethodRef: { kind: 'record', id: 'GCM-DEMO-AOAC-FAME', type: 'gc-method' },
    acquisitionPackageRef: { kind: 'record', id: 'ACQP-000042', type: 'acquisition-package' },
    analysisRunRefs: [{ kind: 'record', id: 'ANR-OLD-1', type: 'analysis-run' }],
  },
}

const ENTRY_NO_PKG: GcChromeEntry = {
  recordId: 'ISEN-C-2',
  payload: {
    id: 'ISEN-C-2',
    position: { vial: '102' },
    runRef: { kind: 'record', id: 'RUN-C-1', type: 'run' },
    sampleRef: { kind: 'record', id: 'SMP-C-2', type: 'sample' },
    gcMethodRef: { kind: 'record', id: 'GCM-DEMO-AOAC-FAME', type: 'gc-method' },
  },
}

const SEQUENCE: {
  recordId: string
  entryRefs: Array<{ kind: 'record'; id: string; type: string }>
} = {
  recordId: 'ISEQ-C-1',
  entryRefs: [
    { kind: 'record', id: 'ISEN-C-1', type: 'instrument-sequence-entry' },
    { kind: 'record', id: 'ISEN-C-2', type: 'instrument-sequence-entry' },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiClient.listRecordsByKind).mockImplementation(async (kind: string) => {
    const env = <T,>(recs: Array<{ recordId: string; payload: T }>) =>
      recs as unknown as import('../../types/kernel').RecordEnvelope[]
    if (kind === 'gc-method') {
      return { records: env([{ recordId: 'GCM-DEMO-AOAC-FAME', payload: { name: 'AOAC FAME GC-FID method (demo)' } as never }]), total: 1 }
    }
    return { records: [], total: 0 }
  })
  vi.mocked(apiClient.listAnalysisRevisions).mockResolvedValue({
    revisions: [{ recordId: 'ANREV-C-1', payload: { title: 'GC FID integration revision' } }],
    total: 1,
  } as never)
  vi.mocked(apiClient.createRecord).mockResolvedValue({ recordId: 'X', success: true } as never)
  vi.mocked(apiClient.updateRecord).mockResolvedValue({ recordId: 'ISEQ-C-1', success: true } as never)
  // getRecord is id-aware: the sequence header for the sample-add append,
  // the entry (with its PRIOR history) for the analyze append.
  vi.mocked(apiClient.getRecord).mockImplementation(async (id: string) => {
    if (id === 'ISEQ-C-1') {
      return {
        recordId: 'ISEQ-C-1',
        payload: { kind: 'instrument-sequence', id: 'ISEQ-C-1', entryRefs: SEQUENCE.entryRefs },
      } as never
    }
    return {
      recordId: id,
      payload: {
        kind: 'instrument-sequence-entry',
        id,
        analysisRunRefs: [{ kind: 'record', id: 'ANR-OLD-1', type: 'analysis-run' }],
      },
    } as never
  })
  vi.mocked(apiClient.getPackageAnalysisInputs).mockResolvedValue({
    signal: { kind: 'record', id: 'DREF-000101', type: 'data-reference' },
    package: { kind: 'record', id: 'DREF-000102', type: 'data-reference' },
  } as never)
  vi.mocked(apiClient.createAnalysisRun).mockResolvedValue({ recordId: 'ANR-NEW-9' } as never)
  vi.mocked(apiClient.registerAcquisitionPackage).mockResolvedValue({
    packageRecordId: 'ACQP-NEW-7',
    packagePayload: { id: 'ACQP-NEW-7' },
    entryRecordId: 'ISEN-C-2',
  } as never)
  vi.mocked(apiClient.getConfig).mockResolvedValue({
    storageDevices: [
      { id: 'vast', label: 'Lab NAS (vast)', kind: 'local-mount', default: true },
      { id: 'gc-fid-nas', label: 'GC FID NAS (read-only)', kind: 'local-mount' },
    ],
  } as never)
})

describe('GcSectionChrome — LAZY mount (the D7 pin, bait #5)', () => {
  it('mount makes ZERO calls — gc-methods/revisions fetch only on disclosure open', async () => {
    render(
      wrap(
        <GcSectionChrome
          entries={[ENTRY_WITH_PKG]}
          runId="RUN-C-1"
          sequenceRef={SEQUENCE}
          onEntryUpdated={vi.fn()}
        />,
      ),
    )
    // The disclosure is CLOSED on mount — no fetch, no method list, no
    // revision selector.
    expect(apiClient.listRecordsByKind).not.toHaveBeenCalled()
    expect(apiClient.listAnalysisRevisions).not.toHaveBeenCalled()
    expect(screen.queryByTestId('gc-method-select')).toBeNull()
    expect(screen.queryByTestId('gc-analyze-rev')).toBeNull()
  })

  it('opening the disclosure fetches gc-methods + revisions (user-triggered)', async () => {
    render(
      wrap(
        <GcSectionChrome entries={[]} runId="RUN-C-1" sequenceRef={SEQUENCE} onEntryUpdated={vi.fn()} />,
      ),
    )
    fireEvent.click(screen.getByTestId('gc-chrome-toggle'))
    await screen.findByTestId('gc-method-select')
    expect(apiClient.listRecordsByKind).toHaveBeenCalledWith('gc-method', 500)
    expect(apiClient.listAnalysisRevisions).toHaveBeenCalledTimes(1)
    expect((screen.getByTestId('gc-method-select') as HTMLSelectElement).options.length).toBeGreaterThan(1)
  })
})

describe('GcSectionChrome — D3 method author/select', () => {
  it('the gc-method combobox is data-driven (the lane records) + the Author link is the REAL /registry door', async () => {
    render(
      wrap(
        <GcSectionChrome entries={[]} runId="RUN-C-1" sequenceRef={SEQUENCE} onEntryUpdated={vi.fn()} />,
      ),
    )
    fireEvent.click(screen.getByTestId('gc-chrome-toggle'))
    await screen.findByTestId('gc-method-select')
    // The lane's gc-method is listed by its data-driven label.
    expect(screen.getByTestId('gc-method-select').textContent).toContain('AOAC FAME GC-FID method (demo)')
    // The authoring door is the EXISTING /registry surface (the gc-method UI
    // triplet) — a real link, never a dead /record/new/gc-method.
    const author = screen.getByTestId('gc-method-author')
    expect(author.getAttribute('href')).toBe('/registry')
  })

  it('no gc-methods → a NAMED not-ready reason + a working authoring link (never a disabled form)', async () => {
    vi.mocked(apiClient.listRecordsByKind).mockResolvedValue({ records: [], total: 0 })
    render(
      wrap(
        <GcSectionChrome entries={[]} runId="RUN-C-1" sequenceRef={SEQUENCE} onEntryUpdated={vi.fn()} />,
      ),
    )
    fireEvent.click(screen.getByTestId('gc-chrome-toggle'))
    expect(await screen.findByTestId('gc-method-notready')).toHaveTextContent(/No gc-methods are configured/)
    expect(screen.getByTestId('gc-method-author').getAttribute('href')).toBe('/registry')
    expect(screen.queryByTestId('gc-method-select')).toBeNull()
  })
})

describe('GcSectionChrome — D3 sample add (bait #12: build the chain)', () => {
  it('mints party→request→sample→entry via createRecord and APPENDS the entry ref to the sequence (existing rows preserved)', async () => {
    const onEntryUpdated = vi.fn()
    render(
      wrap(
        <GcSectionChrome entries={[]} runId="RUN-C-1" sequenceRef={SEQUENCE} onEntryUpdated={onEntryUpdated} />,
      ),
    )
    fireEvent.click(screen.getByTestId('gc-chrome-toggle'))
    await screen.findByTestId('gc-method-select')
    fireEvent.change(screen.getByTestId('gc-method-select'), { target: { value: 'GCM-DEMO-AOAC-FAME' } })
    fireEvent.change(screen.getByTestId('gc-sample-label'), { target: { value: 'RES35077-9' } })
    fireEvent.change(screen.getByTestId('gc-sample-vial'), { target: { value: '103' } })
    fireEvent.click(screen.getByTestId('gc-sample-add-btn'))

    await waitFor(() => expect(apiClient.createRecord).toHaveBeenCalledTimes(4))
    // The chain order: party, request, sample, entry (create-last within the
    // add — the entry carries the minted sample ref).
    const schemaTails = vi
      .mocked(apiClient.createRecord)
      .mock.calls.map((c) => c[0].split('/').pop()!)
    expect(schemaTails).toEqual([
      'party.schema.yaml',
      'request.schema.yaml',
      'sample.schema.yaml',
      'instrument-sequence-entry.schema.yaml',
    ])
    // The entry sample add appended the NEW entry ref to the sequence's
    // entryRefs (append-only — BOTH existing rows survive).
    await waitFor(() => expect(apiClient.updateRecord).toHaveBeenCalledTimes(1))
    const [, payload] = vi.mocked(apiClient.updateRecord).mock.calls[0] as unknown as [string, Record<string, unknown>]
    const refs = payload.entryRefs as Array<{ id: string }>
    expect(refs.map((r) => r.id)).toEqual(['ISEN-C-1', 'ISEN-C-2', expect.stringMatching(/^ISEN-/)])
    expect(onEntryUpdated).toHaveBeenCalled()
  })

  it('a missing label/vial renders a NAMED reason (never a silent no-op)', async () => {
    render(
      wrap(
        <GcSectionChrome entries={[]} runId="RUN-C-1" sequenceRef={SEQUENCE} onEntryUpdated={vi.fn()} />,
      ),
    )
    fireEvent.click(screen.getByTestId('gc-chrome-toggle'))
    await screen.findByTestId('gc-method-select')
    fireEvent.change(screen.getByTestId('gc-method-select'), { target: { value: 'GCM-DEMO-AOAC-FAME' } })
    fireEvent.click(screen.getByTestId('gc-sample-add-btn'))
    expect(await screen.findByTestId('gc-chrome-note')).toHaveTextContent(/sample label/)
    expect(apiClient.createRecord).not.toHaveBeenCalled()
  })
})

describe('GcSectionChrome — C NAS attach (the per-entry GcAttachPanel slot)', () => {
  it('an entry WITHOUT a package offers an "Attach .D" affordance that opens the GcAttachPanel', async () => {
    render(
      wrap(
        <GcSectionChrome
          entries={[ENTRY_NO_PKG]}
          runId="RUN-C-1"
          sequenceRef={SEQUENCE}
          onEntryUpdated={vi.fn()}
        />,
      ),
    )
    fireEvent.click(screen.getByTestId('gc-chrome-toggle'))
    await screen.findByTestId('gc-attach-toggle-ISEN-C-2')
    // The closed state shows the NAMED attach-first reason (no dead button).
    expect(screen.getByTestId('gc-analyze-attachfirst-ISEN-C-2')).toHaveTextContent(/Attach a \.D/)
    fireEvent.click(screen.getByTestId('gc-attach-toggle-ISEN-C-2'))
    // The panel opens (device dropdown = CONFIG data — labels, no paths).
    const sel = (await screen.findByTestId('gc-attach-device-ISEN-C-2')) as HTMLSelectElement
    expect(Array.from(sel.options).map((o) => o.textContent)).toEqual(['Lab NAS (vast)', 'GC FID NAS (read-only)'])
    // No Analyze button stands in for the missing package (dead-chrome ban).
    expect(screen.queryByTestId('gc-analyze-btn-ISEN-C-2')).toBeNull()
  })

  it('a successful register closes the panel and triggers the section refetch (onEntryUpdated)', async () => {
    const onEntryUpdated = vi.fn()
    render(
      wrap(
        <GcSectionChrome
          entries={[ENTRY_NO_PKG]}
          runId="RUN-C-1"
          sequenceRef={SEQUENCE}
          onEntryUpdated={onEntryUpdated}
        />,
      ),
    )
    fireEvent.click(screen.getByTestId('gc-chrome-toggle'))
    fireEvent.click(screen.getByTestId('gc-attach-toggle-ISEN-C-2'))
    const sel = (await screen.findByTestId('gc-attach-device-ISEN-C-2')) as HTMLSelectElement
    fireEvent.change(sel, { target: { value: 'gc-fid-nas' } })
    fireEvent.change(screen.getByTestId('gc-attach-key-ISEN-C-2'), { target: { value: '2026-10-28/RES35077-4.D' } })
    fireEvent.click(screen.getByTestId('gc-attach-register-ISEN-C-2'))
    await waitFor(() => expect(apiClient.registerAcquisitionPackage).toHaveBeenCalledTimes(1))
    expect(apiClient.registerAcquisitionPackage).toHaveBeenCalledWith({
      deviceId: 'gc-fid-nas',
      directoryKey: '2026-10-28/RES35077-4.D',
      entryRef: { kind: 'record', id: 'ISEN-C-2', type: 'instrument-sequence-entry' },
    })
    // onAttached: the section refetches so the ACQP ref shows in the table.
    await waitFor(() => expect(onEntryUpdated).toHaveBeenCalled())
  })

  it('an entry WITH a package shows the attached ACQP id (no attach panel needed)', async () => {
    render(
      wrap(
        <GcSectionChrome
          entries={[ENTRY_WITH_PKG]}
          runId="RUN-C-1"
          sequenceRef={SEQUENCE}
          onEntryUpdated={vi.fn()}
        />,
      ),
    )
    fireEvent.click(screen.getByTestId('gc-chrome-toggle'))
    await screen.findByTestId('gc-analyze-entry-ISEN-C-1')
    expect(screen.getByTestId('gc-analyze-entry-ISEN-C-1').textContent).toContain('ACQP-000042')
    expect(screen.queryByTestId('gc-attach-toggle-ISEN-C-1')).toBeNull()
  })
})

describe('GcSectionChrome — E Analyze (verify-first, append-only, GC-11 seam)', () => {
  it('an entry WITH a package: verify-first inputs → createAnalysisRun (pinned inputs) → APPEND the run ref (prior ref survives) → /analysis?run=<new id>', async () => {
    const onEntryUpdated = vi.fn()
    render(
      wrap(
        <GcSectionChrome
          entries={[ENTRY_WITH_PKG]}
          runId="RUN-C-1"
          sequenceRef={SEQUENCE}
          onEntryUpdated={onEntryUpdated}
        />,
      ),
    )
    fireEvent.click(screen.getByTestId('gc-chrome-toggle'))
    await screen.findByTestId('gc-analyze-rev')
    fireEvent.change(screen.getByTestId('gc-analyze-rev'), { target: { value: 'ANREV-C-1' } })
    fireEvent.click(screen.getByTestId('gc-analyze-btn-ISEN-C-1'))

    // The trust boundary (bait #11): the verify-first analysis-inputs route.
    await waitFor(() => expect(apiClient.getPackageAnalysisInputs).toHaveBeenCalledTimes(1))
    expect(apiClient.getPackageAnalysisInputs).toHaveBeenCalledWith('ACQP-000042')
    // The run is CREATED with the pinned (verify-first) inputs.
    await waitFor(() => expect(apiClient.createAnalysisRun).toHaveBeenCalledTimes(1))
    expect(apiClient.createAnalysisRun).toHaveBeenCalledWith({
      title: 'GC run-sheet ISEN-C-1',
      revisionRef: { kind: 'record', id: 'ANREV-C-1', type: 'analysis-revision' },
      inputs: {
        signal: { kind: 'record', id: 'DREF-000101', type: 'data-reference' },
        package: { kind: 'record', id: 'DREF-000102', type: 'data-reference' },
      },
    })
    // RERUN KEEPS HISTORY (bait #8): the entry's PRIOR ref survives and the
    // new ref is APPENDED (never replaced).
    await waitFor(() => expect(apiClient.updateRecord).toHaveBeenCalledTimes(1))
    const [entryId, payload] = vi.mocked(apiClient.updateRecord).mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(entryId).toBe('ISEN-C-1')
    const refs = (payload.analysisRunRefs as Array<{ id: string }>).map((r) => r.id)
    expect(refs).toEqual(['ANR-OLD-1', 'ANR-NEW-9'])
    // The GC-11 seam: the created run IS the results surface.
    await waitFor(() => expect(onEntryUpdated).toHaveBeenCalled())
    const nav = screen.getByTestId('nav-probe').textContent ?? ''
    expect(nav).toBe('/analysis?run=ANR-NEW-9')
    // Execute stays a click on /analysis (bait #5).
    expect(apiClient.executeAnalysisRun).not.toHaveBeenCalled()
  })

  it('no revision selected: a NAMED reason, no analysis-inputs / create calls', async () => {
    render(
      wrap(
        <GcSectionChrome
          entries={[ENTRY_WITH_PKG]}
          runId="RUN-C-1"
          sequenceRef={SEQUENCE}
          onEntryUpdated={vi.fn()}
        />,
      ),
    )
    fireEvent.click(screen.getByTestId('gc-chrome-toggle'))
    await screen.findByTestId('gc-analyze-btn-ISEN-C-1')
    fireEvent.click(screen.getByTestId('gc-analyze-btn-ISEN-C-1'))
    expect(await screen.findByTestId('gc-chrome-note')).toHaveTextContent(/Select an analysis revision/)
    expect(apiClient.getPackageAnalysisInputs).not.toHaveBeenCalled()
    expect(apiClient.createAnalysisRun).not.toHaveBeenCalled()
  })

  it('an entry WITHOUT a package: a NAMED "attach first" reason (never a dead disabled Analyze)', async () => {
    render(
      wrap(
        <GcSectionChrome
          entries={[ENTRY_NO_PKG]}
          runId="RUN-C-1"
          sequenceRef={SEQUENCE}
          onEntryUpdated={vi.fn()}
        />,
      ),
    )
    fireEvent.click(screen.getByTestId('gc-chrome-toggle'))
    await screen.findByTestId('gc-analyze-attachfirst-ISEN-C-2')
    expect(screen.getByTestId('gc-analyze-attachfirst-ISEN-C-2')).toHaveTextContent(/Attach a \.D/)
    // No Analyze button stands in for the missing package (dead-chrome ban).
    expect(screen.queryByTestId('gc-analyze-btn-ISEN-C-2')).toBeNull()
    expect(apiClient.getPackageAnalysisInputs).not.toHaveBeenCalled()
    expect(apiClient.createAnalysisRun).not.toHaveBeenCalled()
  })

  it('no revisions at all: a NAMED reason + a working authoring link (never a disabled Analyze)', async () => {
    vi.mocked(apiClient.listAnalysisRevisions).mockResolvedValue({ revisions: [], total: 0 } as never)
    render(
      wrap(
        <GcSectionChrome
          entries={[ENTRY_WITH_PKG]}
          runId="RUN-C-1"
          sequenceRef={SEQUENCE}
          onEntryUpdated={vi.fn()}
        />,
      ),
    )
    fireEvent.click(screen.getByTestId('gc-chrome-toggle'))
    expect(await screen.findByTestId('gc-revision-notready')).toHaveTextContent(/No analysis revisions/)
    expect(screen.getByTestId('gc-revision-author').getAttribute('href')).toBe('/analysis')
    expect(screen.queryByTestId('gc-analyze-rev')).toBeNull()
  })
})
