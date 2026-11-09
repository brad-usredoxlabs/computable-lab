/**
 * GC-10 [A] — traceModel.ts RED-first test (spec §D3 + first-targeted-check).
 *
 * This file is committed BEFORE the module exists — the initial run must fail
 * with "Cannot find module './traceModel'", proving the pure-core approach
 * (axis-compat + decimation + colour stability) before any SVG is written.
 *
 * Hard lines pinned here (spec §D5 + reviewer bait #7/#8/#10):
 *  - checkAxes rejects mismatched data-carried unit strings; a conflict clears
 *    ONLY under a scientist-declared conversion; NO implicit factor discovery.
 *  - applyDeclaredConversion is the ONLY place arithmetic touches values, and
 *    only under declared data; omitted conversion -> byte-identical trace.
 *  - decimateForRender is PURE over inputs (never rewrites the source arrays)
 *    and output flows into SVG geometry only (visual-only decimation).
 *  - colour is a deterministic function of the spec's trace list sorted by
 *    artifact record id — never random, stable under toggle/reorder churn.
 *  - saved payloads OMIT absent optional keys (bait #10).
 *  - NO unit literals: every unit string in this file is test DATA.
 */
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { apiClient } from '../shared/api/client'
import {
  TRACES_PALETTE,
  applyDeclaredConversion,
  buildCompareViewSpecPayload,
  checkAxes,
  colorForTraceInSet,
  decimateForRender,
  extractTrace,
  mintViewSpecId,
  parseChromatogramBindings,
  parseCompareBindings,
  parseMarkerRows,
  parseTraceValue,
  stableTraceOrder,
  type DeclaredConversion,
  type FetchContent,
  type Trace,
} from './traceModel'

function trace(partial: Partial<Trace> & { recordId: string }): Trace {
  return {
    runId: 'ANR-000001',
    runTitle: 'run',
    artifactName: 'trace',
    axis: [0, 1, 2],
    values: [0, 1, 0],
    ...partial,
  } as Trace
}

/** A minimal fetchContent spy (test-local; the prod caller is the OQ-1(a) client method).
 *  CLIENT-SHAPED: the real channel returns the route's `content` field UNWRAPPED
 *  (a parsed payload object — never a raw JSON string). */
function spyFetch(content: unknown = null): { fn: (artifactRecordId: string) => Promise<unknown>; calls: string[] } {
  const calls: string[] = []
  return { calls, fn: async (id: string) => { calls.push(id); return content } }
}

