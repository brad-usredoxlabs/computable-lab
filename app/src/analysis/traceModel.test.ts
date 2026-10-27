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
import { describe, expect, it } from 'vitest'
import {
  TRACES_PALETTE,
  applyDeclaredConversion,
  buildCompareViewSpecPayload,
  checkAxes,
  colorForTrace,
  decimateForRender,
  extractTrace,
  stableTraceOrder,
  type DeclaredConversion,
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

/** A minimal fetchContent spy (test-local; the prod caller is the OQ-1(a) client method). */
function spyFetch(bytes = ''): { fn: (artifactRecordId: string) => Promise<string | null>; calls: string[] } {
  const calls: string[] = []
  return { calls, fn: async (id: string) => { calls.push(id); return bytes } }
}

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
    const b = trace({ recordId: 'AOUT-000002' })
    const res = checkAxes([a, b])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.conflicts.map((c) => c.code)).toEqual(['UNIT_UNDECLARED'])
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
    const b = trace({ recordId: 'AOUT-000002', xUnit: 'min', yUnit: 'pA', axis: [0, 'x', 2] })
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
  it('assigns from a fixed palette in sorted-rank order, cycling', () => {
    expect(colorForTrace('AOUT-000001')).toBe(TRACES_PALETTE[0])
    expect(colorForTrace('AOUT-000002')).toBe(TRACES_PALETTE[1])
    expect(colorForTrace('AOUT-000003')).toBe(TRACES_PALETTE[2])
    expect(colorForTrace('AOUT-000009')).toBe(TRACES_PALETTE[0]) // cycles past 8
  })

  it('same spec, different toggle state -> same colours (toggle-state invariance)', () => {
    const ids = ['AOUT-000003', 'AOUT-000001', 'AOUT-000002']
    const c1 = ids.map(colorForTrace)
    // Hiding AOUT-000002 changes the VISIBLE set, but each surviving trace's
    // colour is the function of ITS rank in the saved spec's sorted list.
    const c2 = ['AOUT-000003', 'AOUT-000001'].map(colorForTrace)
    expect(c2).toEqual([c1[0], c1[1]])
  })

  it('reordering the saved list does not recolour (rank is by id, not by position)', () => {
    const a = ['AOUT-000001', 'AOUT-000002'].map(colorForTrace)
    const b = ['AOUT-000002', 'AOUT-000001'].map(colorForTrace)
    expect(a[0]).toBe(b[1])
    expect(a[1]).toBe(b[0])
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
        },
        outputArtifactRefs: { sig: { artifactRecordId: 'AOUT-000001' } },
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
    const bytes = JSON.stringify({ axis: [0, 1, 2], values: [3, 4, 5], axis_units: 'min', value_units: 'pA' })
    const runRecord = {
      recordId: 'ANR-000002',
      payload: {
        title: 'Run B',
        outputManifest: {
          artifacts: [
            { name: 'sig', dataKind: 'signal', dataReferenceRef: { id: 'DREF-000001' } },
          ],
        },
        outputArtifactRefs: { sig: { artifactRecordId: 'AOUT-000002', dataReferenceId: 'DREF-000001' } },
      },
    }
    const { fn, calls } = spyFetch(bytes)
    const res = await extractTrace(runRecord, 'AOUT-000002', fn)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.trace.values).toEqual([3, 4, 5])
      expect(res.trace.xUnit).toBe('min')
      expect(res.trace.yUnit).toBe('pA')
      expect(calls).toEqual(['AOUT-000002'])
    }
  })

  it('named error legs: unknown artifact id / artifact with no payload to read', async () => {
    const runRecord = { recordId: 'ANR-000001', payload: { outputManifest: { artifacts: [] }, outputArtifactRefs: {} } }
    const r1 = await extractTrace(runRecord, 'AOUT-999999')
    expect(r1.ok).toBe(false)
    if (!r1.ok) expect(r1.code).toBe('ARTIFACT_NOT_FOUND')

    // An artifact entry exists but carries neither an inline value nor a
    // dataReferenceRef: a NAMED error leg, never a silent fallback (bait #13).
    const runNoPayload = {
      recordId: 'ANR-000001',
      payload: {
        outputManifest: { artifacts: [{ name: 'sig', dataKind: 'signal' }] },
        outputArtifactRefs: { sig: { artifactRecordId: 'AOUT-000001' } },
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
