/**
 * GC-10 [C] — ChromatogramView tests (spec §D2/§D5 + acceptance "zoom
 * drag-select, pan, reset, hover readout, RT/peak markers, row<->trace sync,
 * explicit axes from artifact-carried units; decimation visual-only").
 *
 * All unit strings and field names here are TEST DATA; the component itself
 * carries none (the bait #7 pin is in traceModel.test.ts + the source-pin
 * below).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { apiClient } from '../shared/api/client'
import { ChromatogramView } from './ChromatogramView'

vi.mock('../shared/api/client', () => ({ apiClient: { getAnalysisArtifactContent: vi.fn() } }))

// Test-local geometry (mirrors the component's fixed viewBox — data, not a
// production coupling): W=720, PAD_L=52, PLOT_W=654.
const W = 720
const PAD_L = 52
const PLOT_W = 654

// jsdom has no ResizeObserver: a minimal spy whose stored callback the tests
// fire (synchronously, inside React act) to simulate a measured pane width.
// The callback receives the RESIZE-OBSERVER entry LIST (the component reads
// entries[0].contentRect.width) — the stub mirrors that shape.
type ROEntry = { contentRect: { width: number } }
const resizeObservers: Array<(entries: ROEntry[]) => void> = []
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
  constructor(cb: (entries: ROEntry[]) => void) {
    resizeObservers.push(cb)
  }
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  resizeObservers.length = 0
  vi.clearAllMocks()
  // jsdom has no layout: stub the SVG rect so pointer math is deterministic.
  const svgProto = SVGElement.prototype as unknown as { getBoundingClientRect: () => unknown }
  vi.spyOn(svgProto, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: W,
    height: 280,
    x: 0,
    y: 0,
    right: W,
    bottom: 280,
    toJSON: () => ({}),
  } as DOMRect)
})

function sigValue(n = 21, xMax = 10): { axis: number[]; values: number[]; axis_units: string; value_units: string } {
  const axis: number[] = []
  const values: number[] = []
  const step = xMax / (n - 1)
  for (let i = 0; i < n; i++) {
    const x = i * step
    axis.push(x)
    // A smooth peak at x=2 (value 3.5) so the hover readout is unambiguous.
    values.push(Number((0.5 + 3.0 * Math.exp(-0.5 * ((x - 2) / 0.8) ** 2)).toFixed(4)))
  }
  return { axis, values, axis_units: 'min', value_units: 'pA' }
}

function sigArtifact(inline?: unknown, dref?: { id: string }) {
  return {
    // AOUT-* artifact record id (the content route resolves AOUT ids —
    // `dataReferenceRef` only SIGNALS the dref-backed storage).
    id: 'AOUT-000001',
    name: 'trace',
    dataKind: 'signal',
    ...(inline !== undefined ? { inlineValue: inline } : {}),
    ...(dref ? { dataReferenceRef: dref } : {}),
  }
}

const peakTableArtifact = {
  id: 'AOUT-000002',
  name: 'peak_table',
  dataKind: 'table',
  inlineValue: {
    columns: [{ name: 'peak' }, { name: 'rt_min' }, { name: 'saturated' }, { name: 'flags' }],
    rows: [
      { peak: 'P1', rt_min: 1.0, saturated: false, flags: [] },
      { peak: 'P2', rt_min: 3.0, saturated: true, flags: ['UNRECOVERABLE_SATURATED'] },
      { peak: 'P3', rt_min: null, saturated: false, flags: [] },
    ],
  },
}

const MARKER_BINDINGS = { markersFrom: 'peak_table' }

function root(): HTMLElement {
  return screen.getByTestId('view-spec-chromatogram')
}

describe('ChromatogramView — rendering + axes from data-carried units', () => {
  it('renders the interactive view with axis labels from the payload units (test-local pA/min)', () => {
    render(<ChromatogramView artifact={sigArtifact(sigValue())} />)
    const el = root()
    expect(screen.getByTestId('chromatogram-svg')).toBeDefined()
    expect(screen.getByTestId('chromatogram-reset')).toBeDefined()
    // Axis unit labels are DATA (the payload's unit strings), rendered verbatim.
    expect(el.textContent).toContain('min')
    expect(el.textContent).toContain('pA')
    // The full domain is the data extent (0:10).
    expect(el.getAttribute('data-x-domain')).toBe('0:10')
    // No dref -> the content route is NOT called.
    expect(apiClient.getAnalysisArtifactContent).not.toHaveBeenCalled()
  })

  it('renders a named empty state when there is no payload (never a thrown render)', () => {
    render(<ChromatogramView artifact={sigArtifact()} />)
    expect(screen.getByTestId('chromatogram-empty').textContent).toContain('No trace data')
  })
})

describe('ChromatogramView — zoom drag-select / pan / reset', () => {
  it('plain drag sets the x-domain to the selection; reset restores the full data extent', async () => {
    render(<ChromatogramView artifact={sigArtifact(sigValue())} />)
    const svg = screen.getByTestId('chromatogram-svg')
    const full = { x0: 0, x1: 10 }
    const pxToX = (px: number) => full.x0 + ((px - PAD_L) / PLOT_W) * (full.x1 - full.x0)

    // Drag from px 200 -> px 400 (a 200px selection on a 654px plot).
    fireEvent.mouseDown(svg, { clientX: 200 })
    fireEvent.mouseMove(svg, { clientX: 400 })
    expect(screen.getByTestId('chromatogram-selection')).toBeDefined()
    fireEvent.mouseUp(svg, { clientX: 400 })

    const el = root()
    const [zx0, zx1] = (el.getAttribute('data-x-domain') ?? '').split(':').map(Number)
    expect(zx0).toBeCloseTo(pxToX(200), 6)
    expect(zx1).toBeCloseTo(pxToX(400), 6)
    expect(zx1 - zx0).toBeLessThan(full.x1 - full.x0)

    // Reset restores the FULL extent (the data extent, not the spec).
    fireEvent.click(screen.getByTestId('chromatogram-reset'))
    expect(root().getAttribute('data-x-domain')).toBe('0:10')
    await waitFor(() => expect(screen.queryByTestId('chromatogram-selection')).toBeNull())
  })

  it('shift-drag pans the domain (translates, does not rescale the span)', () => {
    render(<ChromatogramView artifact={sigArtifact(sigValue())} />)
    const svg = screen.getByTestId('chromatogram-svg')
    const full = { x0: 0, x1: 10 }
    const spanPerPx = (full.x1 - full.x0) / PLOT_W
    const PAN = 120

    fireEvent.mouseDown(svg, { clientX: 300, shiftKey: true })
    fireEvent.mouseMove(svg, { clientX: 300 + PAN, shiftKey: true })
    const el = root()
    const [x0, x1] = (el.getAttribute('data-x-domain') ?? '').split(':').map(Number)
    expect(x0).toBeCloseTo(full.x0 - PAN * spanPerPx, 6)
    expect(x1).toBeCloseTo(full.x1 - PAN * spanPerPx, 6)
    expect(x1 - x0).toBeCloseTo(full.x1 - full.x0, 6) // span preserved
  })
})

describe('ChromatogramView — hover readout (raw points, data units)', () => {
  it('shows the nearest RAW point with the data-carried unit strings', () => {
    const value = sigValue(21, 10)
    render(<ChromatogramView artifact={sigArtifact(value)} />)
    const svg = screen.getByTestId('chromatogram-svg')
    const full = { x0: 0, x1: 10 }
    const x = 2.0
    const px = PAD_L + ((x - full.x0) / (full.x1 - full.x0)) * PLOT_W

    fireEvent.mouseMove(svg, { clientX: px })
    const readout = screen.getByTestId('chromatogram-readout')
    // x is exact (a sample sits at 2.0); the y is the RAW value at that index.
    const rawY = value.values.find((_, i) => value.axis[i] === x)!
    expect(readout.textContent).toContain('min')
    expect(readout.textContent).toContain('pA')
    expect(readout.textContent).toContain(String(rawY))
  })
})

describe('ChromatogramView — RT/peak markers + row<->trace sync (two-way)', () => {
  it('renders markers from the sibling peak table; saturated rows get a distinct style + flags; null-rt rows are skipped visibly', () => {
    render(
      <ChromatogramView
        artifact={sigArtifact(sigValue())}
        bindings={MARKER_BINDINGS}
        siblings={[peakTableArtifact]}
      />,
    )
    // P1 + P2 plotted; P3 (null rt) skipped with a count line.
    expect(screen.getByTestId('chromatogram-marker-0')).toBeDefined()
    expect(screen.getByTestId('chromatogram-marker-1')).toBeDefined()
    expect(screen.queryByTestId('chromatogram-marker-2')).toBeNull()
    expect(screen.getByTestId('chromatogram-skipped').textContent).toContain('1')

    // Saturated honesty: P2 is visually distinct + its reason codes are the
    // DATA carried in flags (rendered, never re-typed by the component).
    const m1 = screen.getByTestId('chromatogram-marker-1')
    expect(m1.getAttribute('class')).toContain('chromatogram__marker--saturated')
    const row1 = screen.getByTestId('chromatogram-row-1')
    expect(row1.textContent).toContain('UNRECOVERABLE_SATURATED')
    expect(row1.textContent).toContain('saturated')
  })

  it('row-click highlights the marker and marker-click highlights the row (two-way)', () => {
    render(
      <ChromatogramView
        artifact={sigArtifact(sigValue())}
        bindings={MARKER_BINDINGS}
        siblings={[peakTableArtifact]}
      />,
    )
    // Row -> marker.
    fireEvent.click(screen.getByTestId('chromatogram-row-0'))
    expect(screen.getByTestId('chromatogram-marker-0').getAttribute('class')).toContain('chromatogram__marker--active')
    // Marker -> row.
    fireEvent.click(screen.getByTestId('chromatogram-marker-1'))
    expect(screen.getByTestId('chromatogram-row-1').getAttribute('class')).toContain('chromatogram__row--active')
    expect(screen.getByTestId('chromatogram-marker-1').getAttribute('class')).toContain('chromatogram__marker--active')
  })
})

describe('ChromatogramView — decimation is visual-only (D5 pin)', () => {
  it('renders O(width) SVG points for a 72k-point trace; the droppedCount line is declared; the readout snaps to RAW points', () => {
    const n = 72_000
    const axis = Array.from({ length: n }, (_, i) => i * (10 / (n - 1)))
    const values = Array.from({ length: n }, (_, i) => 0.5 + Math.sin(i / 50) + 2 * Math.exp(-0.5 * ((axis[i]! - 5) / 0.05) ** 2))
    render(<ChromatogramView artifact={sigArtifact({ axis, values, axis_units: 'min', value_units: 'pA' })} />)

    const svg = screen.getByTestId('chromatogram-svg')
    const polyline = svg.querySelector('polyline.chromatogram__trace') as SVGPolylineElement
    const pointCount = polyline.getAttribute('points')!.trim().split(/\s+/).length
    // O(width): at most 2 x plot-pixel-buckets — nowhere near 72k.
    expect(pointCount).toBeLessThanOrEqual(2 * PLOT_W)
    // The declared UI line carries the droppedCount.
    const decim = screen.getByTestId('chromatogram-decimated')
    expect(decim.textContent).toContain('decimating')
    expect(decim.textContent).toContain(String(n - pointCount < n ? n - pointCount : 0))

    // Readout-on-raw: hover at the peak (x=5) -> the component snaps to the
    // nearest RAW sample and renders ITS array value (not a decimated bucket
    // endpoint). The expected string is derived from the RAW array itself.
    const rawI = axis.reduce((bi, _v, i) => (Math.abs(axis[i]! - 5) < Math.abs(axis[bi]! - 5) ? i : bi), 0)
    const rawY = Math.round(values[rawI]! * 1000) / 1000
    expect(rawY).not.toBeCloseTo(1.956, 2) // guard: not the fabricated peak top
    const svgEl = screen.getByTestId('chromatogram-svg')
    const px = PAD_L + ((5 - 0) / 10) * PLOT_W
    fireEvent.mouseMove(svgEl, { clientX: px })
    const readout = screen.getByTestId('chromatogram-readout')
    expect(readout.textContent).toContain(String(rawY))
    expect(readout.textContent).toContain('pA')
  })
})

describe('ChromatogramView — dref-backed bytes via the ratified OQ-1(a) route', () => {
  it('fetches through apiClient.getAnalysisArtifactContent with the AOUT id (NOT the dref id) and renders the full-resolution trace', async () => {
    // Client-shaped value: the route's `content` field UNWRAPPED (the stored
    // JSON PARSED — the client method does the res.json() + envelope unwrap).
    const value = sigValue()
    vi.mocked(apiClient.getAnalysisArtifactContent).mockResolvedValue(value as unknown)
    render(<ChromatogramView artifact={sigArtifact(undefined, { id: 'DREF-000001' })} />)
    expect(await screen.findByTestId('chromatogram-svg')).toBeDefined()
    expect(apiClient.getAnalysisArtifactContent).toHaveBeenCalledTimes(1)
    // The content route resolves AOUT-* ids (a DREF id would 400 NOT_ARTIFACT):
    // the fetch carries the artifact's AOUT record id.
    expect(apiClient.getAnalysisArtifactContent).toHaveBeenCalledWith('AOUT-000001')
  })

  it('a route failure is a NAMED error — never a silent fallback (bait #13)', async () => {
    vi.mocked(apiClient.getAnalysisArtifactContent).mockRejectedValue(new Error('storage offline'))
    render(<ChromatogramView artifact={sigArtifact(undefined, { id: 'DREF-000001' })} />)
    const err = await screen.findByTestId('chromatogram-error')
    expect(err.textContent).toContain('storage offline')
    expect(screen.queryByTestId('chromatogram-svg')).toBeNull()
  })
})

describe('ChromatogramView — B1 pane-fit: renders at 1:1 CSS px per SVG unit (spec §5 B1)', () => {
  function fireMeasuredWidth(px: number) {
    act(() => {
      for (const cb of resizeObservers) cb([{ contentRect: { width: px } }])
    })
  }

  it('at the shipped pane width (534 px) the svg viewBox width is the MEASURED width and the scale factor is 1', () => {
    render(<ChromatogramView artifact={sigArtifact(sigValue())} />)
    // The 534 px pane is the FAME-LAYOUT-1 measured .analysis-right width at
    // the shipped 1440x900 viewport — simulate the measurement (jsdom cannot
    // layout): the pre-fix geometry would leave the viewBox at the fixed 720
    // (scale 534/720 = 0.742 — the defect) and this assertion would fail.
    fireMeasuredWidth(534)
    const svg = screen.getByTestId('chromatogram-svg')
    expect(svg.getAttribute('viewBox')).toBe('0 0 534 280')
    // ~1:1: viewBox width == the width the pane gives the svg (width="100%").
    expect(Number(svg.getAttribute('viewBox')!.split(' ')[2])).toBe(534)
    // The plot still occupies the pane width with the fixed H (280) and keeps
    // the tick count: at least 4 x-tick labels render.
    expect(svg.querySelectorAll('text.chromatogram__ticklabel').length).toBeGreaterThanOrEqual(4)
    expect(root().getAttribute('data-width')).toBe('534')
  })

  it('unmeasured (jsdom zero-rect) falls back to the fixed 720 viewBox — the old behaviour, unchanged for tests without a measurement', () => {
    render(<ChromatogramView artifact={sigArtifact(sigValue())} />)
    const svg = screen.getByTestId('chromatogram-svg')
    expect(svg.getAttribute('viewBox')).toBe('0 0 720 280')
    expect(root().getAttribute('data-width')).toBe('720')
  })

  it('a later pane resize re-derives the geometry (the width is live, not a mount-time constant)', () => {
    render(<ChromatogramView artifact={sigArtifact(sigValue())} />)
    fireMeasuredWidth(534)
    expect(screen.getByTestId('chromatogram-svg').getAttribute('viewBox')).toBe('0 0 534 280')
    fireMeasuredWidth(800)
    expect(screen.getByTestId('chromatogram-svg').getAttribute('viewBox')).toBe('0 0 800 280')
  })
})

describe('ChromatogramView hardcode boundary (bait #7 source-pin)', () => {
  it('prod ChromatogramView.tsx carries zero unit/domain literals (beyond the sanctioned field-name const)', () => {
    const source = readFileSync('src/analysis/ChromatogramView.tsx', 'utf8')
    // The DEFAULT_MARKER_FIELDS table is the single sanctioned exception
    // (shipped column names held as data, spec §D2). Strip it before checking.
    const stripped = source.replace(/export const DEFAULT_MARKER_FIELDS[\s\S]*?\} as const/, '')
    // Bare-substring bans: full domain-name tokens only. (Bare short unit
    // tokens like 'AU' would false-positive on English words — e.g. 'DEFAULT'
    // — so unit literals are policed by the QUOTED-literal checks below.)
    for (const banned of [
      'pA',
      "axis_units: '",
      "value_units: '",
      'baseline_correction',
      'timed_event',
      'ChemStation',
      'FAME',
      'signal_plus_baseline',
      'UNRECOVERABLE_SATURATED',
    ]) {
      expect(stripped, `forbidden literal ${banned}`).not.toContain(banned)
    }
    // Unit tokens never appear as quoted literals outside the sanctioned const.
    for (const unit of ['pA', 'AU', 'min']) {
      expect(stripped, `forbidden quoted unit literal '${unit}'`).not.toMatch(new RegExp(`['"\`]${unit}['"\`]`))
    }
  })
})
