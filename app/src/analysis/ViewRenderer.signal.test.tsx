/**
 * L1-SIGNALDREF-1 — SignalView generic content-route tests (RED-first).
 *
 * Rule under test (the architect's ruling, stated declaratively): a view
 * renders its artifact's payload from wherever the artifact data says the
 * payload is. inline present -> render inline (zero regression, zero
 * fetches); else dref-backed (id + dataReferenceRef present) -> resolve the
 * bytes through the ratified OQ-1(a) content route
 * (apiClient.getAnalysisArtifactContent with the AOUT record id — NEVER the
 * dref id; a dref id 400s NOT_ARTIFACT), the same pattern
 * ChromatogramView.tsx:90-113 already ships. A route failure is a NAMED
 * error arm, a payload-free artifact is a NAMED empty arm — never the
 * silent blank polyline (the silent empty polyline IS the defect). Both
 * routes parse through traceModel.parseTraceValue (units come from the
 * data, never literals in the renderer).
 *
 * All unit strings below are TEST DATA.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { apiClient } from '../shared/api/client'
import { ViewRenderer, type RenderableView, type RenderableArtifact } from './ViewRenderer'

vi.mock('../shared/api/client', () => ({ apiClient: { getAnalysisArtifactContent: vi.fn() } }))

const signalView: RenderableView = { id: 'v', title: 'Signal', artifact: 'sig', renderer: 'signal' }

function sigArtifact(inline?: unknown, dref?: { id: string }, id = 'AOUT-000001'): RenderableArtifact {
  return {
    // AOUT-* artifact record id: the content route resolves AOUT ids (the
    // handler 400s NOT_ARTIFACT on a dref id). `dataReferenceRef` only SIGNALS
    // that the bytes live in storage.
    id,
    name: 'sig',
    dataKind: 'signal',
    ...(inline !== undefined ? { inlineValue: inline } : {}),
    ...(dref ? { dataReferenceRef: dref } : {}),
  }
}

function sigValue(n = 11, xMax = 10): { axis: number[]; values: number[]; axis_units: string; value_units: string } {
  const axis: number[] = []
  const values: number[] = []
  const step = xMax / (n - 1)
  for (let i = 0; i < n; i++) {
    const x = i * step
    axis.push(x)
    values.push(Number((0.5 + 3.0 * Math.exp(-0.5 * ((x - xMax / 2) / (xMax / 4)) ** 2)).toFixed(4)))
  }
  return { axis, values, axis_units: 'min', value_units: 'pA' }
}

function signalPoints(): number {
  const svg = screen.getByTestId('view-spec-signal')
  const polyline = svg.querySelector('polyline') as SVGPolylineElement
  const raw = polyline.getAttribute('points') ?? ''
  return raw.trim() ? raw.trim().split(/\s+/).length : 0
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SignalView — dref-backed bytes via the ratified OQ-1(a) route', () => {
  it('fetches with the AOUT id (NOT the dref id) and renders a multi-point polyline', async () => {
    const value = sigValue()
    vi.mocked(apiClient.getAnalysisArtifactContent).mockResolvedValue(value as unknown)
    render(<ViewRenderer view={signalView} artifact={sigArtifact(undefined, { id: 'DREF-000001' })} />)
    const svg = await screen.findByTestId('view-spec-signal')
    expect(svg).toBeDefined()
    expect(signalPoints()).toBeGreaterThan(1)
    expect(apiClient.getAnalysisArtifactContent).toHaveBeenCalledTimes(1)
    expect(apiClient.getAnalysisArtifactContent).toHaveBeenCalledWith('AOUT-000001')
    expect(apiClient.getAnalysisArtifactContent).not.toHaveBeenCalledWith('DREF-000001')
  })

  it('shows the named loading arm while the fetch is pending', async () => {
    let resolveFetch!: (v: unknown) => void
    const pending = new Promise((resolve) => {
      resolveFetch = resolve
    })
    vi.mocked(apiClient.getAnalysisArtifactContent).mockReturnValue(pending as Promise<unknown>)
    render(<ViewRenderer view={signalView} artifact={sigArtifact(undefined, { id: 'DREF-000001' })} />)
    // The named loading arm is visible before the bytes arrive, inside the
    // same view (no blank svg pretending a trace is there).
    expect(screen.getByTestId('view-spec-signal-loading')).toBeDefined()
    expect(screen.queryByTestId('view-spec-signal')).toBeNull()
    // The pending call carries the AOUT id.
    expect(apiClient.getAnalysisArtifactContent).toHaveBeenCalledTimes(1)
    expect(apiClient.getAnalysisArtifactContent).toHaveBeenCalledWith('AOUT-000001')
    // Resolving the fetch completes the trace.
    resolveFetch(sigValue())
    expect(await screen.findByTestId('view-spec-signal')).toBeDefined()
    expect(signalPoints()).toBeGreaterThan(1)
  })

  it('a route failure is a NAMED error arm — never the silent blank polyline', async () => {
    vi.mocked(apiClient.getAnalysisArtifactContent).mockRejectedValue(new Error('storage offline'))
    render(<ViewRenderer view={signalView} artifact={sigArtifact(undefined, { id: 'DREF-000001' })} />)
    const err = await screen.findByTestId('view-spec-signal-error')
    expect(err.textContent).toContain('storage offline')
    expect(screen.queryByTestId('view-spec-signal')).toBeNull()
  })
})

describe('SignalView — no payload by either route', () => {
  it('renders the named empty arm (no inline, no dref) — no svg, no fetch', () => {
    render(<ViewRenderer view={signalView} artifact={sigArtifact()} />)
    expect(screen.getByTestId('view-spec-signal-empty')).toBeDefined()
    expect(screen.getByTestId('view-spec-signal-empty').textContent).toContain('No signal data')
    expect(screen.queryByTestId('view-spec-signal')).toBeNull()
    expect(apiClient.getAnalysisArtifactContent).not.toHaveBeenCalled()
  })

  it('a dref fetch that resolves to an unparseable payload is the named empty arm', async () => {
    vi.mocked(apiClient.getAnalysisArtifactContent).mockResolvedValue({ not: 'a trace' })
    render(<ViewRenderer view={signalView} artifact={sigArtifact(undefined, { id: 'DREF-000001' })} />)
    expect(await screen.findByTestId('view-spec-signal-empty')).toBeDefined()
    expect(screen.queryByTestId('view-spec-signal')).toBeNull()
  })
})

describe('SignalView — inline route preserved (zero regression, zero fetches)', () => {
  it('renders an inline-backed artifact without any content-route fetch', () => {
    render(<ViewRenderer view={signalView} artifact={sigArtifact(sigValue())} />)
    expect(screen.getByTestId('view-spec-signal')).toBeDefined()
    expect(signalPoints()).toBeGreaterThan(1)
    expect(apiClient.getAnalysisArtifactContent).not.toHaveBeenCalled()
  })

  it('an inline payload that fails parseTraceValue (empty axis) is the named empty arm', () => {
    render(<ViewRenderer view={signalView} artifact={sigArtifact({ axis: [], values: [1, 2] })} />)
    expect(screen.getByTestId('view-spec-signal-empty')).toBeDefined()
    expect(screen.queryByTestId('view-spec-signal')).toBeNull()
    expect(apiClient.getAnalysisArtifactContent).not.toHaveBeenCalled()
  })

  it('a non-record inline value is the named empty arm (never a blank svg)', () => {
    render(<ViewRenderer view={signalView} artifact={sigArtifact('just a string')} />)
    expect(screen.getByTestId('view-spec-signal-empty')).toBeDefined()
    expect(screen.queryByTestId('view-spec-signal')).toBeNull()
  })
})

/**
 * Fix run (adversarial review adv-l1-signaldref-1-l1t1805): the async
 * content-route state must be KEYED to the artifact identity. renderViews
 * keys each view on view.id only and AnalysisPage mints ids as `v-${i}` from
 * the SELECTED run's manifest — selecting another run replaces the artifact
 * prop while the SAME mounted SignalView instance (and its state) survives.
 * The rerender legs below reproduce exactly that production shape: one
 * mounted <ViewRenderer>, same view, swapped artifact prop.
 */