describe('traceModel.parseChromatogramBindings / parseCompareBindings (D6 named guards)', () => {
  it('accepts well-formed chromatogram bindings; unknown keys are KEPT + audited', () => {
    const res = parseChromatogramBindings({
      markersFrom: 'peak_table',
      markerRtField: 'rt_min',
      someFutureKey: 42,
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value.markersFrom).toBe('peak_table')
      expect(res.value.markerRtField).toBe('rt_min')
      expect(res.value.audit).toEqual(['someFutureKey'])
    }
  })

  it('a non-string known key is a NAMED error (refusing to guess)', () => {
    const res = parseChromatogramBindings({ markersFrom: { nested: true } })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error.path).toBe('bindings.markersFrom')
      expect(res.error.message).toContain('refusing to guess')
    }
  })

  // B3 (item 250TH-8): the DECLARED saturation-flag token list is a known,
  // ARRAY-typed binding key. It arrives as DATA (a string[]); a non-array or
  // non-string-element value is a NAMED error (never a guessed token list).
  it('markerSaturationFlags (the B3 declared token list) is accepted as a string[]', () => {
    const res = parseChromatogramBindings({
      markersFrom: 'peak_table',
      markerSaturationFlags: ['UNRECOVERABLE_SATURATED'],
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value.markerSaturationFlags).toEqual(['UNRECOVERABLE_SATURATED'])
      expect(res.value.audit).toEqual([])
    }
  })

  it('markerSaturationFlags that is NOT a string[] is a NAMED error (no default token list)', () => {
    const bad = parseChromatogramBindings({ markerSaturationFlags: 'UNRECOVERABLE_SATURATED' })
    expect(bad.ok).toBe(false)
    if (!bad.ok) {
      expect(bad.error.path).toBe('bindings.markerSaturationFlags')
      expect(bad.error.message).toContain('string[]')
    }
    const notStrings = parseChromatogramBindings({ markerSaturationFlags: [1, 2] })
    expect(notStrings.ok).toBe(false)
  })

  it('accepts well-formed compare bindings (traces + conversion + axisUnits)', () => {
    const res = parseCompareBindings({
      traces: [
        { artifactRef: { kind: 'record', id: 'AOUT-000001', type: 'analysis-output-artifact' } },
        {
          artifactRef: { id: 'AOUT-000002' },
          label: 'sample B',
          conversion: { factor: 1000, toUnit: 'pA', declaredBy: 'brad' },
        },
      ],
      axisUnits: { x: 'min', y: 'pA' },
      unknown: 'x',
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value.traces.map((t) => t.artifactId)).toEqual(['AOUT-000001', 'AOUT-000002'])
      expect(res.value.traces[1]?.conversion).toEqual({ factor: 1000, toUnit: 'pA', declaredBy: 'brad' })
      expect(res.value.axisUnits).toEqual({ x: 'min', y: 'pA' })
      expect(res.value.audit).toContain('unknown')
    }
  })

  it('a malformed conversion factor is a NAMED error naming the path', () => {
    const res = parseCompareBindings({
      traces: [
        { artifactRef: { id: 'AOUT-000001' } },
        { artifactRef: { id: 'AOUT-000002' }, conversion: { factor: '1000', toUnit: 'pA', declaredBy: 'brad' } },
      ],
    })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error.path).toBe('bindings.traces[1].conversion.factor')
      expect(res.error.message).toContain('not a number')
    }
  })

  it('a missing artifactRef.id is a NAMED error', () => {
    const res = parseCompareBindings({ traces: [{ label: 'no ref' }] })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.path).toBe('bindings.traces[0].artifactRef.id')
  })

  it('a non-array traces key is a NAMED error', () => {
    const res = parseCompareBindings({ traces: 'AOUT-000001' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.path).toBe('bindings.traces')
  })

  it('empty/undefined bindings parse to an empty trace list (a legal compare shape)', () => {
    expect(parseCompareBindings(undefined).ok).toBe(true)
    expect(parseCompareBindings({}).ok).toBe(true)
  })
})

describe('traceModel.mintViewSpecId (runner max+1 rule, F2 :433-447)', () => {
  it('mints VSPEC-000001 from an empty list', () => {
    expect(mintViewSpecId([])).toBe('VSPEC-000001')
  })

  it('mints max+1 from existing ids (non-matching ids ignored)', () => {
    expect(mintViewSpecId(['VSPEC-000042', 'other-1', 'VSPEC-000009'])).toBe('VSPEC-000043')
  })
})

describe('traceModel hardcode boundary (bait #7 — CI-owned grep pin)', () => {
  // The prod module contains ZERO unit literals and ZERO domain-name literals:
  // units arrive from the artifact payloads; field names arrive as data.
  // Long tokens are substring-checked; unit tokens are checked as QUOTED
  // literals (Math.min / minI are code, not unit values — not a violation).
  it('prod traceModel.ts carries no unit or domain literals', () => {
    const source = readFileSync('src/analysis/traceModel.ts', 'utf8')
    for (const banned of [
      'baseline_correction',
      'timed_event',
      'ChemStation',
      'FAME',
      'signal_plus_baseline',
      'rt_min',
      'peak_table',
      'UNRECOVERABLE_SATURATED',
    ]) {
      expect(source, `forbidden literal ${banned}`).not.toContain(banned)
    }
    for (const unit of ['pA', 'AU', 'min']) {
      expect(source, `forbidden quoted unit literal '${unit}'`).not.toMatch(new RegExp(`['"]${unit}['"]`))
    }
    // No implicit scaling constant (bait #8: any *1e3-style constant is a defect).
    expect(source, 'forbidden implicit scale constant').not.toMatch(/\b1e3\b|\b1000\b|\* ?1000\b/)
  })
})

