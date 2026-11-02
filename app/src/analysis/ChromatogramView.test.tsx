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
// production coupling): W=720, PAD_L=72 (FAME-8 GATEFIX1 B1-crowding: the left
// inset widened 52->72 so the rotated y-unit clears the widest y-tick; the
// component's PAD_L is the single source of truth and these constants track
// it), PLOT_W=634 (= 720 - 72 - 14).
const W = 720
const PAD_L = 72
const PLOT_W = 634

// jsdom has no ResizeObserver: a minimal spy whose stored callback the tests
// fire (synchronously, inside React act) to simulate a measured pane width.
// The callback receives the RESIZE-OBSERVER entry LIST (the component reads
// entries[0].contentRect.width) — the stub mirrors that shape.
type ROEntry = { contentRect: { width: number } }
// `disconnected` counts teardowns (D1: the cleanup still disconnects).
const resizeObservers: Array<(entries: ROEntry[]) => void> = []
let roDisconnects = 0
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
  constructor(cb: (entries: ROEntry[]) => void) {
    resizeObservers.push(cb)
  }
  observe() {}
  disconnect() {
    roDisconnects++
  }
  unobserve() {}
}

beforeEach(() => {
  resizeObservers.length = 0
  roDisconnects = 0
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

  // D1 (fix run 1): the LIVE path. Every campaign chromatogram is dref-backed
  // (ANR-000041 → signal_plus_baseline via dataReferenceRef), so the FIRST
  // commit is the "Loading trace…" early-return div, which does NOT carry the
  // wrapper ref. The pane-fit observer must engage WHEN the measured wrapper
  // actually mounts (content arrived after the pending fetch) — a mount-time
  // effect keyed on [] read the null ref and never re-ran (the reviewer probe:
  // inline control = 1 observer, dref = 0, viewBox stuck at "0 0 720 280").
  it('dref-backed path (fetch pending on mount, content arrives after): the observer installs at chart mount and the measured width drives the viewBox', async () => {
    const value = sigValue()
    let resolveContent!: (v: unknown) => void
    const content = new Promise<unknown>((resolve) => {
      resolveContent = resolve
    })
    vi.mocked(apiClient.getAnalysisArtifactContent).mockReturnValue(content)
    const { unmount } = render(<ChromatogramView artifact={sigArtifact(undefined, { id: 'DREF-000001' })} />)
    // First commit is the loading early-return (no chart, NO wrapper ref):
    // nothing measurable yet and no observer installed.
    expect(screen.getByTestId('chromatogram-empty').textContent).toContain('Loading trace')
    expect(screen.queryByTestId('chromatogram-svg')).toBeNull()
    expect(resizeObservers.length).toBe(0)

    // Content arrives AFTER mount (the pending fetch resolves outside the
    // first commit — exactly the live dref shape).
    await act(async () => {
      resolveContent(value)
    })
    const svg = await screen.findByTestId('chromatogram-svg')
    const el = screen.getByTestId('view-spec-chromatogram')
    // The wrapper div now exists and the ResizeObserver is INSTALLED on it —
    // this is the load-bearing assertion: at base (mount-time [] effect over
    // a null ref) resizeObservers.length is 0 here.
    expect(resizeObservers.length).toBe(1)
    // Unmeasured fallback holds until the pane reports a width: H stays 280.
    expect(svg.getAttribute('viewBox')).toBe('0 0 720 280')
    expect(el.getAttribute('data-width')).toBe('720')

    // The pane reports its width (simulated; jsdom cannot layout) and the
    // MEASURED width drives the viewBox — the pane engages post-mount.
    fireMeasuredWidth(534)
    expect(svg.getAttribute('viewBox')).toBe('0 0 534 280')
    expect(el.getAttribute('data-width')).toBe('534')
    expect(svg.querySelectorAll('text.chromatogram__ticklabel').length).toBeGreaterThanOrEqual(4)

    // The cleanup still disconnects (the observer's teardown runs on unmount).
    unmount()
    expect(roDisconnects).toBeGreaterThanOrEqual(1)
  })
})