describe('SignalView — artifact identity (state keyed to the artifact id)', () => {
  it('dref A resolves, then the artifact prop becomes payload-less: NO stale trace — named empty arm, no extra fetch', async () => {
    vi.mocked(apiClient.getAnalysisArtifactContent).mockResolvedValue(sigValue())
    const { rerender } = render(
      <ViewRenderer view={signalView} artifact={sigArtifact(undefined, { id: 'DREF-000001' })} />,
    )
    expect(await screen.findByTestId('view-spec-signal')).toBeDefined()
    expect(signalPoints()).toBeGreaterThan(1)
    // Same mounted SignalView (same view id/renderer), different artifact:
    // neither inlineValue nor dataReferenceRef.
    rerender(<ViewRenderer view={signalView} artifact={sigArtifact(undefined, undefined, 'AOUT-000003')} />)
    // Run A's trace must NOT be displayed as run B's (AC5: the NAMED empty
    // arm — the bleed is worse than the blank it replaces).
    expect(screen.queryByTestId('view-spec-signal')).toBeNull()
    expect(screen.getByTestId('view-spec-signal-empty').textContent).toContain('No signal data')
    expect(screen.queryByTestId('view-spec-signal-loading')).toBeNull()
    expect(screen.queryByTestId('view-spec-signal-error')).toBeNull()
    // The payload-less artifact triggers no fetch of its own.
    expect(apiClient.getAnalysisArtifactContent).toHaveBeenCalledTimes(1)
    expect(apiClient.getAnalysisArtifactContent).toHaveBeenCalledWith('AOUT-000001')
  })

  it('dref A fails, then the artifact prop becomes inline-backed: inline trace renders, error arm gone (AC1)', async () => {
    vi.mocked(apiClient.getAnalysisArtifactContent).mockRejectedValue(new Error('storage offline'))
    const { rerender } = render(
      <ViewRenderer view={signalView} artifact={sigArtifact(undefined, { id: 'DREF-000001' })} />,
    )
    expect(await screen.findByTestId('view-spec-signal-error')).toBeDefined()
    rerender(<ViewRenderer view={signalView} artifact={sigArtifact(sigValue(), undefined, 'AOUT-000002')} />)
    // The inline route wins; a stale fetch error must never shadow it.
    expect(screen.queryByTestId('view-spec-signal-error')).toBeNull()
    expect(screen.getByTestId('view-spec-signal')).toBeDefined()
    expect(signalPoints()).toBeGreaterThan(1)
    expect(apiClient.getAnalysisArtifactContent).toHaveBeenCalledTimes(1)
  })

  it('a dref fetch that settles to undefined is the named empty arm (settled, not stuck loading)', async () => {
    vi.mocked(apiClient.getAnalysisArtifactContent).mockResolvedValue(undefined)
    render(<ViewRenderer view={signalView} artifact={sigArtifact(undefined, { id: 'DREF-000001' })} />)
    const empty = await screen.findByTestId('view-spec-signal-empty')
    expect(empty.textContent).toContain('No signal data')
    expect(screen.queryByTestId('view-spec-signal-loading')).toBeNull()
    expect(screen.queryByTestId('view-spec-signal')).toBeNull()
  })
})