describe('traceModel.checkAxes (same-axes gate — rejected or declared conversion, never hidden)', () => {
  it('two traces with matching data-carried units pass', () => {
    const a = trace({ recordId: 'AOUT-000001', xUnit: 'min', yUnit: 'pA' })
    const b = trace({ recordId: 'AOUT-000002', xUnit: 'min', yUnit: 'pA' })
    expect(checkAxes([a, b])).toEqual({ ok: true, conflicts: [] })
  })

  it('mismatched y units conflict (UNIT_MISMATCH) and NOTHING is normalized — the traces are untouched', () => {
    const axisA = [0, 1, 2]
    const valuesA = [1, 2, 3]
    const a = trace({ recordId: 'AOUT-000001', xUnit: 'min', yUnit: 'pA', axis: axisA, values: valuesA })
    const b = trace({ recordId: 'AOUT-000002', xUnit: 'min', yUnit: 'AU', values: [5, 6, 7] })
    const res = checkAxes([a, b])
    expect(res.ok).toBe(false)
    if (!res.ok) {
      const c = res.conflicts[0]
      expect(c.code).toBe('UNIT_MISMATCH')
      expect(c.axis).toBe('y')
      expect(c.seen).toEqual(['pA', 'AU'])
    }
    // Byte-identity on conflict: the conflict state changed nothing about the
    // data (bait #8 — the reviewer will verify exactly this).
    expect(a.axis).toBe(axisA)
    expect(a.values).toBe(valuesA)
    expect(a.values).toEqual([1, 2, 3])
  })

  it('absent unit on any trace is a conflict (UNIT_UNDECLARED) — never assumed', () => {
    const a = trace({ recordId: 'AOUT-000001', xUnit: 'min', yUnit: 'pA' })
    const b = trace({ recordId: 'AOUT-000002', xUnit: 'min' })
    const res = checkAxes([a, b])
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.conflicts).toHaveLength(1)
      expect(res.conflicts[0]!.code).toBe('UNIT_UNDECLARED')
      expect(res.conflicts[0]!.axis).toBe('y')
    }
  })

  it('a declared conversion clears exactly its own conflict; no implicit factor discovery', () => {
    const a = trace({ recordId: 'AOUT-000001', xUnit: 'min', yUnit: 'pA' })
    const b = trace({ recordId: 'AOUT-000002', xUnit: 'min', yUnit: 'AU' })
    const conv: DeclaredConversion = { factor: 1000, toUnit: 'pA', declaredBy: 'scientist' }
    const res = checkAxes([a, b], { [b.recordId]: conv })
    expect(res).toEqual({ ok: true, conflicts: [] })
    // A conversion that does NOT reach the matching unit stays a conflict.
    const wrong = checkAxes([a, b], { [b.recordId]: { factor: 2, toUnit: 'AU', declaredBy: 'scientist' } })
    expect(wrong.ok).toBe(false)
  })

  it('a non-numeric axis value is AXIS_NOT_NUMERIC', () => {
    const a = trace({ recordId: 'AOUT-000001', xUnit: 'min', yUnit: 'pA', axis: [0, 1, 2] })
    // A malformed payload (non-numeric axis cell) is data arriving from a
    // JSON artifact — checkAxes is the defensive gate, so the fixture
    // simulates that shape with an explicit cast (NOT a number[] lie).
    const b = { ...trace({ recordId: 'AOUT-000002', xUnit: 'min', yUnit: 'pA' }), axis: [0, 'x', 2] } as unknown as Trace
    const res = checkAxes([a, b])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.conflicts.some((c) => c.code === 'AXIS_NOT_NUMERIC')).toBe(true)
  })

  it('x extents may differ freely (no resampling — the overlay uses the union of extents)', () => {
    const a = trace({ recordId: 'AOUT-000001', xUnit: 'min', yUnit: 'pA', axis: [0, 10] })
    const b = trace({ recordId: 'AOUT-000002', xUnit: 'min', yUnit: 'pA', axis: [2, 7] })
    expect(checkAxes([a, b])).toEqual({ ok: true, conflicts: [] })
  })
})

