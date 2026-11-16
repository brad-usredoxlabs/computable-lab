/**
 * L2-GC-TRACE-PERSIST-1 / u1persist (app leg) — the run/GC render path can
 * CONSUME the persisted measurement record shape: a reader maps a record's
 * parserInfo.trace into traceModel's Trace shape (values + a uniform
 * sampling-grid axis) so the GC section can render it WITHOUT re-parsing the
 * raw file and WITHOUT a second copy of the sampling interval.
 *
 * RED-first: `traceFromMeasurement` does not exist yet.
 * Hard lines (same as traceModel): units arrive from the RECORD data (no unit
 * literals invented); absent fields stay absent (no friendly defaults).
 */
import { describe, expect, it } from 'vitest'
import { traceFromMeasurement, type MeasurementRecordShape } from './traceModel'

/** A measurement-shaped record envelope exactly as the server persists it
 *  (parserInfo.trace = { values, samplingIntervalSeconds } — the D3 shape). */
function recordOf(partial: Partial<MeasurementRecordShape> & { recordId: string }): MeasurementRecordShape {
  return { payload: {}, ...partial } as MeasurementRecordShape
}

const VALUES = [9.7135, 17.0548, 252898.8125, 12.5, 4.25]
const INTERVAL = 0.05

const tracedRecord = recordOf({
  recordId: 'MSR-000042',
  payload: {
    title: 'GC-FID run',
    parserInfo: {
      parserId: 'aia_andi_cdf',
      parserVersion: '1.0.0',
      parsedAt: '2026-11-16T08:00:00.000Z',
      units: { time: 'seconds', intensity: 'pA' },
      metadata: { sample_name: 'RESTEK 35077' },
      trace: { values: VALUES, samplingIntervalSeconds: INTERVAL },
    },
  },
})

describe('traceModel.traceFromMeasurement (u1persist app reader)', () => {
  it('maps parserInfo.trace into the Trace shape: axis from the uniform grid, values verbatim', () => {
    const res = traceFromMeasurement(tracedRecord, { runId: 'RUN-000123' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const t = res.trace
    expect(t.recordId).toBe('MSR-000042')
    expect(t.runId).toBe('RUN-000123')
    // AC3: values length == the samplingIntervalSeconds-derived axis length.
    expect(t.values).toEqual(VALUES)
    expect(t.axis.length).toBe(VALUES.length)
    expect(t.axis[0]).toBe(0)
    expect(t.axis[1]).toBeCloseTo(INTERVAL, 10)
    expect(t.axis[VALUES.length - 1]).toBeCloseTo((VALUES.length - 1) * INTERVAL, 10)
    // Units come from the RECORD's declared units, verbatim (no invention).
    expect(t.xUnit).toBe('seconds')
    expect(t.yUnit).toBe('pA')
  })

  it('a record with NO parserInfo.trace is a named NO_TRACE result (never an empty fake trace)', () => {
    const res = traceFromMeasurement(
      recordOf({ recordId: 'MSR-000043', payload: { parserInfo: { parserId: 'generic_csv', parserVersion: '0.1.0' } } }),
      { runId: 'RUN-000123' },
    )
    expect(res).toEqual({ ok: false, code: 'NO_TRACE', message: expect.stringContaining('MSR-000043') })
  })

  it('a record whose trace is not a well-formed { values: number[], samplingIntervalSeconds: number } is a NAMED error (no guessed grid)', () => {
    const missingInterval = recordOf({
      recordId: 'MSR-000044',
      payload: { parserInfo: { parserId: 'aia_andi_cdf', trace: { values: VALUES } } },
    })
    expect(traceFromMeasurement(missingInterval, { runId: 'RUN-000123' })).toMatchObject({ ok: false, code: 'NO_TRACE' })
    const emptyValues = recordOf({
      recordId: 'MSR-000045',
      payload: { parserInfo: { parserId: 'aia_andi_cdf', trace: { values: [], samplingIntervalSeconds: INTERVAL } } },
    })
    expect(traceFromMeasurement(emptyValues, { runId: 'RUN-000123' })).toMatchObject({ ok: false, code: 'NO_TRACE' })
  })
})