describe('ChromatogramView — B1-crowding (FAME-8 GATEFIX1): the rotated y-unit clears the widest y-tick', () => {
  it('the rotated y-unit label strip does not overlap the widest y-tick label (the pA/7.80e+4 crowding)', () => {
    // jsdom has no font metrics (getBBox is unreliable), so this guard is
    // GEOMETRIC on the rendered x-attributes + one declared constant: the 9px
    // MONOSPACE tick font (chromatogram__ticklabel, AnalysisPage.css) advances
    // 0.6em == 5.4px per char, and the 10px monospace unit advances ~6px
    // (these are font declarations in CSS — data, not production coupling).
    // The y-tick labels are right-anchored at x=PAD_L-8; the rotated y-unit
    // sits at x=12 (a short strip at the plot's vertical center). The widest
    // 7-char tick ("7.80e+4") must not reach the unit's strip.
    const MONO_ADVANCE_9PX = 5.4
    // A wide y-range so the widest tick is a 7-char exponential (the live
    // "7.80e+4" case the gate measured).
    const axis = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    const values = [1, 1, 1, 40000, 78000, 40000, 1, 1, 1, 1]
    render(<ChromatogramView artifact={sigArtifact({ axis, values, axis_units: 'min', value_units: 'pA' })} />)
    const svg = screen.getByTestId('chromatogram-svg')
    const yTicks = [...svg.querySelectorAll('text.chromatogram__ticklabel')].filter(
      (t) => t.getAttribute('text-anchor') === 'end',
    )
    expect(yTicks.length).toBeGreaterThanOrEqual(4)
    // The unit label is the one axislabel that carries a rotate transform.
    const unit = [...svg.querySelectorAll('text.chromatogram__axislabel')].find(
      (t) => (t.getAttribute('transform') ?? '').startsWith('rotate('),
    )
    expect(unit, 'the rotated y-unit label must render').toBeDefined()
    const unitX = Number(unit!.getAttribute('x'))
    const unitStrip = { left: unitX - 6.5, right: unitX + 6.5 } // ~13px-wide rotated strip
    // The widest tick label (by char count == by width in a monospace font).
    let widest = yTicks[0]
    for (const t of yTicks) if ((t.textContent ?? '').length > (widest.textContent ?? '').length) widest = t
    const widestChars = (widest.textContent ?? '').length
    expect(widestChars).toBeGreaterThanOrEqual(7) // a 7.80e+4-style tick
    const tickRight = Number(widest.getAttribute('x')) // right-anchored
    const tickLeft = tickRight - widestChars * MONO_ADVANCE_9PX
    // The crowding guard: the tick's left edge must not reach the unit strip.
    expect(tickLeft, `widest tick "${widest.textContent}" (left=${tickLeft.toFixed(1)}) must clear the y-unit strip [${unitStrip.left}, ${unitStrip.right}]`).toBeGreaterThan(unitStrip.right)
  })
})

describe('ChromatogramView — B2 unit ownership: units on the axis title only, never per-cell (spec §5 B2)', () => {
  it('the RT unit appears exactly ONCE in the table header; the tick labels and the RT cells carry no unit (xUnit = min)', () => {
    render(
      <ChromatogramView
        artifact={sigArtifact(sigValue())}
        bindings={MARKER_BINDINGS}
        siblings={[peakTableArtifact]}
      />,
    )
    const el = root()
    // (i) container text carries the xUnit at most twice: the x-axis title +
    // the RT header (the yUnit 'pA' is a different string).
    const unitCount = (el.textContent ?? '').split('min').length - 1
    expect(unitCount).toBe(2)
    // (ii) no tick label contains the unit string.
    const svg = screen.getByTestId('chromatogram-svg')
    for (const t of svg.querySelectorAll('text.chromatogram__ticklabel')) {
      expect(t.textContent).not.toContain('min')
    }
    // (iii) no RT cell (the 2nd td of every row) contains the unit — numeric
    // only (the pre-fix per-cell `${fmt(m.rt)}${xUnit ? ` ${xUnit}` : ''}`
    // append is gone).
    const table = el.querySelector('table.chromatogram__table')!
    for (const tr of table.querySelectorAll('tbody tr')) {
      const rtCell = tr.querySelectorAll('td')[1]
      expect(rtCell.textContent).not.toContain('min')
    }
  })

  it('the table has a thead whose RT header carries the unit ONCE, derived from the passed-in unit string (data, not a literal)', () => {
    render(
      <ChromatogramView
        artifact={sigArtifact(sigValue())}
        bindings={MARKER_BINDINGS}
        siblings={[peakTableArtifact]}
      />,
    )
    const table = root().querySelector('table.chromatogram__table')!
    const head = table.querySelector('thead')
    expect(head).not.toBeNull()
    // The RT column header is the fixed human label 'RT' with the unit once,
    // derived from the passed-in unit string (data, not a literal).
    const headers = Array.from(head!.querySelectorAll('th')).map((th) => th.textContent)
    expect(headers).toContain('RT (min)')
    // Exactly one header cell carries the unit.
    expect(headers.filter((h) => h.includes('min')).length).toBe(1)
  })

  it('a second fixture with xUnit = s renders the unit from the DATA (not a literal): the header says RT (s)', () => {
    const valueS = { axis: [0, 1, 2], values: [1, 3, 1], axis_units: 's', value_units: 'pA' }
    render(
      <ChromatogramView
        artifact={sigArtifact(valueS)}
        bindings={MARKER_BINDINGS}
        siblings={[peakTableArtifact]}
      />,
    )
    const table = root().querySelector('table.chromatogram__table')!
    const headers = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent)
    expect(headers).toContain('RT (s)')
    expect(headers).not.toContain('RT (min)')
  })
})