describe('traceModel.applyDeclaredConversion (the ONLY declared arithmetic)', () => {
  it('multiplies the values and renames the unit under declared data only', () => {
    const t = trace({ recordId: 'AOUT-000001', yUnit: 'AU', values: [1, 2, 3] })
    const out = applyDeclaredConversion(t, { factor: 1000, toUnit: 'pA', declaredBy: 'scientist' })
    expect(out.values).toEqual([1000, 2000, 3000])
    expect(out.yUnit).toBe('pA')
    expect(out.conversion?.declaredBy).toBe('scientist')
    // The input trace is never mutated.
    expect(t.values).toEqual([1, 2, 3])
    expect(t.yUnit).toBe('AU')
  })

  it('omitted conversion leaves the trace byte-identical (no hidden rescaling)', () => {
    const axis = [0.5, 1.5]
    const values = [7, 9]
    const t = trace({ recordId: 'AOUT-000001', axis, values })
    const out = applyDeclaredConversion(t)
    expect(out.axis).toBe(axis)
    expect(out.values).toBe(values)
    expect(out).toEqual(t)
  })
})

describe('traceModel.decimateForRender (visual-only, pure over inputs)', () => {
  it('returns the full slice for data smaller than the pixel width', () => {
    const axis = [0, 1, 2]
    const values = [0, 1, 0]
    const res = decimateForRender(axis, values, 640)
    expect(res.indices).toEqual([0, 1, 2])
    expect(res.droppedCount).toBe(0)
  })

  it('preserves the per-bucket min/max pair (peaks survive), bounds point count, counts dropped', () => {
    // 10 points into width 5 -> 5 buckets; every bucket is a [max, min] pair.
    const axis = Array.from({ length: 10 }, (_, i) => i)
    const values = [0, 1, 0, 9, 0, 0, 5, 0, 9, 0]
    const res = decimateForRender(axis, values, 5)
    expect(res.indices.length).toBeLessThanOrEqual(2 * 5)
    expect(res.droppedCount).toBe(10 - res.indices.length)
    // Bucket maxima are preserved (9 at i=3 and i=8; 5 at i=6).
    const kept = res.indices.map((i) => values[i])
    expect(kept).toContain(9)
    expect(kept).toContain(5)
    expect(kept).toContain(0)
  })

  it('is PURE over its inputs — the source arrays are structurally unchanged (deep-freeze + identity)', () => {
    const axis = Array.from({ length: 600 }, (_, i) => i)
    const values = Array.from({ length: 600 }, (_, i) => Math.sin(i / 9))
    const frozenAxis = Object.freeze(structuredClone(axis))
    const frozenValues = Object.freeze(structuredClone(values))
    const res = decimateForRender(axis, values, 100)
    expect(axis).toEqual(frozenAxis)
    expect(values).toEqual(frozenValues)
    expect(res.indices.length).toBeLessThanOrEqual(2 * 100)
    expect(res.droppedCount).toBeGreaterThan(0)
    // Nothing the UI could persist: the output carries indices + droppedCount ONLY.
    expect(res).not.toHaveProperty('values')
    expect(res).not.toHaveProperty('axis')
  })

  it('degrades to a named empty slice on degenerate input', () => {
    expect(decimateForRender([], [], 640).indices).toEqual([])
    expect(decimateForRender([0, 1], [0, 1], -3).indices).toEqual([0, 1])
    expect(decimateForRender([0, 1], [0, 1], Number.NaN).indices).toEqual([0, 1])
  })
})

