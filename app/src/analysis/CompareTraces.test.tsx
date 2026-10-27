/**
 * GC-10 [D] — CompareTraces tests (spec §D4):
 *  - prominent multi-run selection -> overlay on ONE axis pair, two distinct
 *    stroke colours + legend rows naming both runs
 *  - hide/show: axes recompute from VISIBLE traces only; colours are STABLE
 *    (the pinned stability leg)
 *  - incompatible axes are REJECTED with named conflicts; a declared
 *    conversion (factor + unit) clears EXACTLY its conflict — and nothing is
 *    rescaled before the entry (the raw polylines are unchanged)
 *  - Save as view writes ONE server-validated view-spec pinning the AOUT ids
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { apiClient } from '../shared/api/client'
import { CompareTraces } from './CompareTraces'

vi.mock('../shared/api/client', () => ({
  apiClient: {
    listRecordsByKind: vi.fn(),
    getAnalysisRun: vi.fn(),
    getAnalysisArtifactContent: vi.fn(),
    createRecord: vi.fn(),
    getRecord: vi.fn(),
  },
}))

function manifest(artifacts: Array<{ name: string; dataKind: string; value: unknown }>, refs: Record<string, { artifactRecordId: string }>) {
  return {
    artifacts,
    views: [],
    metrics: [],
    artifactRefs: refs,
  }
}

const RUN_A = {
  recordId: 'ANR-000001',
  payload: {
    id: 'ANR-000001',
    title: 'Run A',
    status: 'succeeded',
    outputManifest: manifest(
      [{ name: 'sig', dataKind: 'signal', value: { axis: [0, 1, 2], values: [0, 2, 0], axis_units: 'min', value_units: 'pA' } }],
      { sig: { artifactRecordId: 'AOUT-000001' } },
    ),
    outputArtifactRefs: [{ kind: 'record', id: 'AOUT-000001', type: 'analysis-output-artifact' }],
  },
}

function runB(value: { axis: number[]; values: number[]; axis_units: string; value_units: string }, title = 'Run B') {
  return {
    recordId: 'ANR-000002',
    payload: {
      id: 'ANR-000002',
      title,
      status: 'succeeded',
      outputManifest: manifest([{ name: 'sig', dataKind: 'signal', value }], { sig: { artifactRecordId: 'AOUT-000002' } }),
      outputArtifactRefs: [{ kind: 'record', id: 'AOUT-000002', type: 'analysis-output-artifact' }],
    },
  }
}

const RUN_B_AU = runB({ axis: [0, 1, 2], values: [0, 3, 0], axis_units: 'min', value_units: 'AU' })
const RUN_B_PA = runB({ axis: [0, 1, 2], values: [0, 5, 0], axis_units: 'min', value_units: 'pA' })

const RUNS = [
  { recordId: 'ANR-000001', title: 'Run A', status: 'succeeded' },
  { recordId: 'ANR-000002', title: 'Run B', status: 'succeeded' },
]

/** Render with the standard list mock + a chosen run-B payload. */
function setup(runBOverride: typeof RUN_B_PA | typeof RUN_B_AU) {
  vi.mocked(apiClient.listRecordsByKind).mockResolvedValue({ records: [], total: 0 })
  vi.mocked(apiClient.getAnalysisRun).mockImplementation(async (id: string) => {
    const rec = id === 'ANR-000001' ? RUN_A : runBOverride
    return { record: { recordId: rec.recordId, payload: rec.payload } }
  })
  render(<CompareTraces runs={RUNS} open onClose={() => {}} />)
}

