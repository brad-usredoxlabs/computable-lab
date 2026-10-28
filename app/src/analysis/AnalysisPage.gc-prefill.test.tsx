/**
 * GC-12 (deliverable E) — the `?gc=` prefill consumer on /analysis (the
 * run-sheet Analyze landing).
 *
 * The run-sheet's Analyze button builds an ids-only handoff (bait #10 —
 * revisionRef + the verify-first pinned input ids from the analysis-inputs
 * route + a title; NEVER payloads) and navigates `/analysis?gc=<json>`. This
 * one-shot consumer (a SIBLING to the GC-11 `?run=` deep link — own done-ref,
 * own strip; it does NOT touch selectRun) lands it: it selects the named
 * revision (the EXISTING GC-9 selection effect then renders the generated
 * ParameterForm — the seam is the selection, not a re-implemented form) and
 * stashes the pinned inputs so createRun freezes them into the new run (bait
 * #11: the analysis-inputs route was the trust boundary; the URL carries the
 * ids it returned, and the run gets those ids — not an empty object).
 *
 * Pinned here:
 *  - param-present: the named revision is preselected, the title is
 *    prefilled, the GC-9 ParameterForm renders from the revision's
 *    parameterSchema, the `?gc=` param is stripped (one-shot), and Execute /
 *    createAnalysisRun are NOT called on mount (execute stays a click — bait
 *    #5);
 *  - createRun freezes the PINNED inputs (the signal/package dref ids) into
 *    the run, not {};
 *  - param-ABSENT: zero prefill side effects — the create form behaves
 *    EXACTLY as before (the no-execute accounting suite stays green
 *    unmodified; param-absent = zero calls);
 *  - a malformed or unknown-revision param never crashes and never prefills.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useSearchParams } from 'react-router-dom'
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
  },
}))

const GC_REV = {
  recordId: 'ANREV-GC-1',
  payload: {
    id: 'ANREV-GC-1',
    title: 'GC FID integration (gc7 revision)',
    // A test-local parameterSchema with a default so the form is seedable and
    // the gate stays open (no required-missing block) — the form rendering is
    // the EXISTING GC-9 ParameterForm, driven by the selection.
    parameterSchema: {
      type: 'object',
      required: ['model'],
      properties: {
        model: { type: 'string', enum: ['linear', 'quadratic'], default: 'linear' },
        peak_width_s: { type: 'number', default: 5 },
      },
    },
  },
}

function gcParam(revisionId: string, inputs: Record<string, { kind: 'record'; id: string; type: string }>, title: string) {
  return encodeURIComponent(
    JSON.stringify({
      title,
      revisionRef: { kind: 'record', type: 'analysis-revision', id: revisionId },
      inputs,
    }),
  )
}

const PINNED_INPUTS: Record<string, { kind: 'record'; id: string; type: string }> = {
  signal: { kind: 'record', id: 'DREF-000101', type: 'data-reference' },
  package: { kind: 'record', id: 'DREF-000102', type: 'data-reference' },
}

/** Probes the LIVE search params (the stripped-param assertion). */
function GcParamProbe() {
  const [sp] = useSearchParams()
  return <span data-testid="gc-param-probe">{sp.get('gc') ?? ''}</span>
}

function wrap(ui: React.ReactNode, initialPath = '/analysis') {
  return (
    <ThemeProvider>
      <OpenTabsProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <GcParamProbe />
          {ui}
        </MemoryRouter>
      </OpenTabsProvider>
    </ThemeProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiClient.listAnalysisRevisions).mockResolvedValue({ revisions: [GC_REV], total: 1 })
  vi.mocked(apiClient.listAnalysisRuns).mockResolvedValue({ runs: [], total: 0 })
  vi.mocked(apiClient.createAnalysisRun).mockResolvedValue({
    success: true,
    recordId: 'ANR-GC-NEW',
    run: { id: 'ANR-GC-NEW' },
  } as never)
})

