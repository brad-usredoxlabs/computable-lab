/**
 * L2-RUN-ATTACH-CAPABILITY-1 u2instrument — the Attach drawer's instrument pick is
 * sourced from the store's declared equipment records: (a) an explicit pick ships
 * { kind: 'record', id: <recordId>, type: 'equipment' } to ingestMeasurement even
 * when the readout's equipment_ref names a different instrument; (b) with no pick
 * the readout ref is forwarded (today's behaviour), source reported as readout;
 * (c) with no equipment records and no context ref, ingest refuses without
 * publishing and names the missing instrument. jsdom (repo default): the hook
 * needs a React renderer.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../../shared/api/client'
import { useResultsMode } from './useResultsMode'

const EQ = [
  { recordId: 'EQP-000001', schemaId: 'equipment', payload: { kind: 'equipment', id: 'EQP-000001', name: 'GC-FID 6890N' }, meta: { kind: 'equipment' } },
  { recordId: 'EQP-000002', schemaId: 'equipment', payload: { kind: 'equipment', id: 'EQP-000002', name: 'Plate reader' }, meta: { kind: 'equipment' } },
]

function ctx(ctxId: string, equipmentRef?: { kind: string; id: string; type: string; label?: string }) {
  const payload: Record<string, unknown> = { kind: 'measurement-context', id: ctxId, name: `Readout ${ctxId}`, source_ref: { kind: 'record', id: 'LW-000001', type: 'labware' }, readout_def_refs: [] }
  if (equipmentRef) payload.equipment_ref = equipmentRef
  return { recordId: ctxId, schemaId: 'measurement-context', meta: { kind: 'measurement-context' }, payload }
}

function mockFetch(ctxs: Array<ReturnType<typeof ctx>> = []) {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = (typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url).replace(/^\/api\//, '')
    const method = init?.method ?? 'GET'
    if (method === 'POST' && path.endsWith('/measurements/ingest')) return json(201, { success: true, recordId: 'MEAS-000100' })
    if (method === 'GET' && path.startsWith('records?')) return json(200, { records: [], total: 0 })
    if (method === 'GET' && path.startsWith('runs/RUN-000001/workspace')) return json(200, { run: { recordId: 'RUN-000001', schemaId: 'run', payload: { kind: 'run' } }, eventGraph: null, measurementContexts: ctxs, wellGroups: [], wellRoleAssignmentsByContext: {}, measurements: [], claims: [], evidence: [], assertions: [] })
    return json(200, { items: [] })
  }
}

const args = () => ({ runId: 'RUN-000001', eventGraphId: 'EVTG-000001', events: [], selectedWells: [] })

describe('useResultsMode — instrument pick (L2-RUN-ATTACH-CAPABILITY-1 u2instrument)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('(a) explicit pick ships the picked record id even when the readout names a different instrument', async () => {
    vi.stubGlobal('fetch', mockFetch([ctx('CTX-000001', { kind: 'record', id: 'EQP-000009', type: 'equipment', label: 'Legacy GC' })]))
    const listSpy = vi.spyOn(apiClient, 'listRecordsByKind').mockResolvedValue({ records: EQ, total: 2 })
    const ingestSpy = vi.spyOn(apiClient, 'ingestMeasurement').mockResolvedValue({ success: true, recordId: 'MEAS-000100' })
    const { result } = renderHook(() => useResultsMode(args()))
    await waitFor(() => expect(result.current.equipmentOptions).toEqual([{ id: 'EQP-000001', label: 'GC-FID 6890N' }, { id: 'EQP-000002', label: 'Plate reader' }]))
    expect(listSpy).toHaveBeenCalledWith('equipment', 200)
    await waitFor(() => expect(result.current.activeContextId).toBe('CTX-000001'))
    act(() => { result.current.setSelectedEquipmentId('EQP-000002'); result.current.setRawDataPath('data/instruments/readout.csv') })
    await act(async () => { await result.current.ingest() })
    expect(ingestSpy).toHaveBeenCalledTimes(1)
    expect(ingestSpy.mock.calls[0][0]).toEqual(expect.objectContaining({ equipmentRef: { kind: 'record', id: 'EQP-000002', type: 'equipment' } }))
    expect(result.current.equipmentSource).toBe('picked')
  })

  it('(b) without a pick the readout context ref is forwarded and the source is the readout', async () => {
    vi.stubGlobal('fetch', mockFetch([ctx('CTX-000001', { kind: 'record', id: 'EQP-000001', type: 'equipment', label: 'GC-FID 6890N' })]))
    vi.spyOn(apiClient, 'listRecordsByKind').mockResolvedValue({ records: EQ, total: 2 })
    const ingestSpy = vi.spyOn(apiClient, 'ingestMeasurement').mockResolvedValue({ success: true, recordId: 'MEAS-000100' })
    const { result } = renderHook(() => useResultsMode(args()))
    await waitFor(() => expect(result.current.equipmentOptions).toHaveLength(2))
    await waitFor(() => expect(result.current.activeContextId).toBe('CTX-000001'))
    act(() => { result.current.setRawDataPath('data/instruments/readout.csv') })
    await act(async () => { await result.current.ingest() })
    // The readout ref is forwarded verbatim (its label travels with it) — assert the identity fields.
    expect(ingestSpy).toHaveBeenCalledTimes(1)
    expect(ingestSpy.mock.calls[0][0]).toEqual(expect.objectContaining({ equipmentRef: expect.objectContaining({ kind: 'record', id: 'EQP-000001', type: 'equipment' }) }))
    expect(result.current.equipmentSource).toBe('readout')
  })

  it('(c) no equipment records and no context ref: ingest refuses without publishing', async () => {
    vi.stubGlobal('fetch', mockFetch([]))
    const listSpy = vi.spyOn(apiClient, 'listRecordsByKind').mockResolvedValue({ records: [], total: 0 })
    const ingestSpy = vi.spyOn(apiClient, 'ingestMeasurement').mockResolvedValue({ success: true, recordId: 'MEAS-000100' })
    const { result } = renderHook(() => useResultsMode(args()))
    await waitFor(() => expect(result.current.equipmentOptions).toEqual([]))
    act(() => { result.current.setRawDataPath('data/instruments/readout.csv') })
    await act(async () => { await result.current.ingest() })
    expect(ingestSpy).not.toHaveBeenCalled()
    expect(listSpy).toHaveBeenCalledWith('equipment', 200)
    expect(result.current.error ?? '').toMatch(/instrument/i)
    expect(result.current.equipmentSource).toBeNull()
  })
})