describe('traceModel.colour (stable per-trace colour — bait #9)', () => {
  it('assigns from a fixed palette by rank in the sorted spec list, cycling', () => {
    const ids = ['AOUT-000001', 'AOUT-000002', 'AOUT-000003', 'AOUT-000009']
    expect(colorForTraceInSet(ids, 'AOUT-000001')).toBe(TRACES_PALETTE[0])
    expect(colorForTraceInSet(ids, 'AOUT-000002')).toBe(TRACES_PALETTE[1])
    expect(colorForTraceInSet(ids, 'AOUT-000003')).toBe(TRACES_PALETTE[2])
    expect(colorForTraceInSet(ids, 'AOUT-000009')).toBe(TRACES_PALETTE[3])
    // 9 traces -> the 9th cycles back to the first palette slot.
    const nine = Array.from({ length: 9 }, (_, i) => `AOUT-${String(i + 1).padStart(6, '0')}`)
    expect(colorForTraceInSet(nine, nine[8]!)).toBe(TRACES_PALETTE[0])
  })

  it('same spec, different toggle state -> same colours (toggle-state invariance)', () => {
    // The spec's FULL id list is the colour authority — hiding a trace changes
    // the visible set, never the saved list, so colours are invariant.
    const specIds = ['AOUT-000001', 'AOUT-000002', 'AOUT-000003']
    const c1 = ['AOUT-000003', 'AOUT-000001', 'AOUT-000002'].map((id) => colorForTraceInSet(specIds, id))
    const c2 = ['AOUT-000003', 'AOUT-000001'].map((id) => colorForTraceInSet(specIds, id))
    expect(c2).toEqual([c1[0], c1[1]])
  })

  it('reordering the saved list does not recolour (rank is by sorted id, not position)', () => {
    expect(colorForTraceInSet(['AOUT-000001', 'AOUT-000002'], 'AOUT-000001')).toBe(
      colorForTraceInSet(['AOUT-000002', 'AOUT-000001'], 'AOUT-000001'),
    )
    expect(colorForTraceInSet(['AOUT-000001', 'AOUT-000002'], 'AOUT-000002')).toBe(
      colorForTraceInSet(['AOUT-000002', 'AOUT-000001'], 'AOUT-000002'),
    )
  })

  it('stableTraceOrder sorts by record id (the deterministic rank authority)', () => {
    const ts = [
      trace({ recordId: 'AOUT-000002' }),
      trace({ recordId: 'AOUT-000001' }),
      trace({ recordId: 'AOUT-000003' }),
    ]
    expect(stableTraceOrder(ts).map((t) => t.recordId)).toEqual(['AOUT-000001', 'AOUT-000002', 'AOUT-000003'])
  })
})

describe('traceModel.parseTraceValue (shared axis/values/unit extraction)', () => {
  it('extracts axis/values + the data-carried unit strings', () => {
    const res = parseTraceValue({ axis: [0, 1], values: [1, 2], axis_units: 'min', value_units: 'pA' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.trace.axis).toEqual([0, 1])
      expect(res.trace.values).toEqual([1, 2])
      expect(res.trace.xUnit).toBe('min')
      expect(res.trace.yUnit).toBe('pA')
    }
  })

  it('omits absent unit keys (no fabricated units)', () => {
    const res = parseTraceValue({ axis: [0], values: [1] })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.trace.xUnit).toBeUndefined()
      expect(res.trace.yUnit).toBeUndefined()
    }
  })

  it('named failure legs', () => {
    expect(parseTraceValue('nope').ok).toBe(false)
    expect(parseTraceValue({}).ok).toBe(false)
    expect(parseTraceValue({ axis: [0], values: [] }).ok).toBe(false)
  })
})