async function selectBoth(): Promise<void> {
  fireEvent.click(screen.getByTestId('compare-run-expand-ANR-000001'))
  fireEvent.click(screen.getByTestId('compare-run-expand-ANR-000002'))
  await waitFor(() => expect(screen.queryByTestId('compare-loading')).toBeNull())
  fireEvent.click(screen.getByTestId('compare-select-AOUT-000001'))
  fireEvent.click(screen.getByTestId('compare-select-AOUT-000002'))
  // Both artifacts resolved once the legend rows exist (the traces state is
  // set; the overlay/conFLICT rendering follows from the gate — asserted
  // per-test).
  await waitFor(() => expect(screen.getByTestId('compare-trace-AOUT-000001')).toBeDefined())
  await waitFor(() => expect(screen.getByTestId('compare-trace-AOUT-000002')).toBeDefined())
}

function polylineFor(aoutId: string): HTMLElement {
  return screen.getByTestId(`compare-trace-polyline-${aoutId}`)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CompareTraces — multi-run overlay on ONE axis pair', () => {
  it('selects one trace from each of two runs -> one shared axis pair, two distinct colours, legend rows naming both runs', async () => {
    setup(RUN_B_PA)
    await selectBoth()
    const svg = screen.getByTestId('compare-overlay-svg')
    expect(polylineFor('AOUT-000001')).toBeDefined()
    expect(polylineFor('AOUT-000002')).toBeDefined()
    expect(polylineFor('AOUT-000001').getAttribute('stroke')).not.toBe(polylineFor('AOUT-000002').getAttribute('stroke'))
    // ONE shared axis pair (union of the visible extents).
    expect(svg.getAttribute('data-x-domain')).toBe('0:2')
    // Legend rows carry the data labels (run title + artifact name).
    const legend = screen.getByTestId('compare-legend')
    expect(within(legend).getByTestId('compare-trace-AOUT-000001').textContent).toContain('Run A')
    expect(within(legend).getByTestId('compare-trace-AOUT-000002').textContent).toContain('Run B')
    // Axis unit labels are the DATA-carried strings (verbatim).
    expect(svg.querySelector('.compare-overlay__axislabel')?.textContent).toBe('min')
  })
})

