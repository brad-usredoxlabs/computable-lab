/**
 * L2-GC-UPLOAD-UI-1 attachbinary — pins the Attach dialog hook to the merged
 * binary-upload + GC-parser surface:
 *  (a) PARSER_OPTIONS carries the real parser id `agilent6890` (the _csv_stub
 *      id is gone), and nothing else in the file may claim a hash;
 *  (b) the sha shown after upload is EXACTLY the value the server returned on
 *      the data-reference write (a hook-computed hash fails this);
 *  (c) after ingest the hook exposes a parse summary read back from the created
 *      measurement record (parserId / row count / first+last point / stored
 *      path) rather than undefined.
 *
 * jsdom environment (the repo default) — this exercises a hook with fetch,
 * not a node-only seam.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../../shared/api/client'
import { useResultsMode } from './useResultsMode'

// A real Agilent 6890 / ChemStation signal export as the merged chemstation
// parser reads it: preamble, quoted header row, strict-numeric rows.
const GC_SHA = '9f2c41a8b3e5d706142859c7a3b0d1e4f5a6b7c8d90e1f2a3b4c5d6e7f8091ab'
const GC_ROWS = [
  { well: 'NA', metric: 'intensity', value: 12.5, channelId: 'chromatogram', unit: 'pA', timeMin: 1.2 },
  { well: 'NA', metric: 'intensity', value: 480.25, channelId: 'chromatogram', unit: 'pA', timeMin: 5.6 },
  { well: 'NA', metric: 'intensity', value: 0.1, channelId: 'chromatogram', unit: 'pA', timeMin: 12.9 },
]

function workspaceWithMeasurement() {
  const measurementPayload = {
    kind: 'measurement',
    recordId: 'MEAS-000042',
    title: 'Measurement MEAS-000042',
    assayType: 'gc_ms',
    eventGraphRef: { kind: 'record', id: 'EVTG-000001', type: 'event-graph' },
    data: GC_ROWS,
    artifacts: [
      {
        role: 'raw_data',
        fileRef: {
          file_name: 'run-gc.ch',
          media_type: 'text/csv',
          stored_path: 'storage://measurements/2026-11-14T05-00-00-run-gc.ch',
        },
      },
    ],
    parserInfo: { parserId: 'agilent6890', parserVersion: '1.0.0', parsedAt: '2026-11-14T05:00:00.000Z' },
  }
  return {
    run: { recordId: 'RUN-000001', schemaId: 'run', payload: { kind: 'run' } },
    eventGraph: null,
    measurementContexts: [],
    wellGroups: [],
    wellRoleAssignmentsByContext: {},
    measurements: [
      {
        recordId: 'MEAS-000042',
        schemaId: 'measurement',
        payload: measurementPayload,
        meta: { kind: 'measurement' },
      },
    ],
    claims: [],
    evidence: [],
    assertions: [],
  }
}

function mockFetch(): (input: unknown, init?: RequestInit) => Promise<Response> {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const url = (input: unknown) => (typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url ?? '')
  return async (input: unknown, init?: RequestInit) => {
    const path = url(input)
    const method = init?.method ?? 'GET'
    if (method === 'POST' && path.endsWith('/measurements/upload-raw')) {
      return json(201, {
        success: true,
        path: 'storage://measurements/2026-11-14T05-00-00-run-gc.ch',
        fileName: 'run-gc.ch',
        size: 1234,
        sha256: GC_SHA,
        dataReferenceId: 'DREF-000007',
        mode: 'binary',
      })
    }
    if (method === 'POST' && path.endsWith('/measurements/ingest')) {
      return json(201, { success: true, recordId: 'MEAS-000042' })
    }
    if (method === 'POST' && path.endsWith('/measurements/validate-parser')) {
      return json(200, { result: { parserId: 'agilent6890', parserVersion: '1.0.0', assayType: 'gc_ms', path: 'x', rows: 3, channels: ['chromatogram'], data: GC_ROWS } })
    }
    // refresh() after ingest must read the created measurement back.
    return json(200, workspaceWithMeasurement())
  }
}

describe('useResultsMode — GC attach (L2-GC-UPLOAD-UI-1 attachbinary)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('(a) offers the real agilent6890 parser id and drops the _csv_stub stub id', () => {
    const { result } = renderHook(() =>
      useResultsMode({ runId: 'RUN-000001', eventGraphId: 'EVTG-000001', events: [] }),
    )
    const values = result.current.parserOptions.map((option) => option.value)
    expect(values).toContain('agilent6890')
    expect(values).not.toContain('agilent6890_csv_stub')
    expect(result.current.parserOptions.find((option) => option.value === 'agilent6890')?.label).toBe('Agilent 6890 GC-FID')
  })

  it('(b) exposes exactly the sha the server returned from the data-reference write (never a computed one)', async () => {
    const uploadSpy = vi
      .spyOn(apiClient, 'uploadRawMeasurementFile')
      .mockResolvedValue({
        success: true,
        path: 'storage://measurements/2026-11-14T05-00-00-run-gc.ch',
        fileName: 'run-gc.ch',
        size: 1234,
        sha256: GC_SHA,
        dataReferenceId: 'DREF-000007',
        mode: 'binary',
      })
    const { result } = renderHook(() =>
      useResultsMode({ runId: 'RUN-000001', eventGraphId: 'EVTG-000001', events: [] }),
    )
    await act(async () => {
      await result.current.uploadFile(new File(['Instrument: 6890\nRetTime [min],Signal [pA]\n1.2,12.5\n5.6,480.25\n'], 'run-gc.ch'))
    })
    expect(uploadSpy).toHaveBeenCalledTimes(1)
    // The hook must surface the server's own value, byte-for-byte — a hook
    // that hashes the bytes itself (or a literal) cannot equal this fixture.
    expect(result.current.uploadedContentHash).toBe(GC_SHA)
    expect(result.current.uploadedDataReferenceId).toBe('DREF-000007')
  })

  it('(c) after ingest exposes a parse summary read back from the created measurement record', async () => {
    const ingestSpy = vi.spyOn(apiClient, 'ingestMeasurement').mockResolvedValue({ success: true, recordId: 'MEAS-000042' })
    const { result } = renderHook(() =>
      useResultsMode({ runId: 'RUN-000001', eventGraphId: 'EVTG-000001', events: [] }),
    )
    await act(async () => {
      await result.current.uploadFile(new File(['RetTime [min],Signal [pA]\n1.2,12.5\n'], 'run-gc.ch'))
    })
    await act(async () => {
      await result.current.ingest()
    })
    expect(ingestSpy).toHaveBeenCalledTimes(1)
    expect(result.current.activeMeasurementId).toBe('MEAS-000042')
    const summary = result.current.parseSummary
    expect(summary).not.toBeNull()
    expect(summary!.parserId).toBe('agilent6890')
    expect(summary!.parserVersion).toBe('1.0.0')
    expect(summary!.rowCount).toBe(3)
    expect(summary!.firstPoint).toBe('1.2 min — 12.5 pA')
    expect(summary!.lastPoint).toBe('12.9 min — 0.1 pA')
    expect(summary!.storedPath).toBe('storage://measurements/2026-11-14T05-00-00-run-gc.ch')
    expect(summary!.units).toBe('time: min · intensity: pA')
    // The created record id the person can copy.
    expect(result.current.activeMeasurementId).toBe(summary!.recordId)
    await waitFor(() => expect(result.current.parseSummary).not.toBeNull())
  })
})