describe('traceModel.parseMarkerRows (peak-table markers as DATA)', () => {
  // Field names are TEST DATA here — the prod module never re-types them.
  const FIELDS = { rt: 'rt_min', label: 'peak', saturated: 'saturated', flags: 'flags' }

  it('parses rows with data-carried rt/label/saturated/flags', () => {
    const rows = [
      { peak: 'P1', rt_min: 1.0, height_pa: 2.6, saturated: false, flags: '' },
      { peak: 'P2', rt_min: 3.0, height_pa: 1.6, saturated: true, flags: ['UNRECOVERABLE_SATURATED'] },
    ]
    const markers = parseMarkerRows(rows, FIELDS)
    expect(markers.map((m) => m.label)).toEqual(['P1', 'P2'])
    expect(markers.map((m) => m.rt)).toEqual([1.0, 3.0])
    expect(markers.map((m) => m.saturated)).toEqual([false, true])
    // The reason code arrives AS DATA in flags — rendered, never re-typed.
    expect(markers[1]!.flags).toBe('UNRECOVERABLE_SATURATED')
  })

  it('rows with a null/absent rt keep rt:null (the component skips them visibly)', () => {
    const markers = parseMarkerRows([{ peak: 'P?', rt_min: null }, { peak: 'P1' }], FIELDS)
    expect(markers[0]!.rt).toBeNull()
    expect(markers[1]!.rt).toBeNull()
    expect(markers[0]!.label).toBe('P?')
  })

  it('non-array rows -> empty (a named empty state, never a throw)', () => {
    expect(parseMarkerRows(undefined, FIELDS)).toEqual([])
    expect(parseMarkerRows({ a: 1 }, FIELDS)).toEqual([])
  })

  // B3 (item 250TH-8): saturation is DECLARED, never computed. The token list
  // arrives via the DECLARED binding (fields.saturationFlags — DATA, not a
  // TS default); an UNDECLARED flag token never marks saturation.
  it('flags-only row + DECLARED token list: the declared token marks the row saturated', () => {
    const rows = [{ peak: 'P2', rt_min: 3.0, saturated: false, flags: ['UNRECOVERABLE_SATURATED'] }]
    const markers = parseMarkerRows(rows, { ...FIELDS, saturationFlags: ['UNRECOVERABLE_SATURATED'] })
    expect(markers[0]!.saturated).toBe(true)
  })

  it('flags-only row + an UNDECLARED token (OVERLAP_SHARED_BASELINE) is NOT marked (never guessed)', () => {
    const rows = [{ peak: 'P3', rt_min: 4.0, saturated: false, flags: ['OVERLAP_SHARED_BASELINE'] }]
    // No saturationFlags declaration at all:
    expect(parseMarkerRows(rows, FIELDS)[0]!.saturated).toBe(false)
    // A declared list that does not name this token:
    const declared = parseMarkerRows(rows, { ...FIELDS, saturationFlags: ['UNRECOVERABLE_SATURATED'] })
    expect(declared[0]!.saturated).toBe(false)
  })

  it('a multi-token flags list marks saturation when ANY declared token appears', () => {
    const rows = [
      { peak: 'P1', rt_min: 1.0, saturated: false, flags: ['UNDEFINED_SIBLING_AREA_NULL', 'UNRECOVERABLE_SATURATED'] },
      { peak: 'P2', rt_min: 2.0, saturated: false, flags: ['UNDEFINED_SIBLING_AREA_NULL'] },
    ]
    const markers = parseMarkerRows(rows, { ...FIELDS, saturationFlags: ['UNRECOVERABLE_SATURATED'] })
    expect(markers.map((m) => m.saturated)).toEqual([true, false])
  })
})