describe('GC-12 E — the `?gc=` prefill consumer (the run-sheet Analyze landing)', () => {
  it('param-present: prefills the revision + title + pinned inputs, renders the GC-9 form, strips the param, and mounts read-only (no execute/create)', async () => {
    const path = `/analysis?gc=${gcParam('ANREV-GC-1', PINNED_INPUTS, 'FAME sheet run 10/28')}`
    render(wrap(<AnalysisPage />, path))
    await screen.findByTestId('analysis-page')

    // The named revision is preselected (the seam the GC-9 form hangs off).
    await waitFor(() => {
      expect((screen.getByTestId('analysis-run-rev') as HTMLSelectElement).value).toBe('ANREV-GC-1')
    })
    // The title is prefilled into the run-title input.
    expect((screen.getByTestId('analysis-run-title') as HTMLInputElement).value).toBe('FAME sheet run 10/28')
    // The GC-9 generated ParameterForm renders from the revision's
    // parameterSchema (the selection effect seeded it; we did NOT re-implement
    // the form).
    expect(await screen.findByTestId('analysis-param-model')).toBeDefined()
    // The one-shot strip: the `?gc=` param is gone from the URL.
    await waitFor(() => {
      expect(screen.getByTestId('gc-param-probe').textContent).toBe('')
    })
    // Mount is read-only (bait #5): no execute, no createAnalysisRun, no
    // getAnalysisRun (this is a NEW-run prefill, not the ?run= landing).
    expect(apiClient.executeAnalysisRun).not.toHaveBeenCalled()
    expect(apiClient.createAnalysisRun).not.toHaveBeenCalled()
    expect(apiClient.getAnalysisRun).not.toHaveBeenCalled()
  })

  it('createRun freezes the PINNED verify-first inputs into the run (not an empty object — bait #11)', async () => {
    const path = `/analysis?gc=${gcParam('ANREV-GC-1', PINNED_INPUTS, 'FAME sheet run 10/28')}`
    render(wrap(<AnalysisPage />, path))
    await screen.findByTestId('analysis-page')
    await waitFor(() => {
      expect((screen.getByTestId('analysis-run-rev') as HTMLSelectElement).value).toBe('ANREV-GC-1')
    })
    fireEvent.click(screen.getByTestId('analysis-run-create-btn'))
    await waitFor(() => expect(apiClient.createAnalysisRun).toHaveBeenCalledTimes(1))
    const arg = vi.mocked(apiClient.createAnalysisRun).mock.calls[0][0]
    expect(arg.title).toBe('FAME sheet run 10/28')
    expect(arg.revisionRef).toEqual({ kind: 'record', id: 'ANREV-GC-1', type: 'analysis-revision' })
    // The pinned inputs ride the run — the verify-first dref ids, verbatim.
    expect(arg.inputs).toEqual(PINNED_INPUTS)
  })

  it('param-ABSENT: zero prefill side effects (the create form behaves EXACTLY as before — the no-execute gate)', async () => {
    render(wrap(<AnalysisPage />, '/analysis'))
    await screen.findByTestId('analysis-page')
    // No revision preselected (the form is the empty "Select method…" default).
    expect((screen.getByTestId('analysis-run-rev') as HTMLSelectElement).value).toBe('')
    // The run-title input is empty (no prefill).
    expect((screen.getByTestId('analysis-run-title') as HTMLInputElement).value).toBe('')
    // A plain createRun here carries the EXACT pre-GC-12 semantics (inputs {}).
    // (Select a revision first so the create button is enabled.)
    fireEvent.change(screen.getByTestId('analysis-run-rev'), { target: { value: 'ANREV-GC-1' } })
    fireEvent.click(screen.getByTestId('analysis-run-create-btn'))
    await waitFor(() => expect(apiClient.createAnalysisRun).toHaveBeenCalledTimes(1))
    const arg = vi.mocked(apiClient.createAnalysisRun).mock.calls[0][0]
    expect(arg.inputs).toEqual({})
  })

  it('a malformed `?gc=` param never crashes and never prefills (the param is left for the user, no state set)', async () => {
    render(wrap(<AnalysisPage />, '/analysis?gc=not-json-at-all'))
    await screen.findByTestId('analysis-page')
    expect((screen.getByTestId('analysis-run-rev') as HTMLSelectElement).value).toBe('')
    expect((screen.getByTestId('analysis-run-title') as HTMLInputElement).value).toBe('')
    expect(apiClient.executeAnalysisRun).not.toHaveBeenCalled()
    expect(apiClient.createAnalysisRun).not.toHaveBeenCalled()
  })

  it('an unknown revisionRef in a legal `?gc=` param never prefills (no fabricated selection)', async () => {
    const path = `/analysis?gc=${gcParam('ANREV-DOES-NOT-EXIST', PINNED_INPUTS, 'orphan')}`
    render(wrap(<AnalysisPage />, path))
    await screen.findByTestId('analysis-page')
    expect((screen.getByTestId('analysis-run-rev') as HTMLSelectElement).value).toBe('')
    expect((screen.getByTestId('analysis-run-title') as HTMLInputElement).value).toBe('')
    expect(apiClient.createAnalysisRun).not.toHaveBeenCalled()
  })
})