describe('CompareTraces — incompatible axes: rejected, or a declared conversion', () => {
  it('pA vs AU is a NAMED conflict (the overlay is not drawn until resolved) and NOTHING is rescaled before a conversion is entered', async () => {
    setup(RUN_B_AU)
    await selectBoth()
    const conflict = screen.getByTestId('trace-compare-axis-conflict')
    expect(conflict.textContent).toContain('pA')
    expect(conflict.textContent).toContain('AU')
    expect(conflict.textContent.toLowerCase()).toContain('no automatic conversion')
    // The overlay is NOT drawn while the gate is red — the rejection is the
    // visible, named state (no hidden rescaling/normalization behind it).
    expect(screen.queryByTestId('compare-overlay-svg')).toBeNull()
    // Save is disabled while the gate is red.
    expect((screen.getByTestId('compare-save') as HTMLButtonElement).disabled).toBe(true)
    // The declared-conversion inputs are offered (the only door).
    expect(screen.getByTestId('compare-conv-factor-AOUT-000002')).toBeDefined()
  })

  it('entering a declared conversion (factor 1000, toUnit pA) clears exactly the y-unit conflict', async () => {
    setup(RUN_B_AU)
    await selectBoth()
    expect(screen.getByTestId('trace-compare-axis-conflict')).toBeDefined()
    // Enter the conversion for the AU trace (AOUT-000002).
    fireEvent.change(screen.getByTestId('compare-conv-factor-AOUT-000002'), { target: { value: '1000' } })
    fireEvent.change(screen.getByTestId('compare-conv-tounit-AOUT-000002'), { target: { value: 'pA' } })
    fireEvent.change(screen.getByTestId('compare-conv-declaredby-AOUT-000002'), { target: { value: 'brad' } })
    await waitFor(() => expect(screen.queryByTestId('trace-compare-axis-conflict')).toBeNull())
    // The y-axis now spans to the CONVERTED extent (3 * 1000 = 3000) — the
    // declared factor is the only arithmetic applied.
    const svg = screen.getByTestId('compare-overlay-svg')
    const [y0, y1] = (svg.getAttribute('data-y-domain') ?? '').split(':').map(Number)
    expect(y1).toBeCloseTo(3000, 0)
    expect(y0).toBeLessThan(y1)
    // Save is now enabled (gate green).
    expect((screen.getByTestId('compare-save') as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('CompareTraces — show/hide: axes recompute from VISIBLE only; colours are stable', () => {
  it('hiding a trace rescales the axes to the visible trace and does NOT recolour the remaining one', async () => {
    setup(RUN_B_PA)
    await selectBoth()
    const svg = screen.getByTestId('compare-overlay-svg')
    const colorA = polylineFor('AOUT-000001').getAttribute('stroke')!
    expect(colorA).toBeTruthy()

    // Hide B.
    fireEvent.click(screen.getByTestId('compare-visibility-AOUT-000002'))
    await waitFor(() => expect(screen.getByTestId('compare-overlay-svg').querySelectorAll('polyline').length).toBe(1))
    // Axes recomputed from A only (A peaks at 2, not B's 5).
    expect(svg.getAttribute('data-y-domain')).toBe('0:2')
    // A's colour is UNCHANGED after the hide (stability leg).
    expect(polylineFor('AOUT-000001').getAttribute('stroke')).toBe(colorA)
    // Re-show B: both colours return to what they were (B is recoloured to its
    // stable palette rank, A keeps its colour).
    fireEvent.click(screen.getByTestId('compare-visibility-AOUT-000002'))
    await waitFor(() => expect(screen.getByTestId('compare-overlay-svg').querySelectorAll('polyline').length).toBe(2))
    expect(polylineFor('AOUT-000001').getAttribute('stroke')).toBe(colorA)
    expect(polylineFor('AOUT-000002').getAttribute('stroke')).not.toBe(colorA)
  })
})

describe('CompareTraces — Save as view (ONE server-validated view-spec pinning the AOUT ids)', () => {
  it('saves one view-spec record (renderer trace-compare, AOUT refs in bindings) and lists it back', async () => {
    vi.mocked(apiClient.createRecord).mockResolvedValue({
      record: { recordId: 'VSPEC-000001', payload: {} },
      validation: {},
      lint: {},
    } as never)
    setup(RUN_B_PA)
    await selectBoth()
    const btn = screen.getByTestId('compare-save')
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(btn)
    await waitFor(() => expect(screen.getByTestId('compare-save-result').textContent).toContain('VSPEC-000001'))
    expect(apiClient.createRecord).toHaveBeenCalledTimes(1)
    const [schemaId, payload] = vi.mocked(apiClient.createRecord).mock.calls[0]!
    expect(schemaId).toBe('https://computable-lab.com/schema/computable-lab/view-spec.schema.yaml')
    const p = payload as { kind: string; renderer: string; bindings: { traces: Array<{ artifactRef: { id: string } }> } }
    expect(p.kind).toBe('view-spec')
    expect(p.renderer).toBe('trace-compare')
    expect(p.bindings.traces.map((t) => t.artifactRef.id).sort()).toEqual(['AOUT-000001', 'AOUT-000002'])
    // The saved panel lists the new comparison back (both pinned ids).
    const saved = screen.getByTestId('compare-saved-VSPEC-000001')
    expect(saved.textContent).toContain('AOUT-000001')
    expect(saved.textContent).toContain('AOUT-000002')
  })
})

describe('CompareTraces — saved comparison reload restores declared conversions (D3, verification 5g)', () => {
  // A saved comparison whose two traces carry DIFFERENT units (pA vs AU) can
  // only have been stored while the gate was green — i.e. the AU trace carried
  // a declared conversion into the record. On reload, `loadSaved` must seed
  // `conversions` from the SAVED spec, or the gate re-raises the mismatch and
  // the overlay opens red/blank. This test proves the overlay re-renders
  // WITHOUT re-entering any conversion input.
  const SAVED_SPEC = {
    recordId: 'VSPEC-000001',
    payload: {
      renderer: 'trace-compare',
      id: 'VSPEC-000001',
      title: 'Saved pA vs AU',
      bindings: {
        traces: [
          { artifactRef: { id: 'AOUT-000001' } },
          { artifactRef: { id: 'AOUT-000002' }, conversion: { factor: 1000, toUnit: 'pA', declaredBy: 'brad' } },
        ],
      },
    },
  }
  const AOUT_1 = {
    recordId: 'AOUT-000001',
    payload: {
      kind: 'analysis-output-artifact',
      name: 'sig',
      inlineValue: { axis: [0, 1, 2], values: [0, 2, 0], axis_units: 'min', value_units: 'pA' },
    },
  }
  const AOUT_2 = {
    recordId: 'AOUT-000002',
    payload: {
      kind: 'analysis-output-artifact',
      name: 'sig',
      inlineValue: { axis: [0, 1, 2], values: [0, 3, 0], axis_units: 'min', value_units: 'AU' },
    },
  }

  it('save -> reload re-renders the overlay from the seeded conversion (gate green, inputs pre-filled, no re-entry)', async () => {
    vi.mocked(apiClient.listRecordsByKind).mockResolvedValue({ records: [SAVED_SPEC as never], total: 1 })
    vi.mocked(apiClient.getRecord).mockImplementation(async (id: string) =>
      Promise.resolve((id === 'AOUT-000001' ? AOUT_1 : AOUT_2) as never),
    )
    render(<CompareTraces runs={RUNS} open onClose={() => {}} />)

    // The saved comparison is listed; load it (the D4 "Load" button).
    const loadBtn = await screen.findByTestId('compare-saved-load-VSPEC-000001')
    fireEvent.click(loadBtn)

    // The overlay re-renders from the pinned AOUT ids.
    await waitFor(() => expect(screen.getByTestId('compare-overlay-svg')).toBeDefined())
    expect(screen.getByTestId('compare-trace-polyline-AOUT-000001')).toBeDefined()
    expect(screen.getByTestId('compare-trace-polyline-AOUT-000002')).toBeDefined()

    // The gate is GREEN: the seeded declared conversion cleared the pA vs AU
    // mismatch, so NO conflict is re-raised on reload.
    expect(screen.queryByTestId('trace-compare-axis-conflict')).toBeNull()

    // The declared conversion is SEEDED into the inputs from the saved spec —
    // not re-entered. This is the D3 pin: reload restores the conversion.
    expect((screen.getByTestId('compare-conv-factor-AOUT-000002') as HTMLInputElement).value).toBe('1000')
    expect((screen.getByTestId('compare-conv-tounit-AOUT-000002') as HTMLInputElement).value).toBe('pA')
    expect((screen.getByTestId('compare-conv-declaredby-AOUT-000002') as HTMLInputElement).value).toBe('brad')

    // The y-axis spans to the CONVERTED extent (3 * 1000 = 3000): the declared
    // factor is applied on reload, not re-derived by re-entering inputs.
    const svg = screen.getByTestId('compare-overlay-svg')
    const [, y1] = (svg.getAttribute('data-y-domain') ?? '').split(':').map(Number)
    expect(y1).toBeCloseTo(3000, 0)
  })
})

describe('CompareTraces hardcode boundary (bait #7 source-pin)', () => {
  it('prod CompareTraces.tsx carries no unit/domain literals (beyond test data)', () => {
    const source = readFileSync('src/analysis/CompareTraces.tsx', 'utf8')
    for (const banned of ['baseline_correction', 'timed_event', 'ChemStation', 'FAME', 'signal_plus_baseline', 'UNRECOVERABLE_SATURATED']) {
      expect(source, `forbidden literal ${banned}`).not.toContain(banned)
    }
    // Quoted unit literals never appear (units arrive as data).
    for (const unit of ['pA', 'AU', 'min']) {
      expect(source, `forbidden quoted unit literal '${unit}'`).not.toMatch(new RegExp(`['"\`]${unit}['"\`]`))
    }
  })
})