describe('traceModel.extractTrace (inline OR the OQ-1(a) content route)', () => {
  it('extracts an inline trace from the run payload', async () => {
    const runRecord = {
      recordId: 'ANR-000001',
      payload: {
        title: 'Run A',
        outputManifest: {
          artifacts: [
            {
              name: 'sig',
              dataKind: 'signal',
              value: { axis: [0, 1], values: [1, 2], axis_units: 'min', value_units: 'pA' },
            },
          ],
          artifactRefs: { sig: { artifactRecordId: 'AOUT-000001' } },
        },
        outputArtifactRefs: [{ kind: 'record', id: 'AOUT-000001', type: 'analysis-output-artifact' }],
      },
    }
    const { calls, fn } = spyFetch()
    const res = await extractTrace(runRecord, 'AOUT-000001', fn)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.trace.axis).toEqual([0, 1])
      expect(res.trace.values).toEqual([1, 2])
      expect(res.trace.xUnit).toBe('min')
      expect(res.trace.yUnit).toBe('pA')
      expect(res.trace.runTitle).toBe('Run A')
      expect(res.trace.runId).toBe('ANR-000001')
      expect(res.trace.artifactName).toBe('sig')
    }
    // Inline payload needs NO content fetch (the route is dref-only).
    expect(calls).toEqual([])
  })

  it('reads dref-backed bytes through the ratified content route when there is no inline value', async () => {
    // Client-shaped value: the route's `content` field (the stored JSON
    // PARSED — the client method does the res.json() + envelope unwrap).
    const content = { axis: [0, 1, 2], values: [3, 4, 5], axis_units: 'min', value_units: 'pA' }
    const runRecord = {
      recordId: 'ANR-000002',
      payload: {
        title: 'Run B',
        outputManifest: {
          artifacts: [
            { name: 'sig', dataKind: 'signal', dataReferenceRef: { id: 'DREF-000001' } },
          ],
          artifactRefs: { sig: { artifactRecordId: 'AOUT-000002', dataReferenceId: 'DREF-000001' } },
        },
        outputArtifactRefs: [{ kind: 'record', id: 'AOUT-000002', type: 'analysis-output-artifact' }],
      },
    }
    const { fn, calls } = spyFetch(content)
    const res = await extractTrace(runRecord, 'AOUT-000002', fn)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.trace.values).toEqual([3, 4, 5])
      expect(res.trace.xUnit).toBe('min')
      expect(res.trace.yUnit).toBe('pA')
      expect(calls).toEqual(['AOUT-000002'])
    }
  })

  it('D1 seam: drives the REAL handler response shape through the REAL client-shaped value into extractTrace (no double mocking)', async () => {
    // The server handler (analysisArtifactContent.ts) answers with the
    // ENVELOPE { artifactId, dataReferenceId, content }. This test feeds that
    // exact 2xx JSON body to the REAL apiClient.getAnalysisArtifactContent
    // (only the network is stubbed), and threads the client's REAL return
    // value as the FetchContent channel into extractTrace's dref branch —
    // no pre-parsed string, no mocked client, no double mocking.
    const handlerBody = {
      artifactId: 'AOUT-000009',
      dataReferenceId: 'DREF-000009',
      content: { axis: [0, 1, 2, 3], values: [0.5, 4.25, 1.75, 0.1], axis_units: 'min', value_units: 'pA' },
    }
    const fetchSpy = vi.fn(async (_url: string | URL | undefined) => ({ ok: true, status: 200, json: async () => handlerBody }))
    vi.stubGlobal('fetch', fetchSpy)
    const runRecord = {
      recordId: 'ANR-000009',
      payload: {
        title: 'Run C',
        outputManifest: {
          artifacts: [
            { name: 'sig', dataKind: 'signal', dataReferenceRef: { id: 'DREF-000009' } },
          ],
          artifactRefs: { sig: { artifactRecordId: 'AOUT-000009', dataReferenceId: 'DREF-000009' } },
        },
        outputArtifactRefs: [{ kind: 'record', id: 'AOUT-000009', type: 'analysis-output-artifact' }],
      },
    }
    const fn: FetchContent = (artifactRecordId: string) => apiClient.getAnalysisArtifactContent(artifactRecordId)
    try {
      const res = await extractTrace(runRecord, 'AOUT-000009', fn)
      expect(res.ok).toBe(true)
      if (res.ok) {
        expect(res.trace.axis).toEqual([0, 1, 2, 3])
        expect(res.trace.values).toEqual([0.5, 4.25, 1.75, 0.1])
        expect(res.trace.xUnit).toBe('min')
        expect(res.trace.yUnit).toBe('pA')
        expect(res.trace.runTitle).toBe('Run C')
        expect(res.trace.artifactName).toBe('sig')
      }
      // The client called the content route with the AOUT id.
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(String(fetchSpy.mock.calls[0]![0])).toContain('/analysis-artifacts/AOUT-000009/content')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('named error legs: unknown artifact id / artifact with no payload to read', async () => {
    const runRecord = { recordId: 'ANR-000001', payload: { outputManifest: { artifacts: [] } } }
    const r1 = await extractTrace(runRecord, 'AOUT-999999')
    expect(r1.ok).toBe(false)
    if (!r1.ok) expect(r1.code).toBe('ARTIFACT_NOT_FOUND')

    // An artifact entry exists but carries neither an inline value nor a
    // dataReferenceRef: a NAMED error leg, never a silent fallback (bait #13).
    const runNoPayload = {
      recordId: 'ANR-000001',
      payload: {
        outputManifest: {
          artifacts: [{ name: 'sig', dataKind: 'signal' }],
          artifactRefs: { sig: { artifactRecordId: 'AOUT-000001' } },
        },
      },
    }
    const r2 = await extractTrace(runNoPayload, 'AOUT-000001')
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.code).toBe('NO_PAYLOAD')
  })
})