describe('SignalView — unmount / id-change race (the cancellation contract)', () => {
  it('unmount before resolve: the late resolve is inert (no crash, no console error, no re-fetch)', async () => {
    let resolveFetch!: (v: unknown) => void
    const pending = new Promise((resolve) => {
      resolveFetch = resolve
    })
    vi.mocked(apiClient.getAnalysisArtifactContent).mockReturnValue(pending as Promise<unknown>)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = render(
      <ViewRenderer view={signalView} artifact={sigArtifact(undefined, { id: 'DREF-000001' })} />,
    )
    expect(apiClient.getAnalysisArtifactContent).toHaveBeenCalledTimes(1)
    unmount()
    await act(async () => {
      resolveFetch(sigValue())
    })
    // Unmount did not retrigger a fetch; the late resolve (guarded by the
    // on flag) produced no state update and no console error.
    expect(apiClient.getAnalysisArtifactContent).toHaveBeenCalledTimes(1)
    expect(errSpy).not.toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('id change before A resolves and A settles AFTER B: only the current artifact\'s trace renders (stale resolve cannot win)', async () => {
    let resolveA!: (v: unknown) => void
    const pendingA = new Promise((resolve) => {
      resolveA = resolve
    })
    const valueB = { axis: [0, 1, 2], values: [1, 2, 1], axis_units: 'min', value_units: 'pA' }
    vi.mocked(apiClient.getAnalysisArtifactContent).mockImplementation((id: string) => {
      if (id === 'AOUT-000001') return pendingA as Promise<unknown>
      return Promise.resolve(valueB)
    })
    const { rerender } = render(
      <ViewRenderer view={signalView} artifact={sigArtifact(undefined, { id: 'DREF-000001' })} />,
    )
    // Switch to artifact B while A's fetch is still pending.
    rerender(<ViewRenderer view={signalView} artifact={sigArtifact(undefined, { id: 'DREF-000002' }, 'AOUT-000002')} />)
    // B's bytes arrive first: B's 3-point trace renders.
    expect(await screen.findByTestId('view-spec-signal')).toBeDefined()
    expect(signalPoints()).toBe(3)
    // A's stale bytes arrive LATE and must be ignored (the on flag + the
    // forId key): B's 3-point trace is what stays on screen, never A's 11.
    await act(async () => {
      resolveA(sigValue())
    })
    expect(screen.getByTestId('view-spec-signal')).toBeDefined()
    expect(signalPoints()).toBe(3)
    expect(apiClient.getAnalysisArtifactContent).toHaveBeenCalledTimes(2)
    expect(apiClient.getAnalysisArtifactContent).toHaveBeenCalledWith('AOUT-000002')
  })
})
