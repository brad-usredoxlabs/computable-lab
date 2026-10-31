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
import { render, screen } from '@testing-library/react'
import { apiClient } from '../shared/api/client'
import { ViewRenderer, type RenderableView, type RenderableArtifact } from './ViewRenderer'

vi.mock('../shared/api/client', () => ({ apiClient: { getAnalysisArtifactContent: vi.fn() } }))

const signalView: RenderableView = { id: 'v', title: 'Signal', artifact: 'sig', renderer: 'signal' }

function sigArtifact(inline?: unknown, dref?: { id: string }): RenderableArtifact {
  return {
    // AOUT-* artifact record id: the content route resolves AOUT ids (the
    // handler 400s NOT_ARTIFACT on a dref id). `dataReferenceRef` only SIGNALS
    // that the bytes live in storage.
    id: 'AOUT-000001',
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