describe('traceModel.buildCompareViewSpecPayload (saved comparison = view-spec data pinning sources)', () => {
  it('builds the view-spec payload with pinned AOUT refs + axisUnits echo', () => {
    const a = trace({ recordId: 'AOUT-000001', artifactName: 'sig', xUnit: 'min', yUnit: 'pA' })
    const b = trace({ recordId: 'AOUT-000002', artifactName: 'sig', xUnit: 'min', yUnit: 'pA' })
    const payload = buildCompareViewSpecPayload([
      { trace: a, label: 'Sample A' },
      { trace: b },
    ], 'VSPEC-000123')
    expect(payload.kind).toBe('view-spec')
    expect(payload.id).toBe('VSPEC-000123')
    expect(payload.renderer).toBe('trace-compare')
    // The primary trace (first in the saved list) satisfies artifactRef honestly.
    expect(payload.artifactRef).toEqual({ kind: 'record', id: 'AOUT-000001', type: 'analysis-output-artifact', label: 'Sample A' })
    expect(payload.bindings?.axisUnits).toEqual({ x: 'min', y: 'pA' })
    const traces = payload.bindings?.traces as Array<Record<string, unknown>>
    expect(traces).toHaveLength(2)
    expect(traces[0].artifactRef).toEqual({ kind: 'record', id: 'AOUT-000001', type: 'analysis-output-artifact', label: 'Sample A' })
    expect(traces[1].artifactRef).toEqual({ kind: 'record', id: 'AOUT-000002', type: 'analysis-output-artifact' })
    // bait #10: absent optional keys are OMITTED, never undefined-valued.
    expect(traces[0]).not.toHaveProperty('conversion')
    expect(traces[1]).not.toHaveProperty('conversion')
    expect(payload.bindings).not.toHaveProperty('unknown')
  })

  it('carries declared conversions verbatim and omits them when absent', () => {
    const a = trace({ recordId: 'AOUT-000001', artifactName: 'sig', xUnit: 'min', yUnit: 'pA' })
    const b = trace({ recordId: 'AOUT-000002', artifactName: 'sig', xUnit: 'min', yUnit: 'AU' })
    const payload = buildCompareViewSpecPayload(
      [
        { trace: a },
        { trace: b, conversion: { factor: 1000, toUnit: 'pA', declaredBy: 'scientist' } },
      ],
      'VSPEC-000456',
    )
    const traces = payload.bindings?.traces as Array<Record<string, unknown>>
    expect(traces[1].conversion).toEqual({ factor: 1000, toUnit: 'pA', declaredBy: 'scientist' })
    expect(traces[0]).not.toHaveProperty('conversion')
    // The axisUnits echo reflects the POST-conversion units (conflict-free).
    expect(payload.bindings?.axisUnits).toEqual({ x: 'min', y: 'pA' })
  })

  it('omits the axisUnits echo when the data carries no units (no fabricated units)', () => {
    const a = trace({ recordId: 'AOUT-000001', artifactName: 'sig' })
    const payload = buildCompareViewSpecPayload([{ trace: a }], 'VSPEC-000789')
    expect(payload.bindings?.axisUnits).toBeUndefined()
  })
})