describe('ChromatogramView — B3 saturation declared, never computed (spec §5 B3)', () => {
  const satTrueRow = { peak: 'P1', rt_min: 1.0, saturated: true, flags: [] }
  const flagOnlySatRow = { peak: 'P2', rt_min: 3.0, saturated: false, flags: ['UNRECOVERABLE_SATURATED'] }
  const flagOnlyOverlapRow = { peak: 'P3', rt_min: 4.0, saturated: false, flags: ['OVERLAP_SHARED_BASELINE'] }

  function peakTable(rows: Array<Record<string, unknown>>) {
    return { id: 'AOUT-000002', name: 'peak_table', dataKind: 'table', inlineValue: { rows } }
  }

  function saturatedTraceIds() {
    const el = root()
    return Array.from(el.querySelectorAll('[data-testid^="chromatogram-marker-"]'))
      .filter((g) => (g.getAttribute('class') ?? '').includes('chromatogram__marker--saturated'))
      .map((g) => g.getAttribute('data-testid'))
  }

  it('boolean true marks the trace marker with a VISIBLE word (the colour-only class is no longer the whole indicator)', () => {
    render(
      <ChromatogramView
        artifact={sigArtifact(sigValue())}
        bindings={MARKER_BINDINGS}
        siblings={[peakTable([satTrueRow, flagOnlyOverlapRow])]}
      />,
    )
    const marked = saturatedTraceIds()
    expect(marked).toEqual(['chromatogram-marker-0'])
    // The marker group carries the textual indicator (visible with the CSS
    // disabled / greyscale — a word, not colour alone): the data-carried
    // saturated field value rendered verbatim.
    expect(screen.getByTestId('chromatogram-marker-0').textContent).toContain('saturated')
    // The legend line names the indicator (text).
    expect(screen.getByTestId('chromatogram-saturation-legend').textContent).toContain('saturated')
  })

  it('flags-only + declared token (markerSaturationFlags) marks the row; an UNDECLARED token (OVERLAP_SHARED_BASELINE) does not', () => {
    render(
      <ChromatogramView
        artifact={sigArtifact(sigValue())}
        bindings={{ ...MARKER_BINDINGS, markerSaturationFlags: ['UNRECOVERABLE_SATURATED'] }}
        siblings={[peakTable([flagOnlySatRow, flagOnlyOverlapRow])]}
      />,
    )
    expect(saturatedTraceIds()).toEqual(['chromatogram-marker-0'])
  })

  it('flags-only + NO declaration is NOT marked (never guessed from arbitrary flags)', () => {
    render(
      <ChromatogramView
        artifact={sigArtifact(sigValue())}
        bindings={MARKER_BINDINGS}
        siblings={[peakTable([flagOnlySatRow])]}
      />,
    )
    expect(saturatedTraceIds()).toEqual([])
    expect(screen.queryByTestId('chromatogram-saturation-legend')).toBeNull()
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
