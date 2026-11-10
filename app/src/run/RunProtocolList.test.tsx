import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { protocolRefsOf } from './runProtocolRefs'
import { RunProtocolList } from './RunProtocolList'

const mocks = vi.hoisted(() => ({ getRecord: vi.fn(), getRecordWithUI: vi.fn(), listRecordsByKind: vi.fn() }))

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getRecord: mocks.getRecord,
    getRecordWithUI: mocks.getRecordWithUI,
    listRecordsByKind: mocks.listRecordsByKind,
  },
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
beforeEach(() => {
  mocks.getRecord.mockReset()
  mocks.getRecordWithUI.mockReset()
  mocks.listRecordsByKind.mockReset()
  mocks.listRecordsByKind.mockResolvedValue({ records: [], total: 0 })
})

type SeenRequest = { url: string; init?: RequestInit }

/** Stub the mutation endpoint only — reads still go through the mocked apiClient. */
function stubMutation(status: number, body: unknown, seen: SeenRequest[]) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ url: String(input), init })
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  })
}

function record(recordId: string, payload: Record<string, unknown>) {
  return { recordId, schemaId: 'test/schema', payload }
}

/** The row's protocol label (the Remove control is a sibling, not part of the label). */
function labelText(item: HTMLElement): string {
  return item.firstElementChild?.textContent ?? ''
}

/** A planned-run envelope carrying an ordered localProtocolRefs list. */
function plr(id: string, refs: Array<{ id: string; label?: string }>) {
  return record(id, { localProtocolRefs: refs })
}

describe('protocolRefsOf (pure reader)', () => {
  it('returns localProtocolRefs in order, normalising objects and bare ids; the list wins', () => {
    const refs = protocolRefsOf({
      localProtocolRefs: [{ id: 'PRT-a', label: 'Alpha' }, 'PRT-b', { id: 'PRT-c' }],
      localProtocolRef: { id: 'PRT-z', label: 'Legacy' },
    })
    expect(refs).toEqual([{ id: 'PRT-a', label: 'Alpha' }, { id: 'PRT-b' }, { id: 'PRT-c' }])
    // label is OMITTED, never undefined (exactOptionalPropertyTypes posture).
    expect('label' in refs[1]!).toBe(false)
  })

  it('de-duplicates by id keeping the first occurrence position', () => {
    const refs = protocolRefsOf({
      localProtocolRefs: [{ id: 'PRT-a', label: 'A' }, { id: 'PRT-b' }, { id: 'PRT-a', label: 'A2' }],
    })
    expect(refs).toEqual([{ id: 'PRT-a', label: 'A' }, { id: 'PRT-b' }])
  })

  it('falls back to the legacy singular localProtocolRef when the list is absent/empty', () => {
    expect(protocolRefsOf({ localProtocolRef: { id: 'PRT-one', label: 'One' } })).toEqual([
      { id: 'PRT-one', label: 'One' },
    ])
    expect(protocolRefsOf({ localProtocolRefs: [], localProtocolRef: { id: 'PRT-one' } })).toEqual([
      { id: 'PRT-one' },
    ])
  })

  it('falls back to protocolRef then sourceRef for pre-list planned runs', () => {
    expect(protocolRefsOf({ protocolRef: { id: 'PRT-p', label: 'P' } })).toEqual([{ id: 'PRT-p', label: 'P' }])
    expect(protocolRefsOf({ sourceRef: { id: 'PRT-s' } })).toEqual([{ id: 'PRT-s' }])
  })

  it('returns an empty list when no ref exists', () => {
    expect(protocolRefsOf({})).toEqual([])
    expect(protocolRefsOf(null)).toEqual([])
  })
})

describe('RunProtocolList', () => {
  it('renders three attached protocols in order with the first marked lead', async () => {
    mocks.getRecord.mockResolvedValueOnce(record('RUN-1', { plannedRunRef: { id: 'PLR-1' } }))
    mocks.getRecordWithUI.mockResolvedValueOnce({
      record: record('PLR-1', {
        localProtocolRefs: [
          { id: 'PRT-a', label: 'Alpha' },
          { id: 'PRT-b', label: 'Beta' },
          { id: 'PRT-c' },
        ],
      }),
    })
    render(<RunProtocolList runId="RUN-1" />)
    const items = await screen.findAllByRole('listitem')
    expect(items.map(labelText)).toEqual(['Alpha (lead)', 'Beta', 'PRT-c'])
    expect(items[0]!.getAttribute('data-lead')).toBe('true')
    expect(items[1]!.getAttribute('data-lead')).toBeNull()
    expect(screen.getByText('3 methods')).toBeTruthy()
  })

  it('renders exactly one item for a legacy single protocolRef', async () => {
    mocks.getRecord.mockResolvedValueOnce(record('RUN-2', { plannedRunRef: { id: 'PLR-2' } }))
    mocks.getRecordWithUI.mockResolvedValueOnce({
      record: record('PLR-2', { protocolRef: { id: 'PRT-legacy', label: 'Legacy' } }),
    })
    render(<RunProtocolList runId="RUN-2" />)
    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(1)
    expect(labelText(items[0]!)).toBe('Legacy (lead)')
  })

  it('reads the PLR via getRecordWithUI not getRecord', async () => {
    // /api/records/:id 404s for tree-store records; only /ui/record/:id serves them.
    mocks.getRecord.mockResolvedValueOnce(record('RUN-9', { plannedRunRef: { id: 'PLR-9' } }))
    mocks.getRecordWithUI.mockResolvedValueOnce({ record: plr('PLR-9', [{ id: 'PRT-a', label: 'Alpha' }]) })
    render(<RunProtocolList runId="RUN-9" />)
    const items = await screen.findAllByRole('listitem')
    expect(labelText(items[0]!)).toBe('Alpha (lead)')
    expect(mocks.getRecordWithUI).toHaveBeenCalledWith('PLR-9')
    expect(mocks.getRecord).toHaveBeenCalledTimes(1)
    expect(mocks.getRecord).not.toHaveBeenCalledWith('PLR-9')
  })

  it('renders nothing when the run has no plannedRunRef', async () => {
    mocks.getRecord.mockResolvedValueOnce(record('RUN-3', { title: 'No protocol yet' }))
    const { container } = render(<RunProtocolList runId="RUN-3" />)
    await waitFor(() => expect(mocks.getRecord).toHaveBeenCalledWith('RUN-3'))
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing and does not throw when getRecord rejects', async () => {
    mocks.getRecord.mockRejectedValue(new Error('boom'))
    const { container } = render(<RunProtocolList runId="RUN-4" />)
    await waitFor(() => expect(mocks.getRecord).toHaveBeenCalledWith('RUN-4'))
    await Promise.resolve()
    expect(container.innerHTML).toBe('')
  })

  it('attaches to the PLANNED RUN and re-reads the list from the server', async () => {
    mocks.getRecord
      .mockResolvedValueOnce(record('RUN-5', { plannedRunRef: { id: 'PLR-5' } }))
      // Post-mutation re-read: the server's ordered list, labels from the record.
      .mockResolvedValueOnce(record('RUN-5', { plannedRunRef: { id: 'PLR-5' } }))
    mocks.getRecordWithUI
      .mockResolvedValueOnce({ record: plr('PLR-5', [{ id: 'PRT-a', label: 'Alpha' }]) })
      .mockResolvedValueOnce({
        record: plr('PLR-5', [{ id: 'PRT-a', label: 'Alpha' }, { id: 'PRT-b', label: 'Beta' }]),
      })
    // Picker label differs from the record label: the row must show the RECORD's label.
    mocks.listRecordsByKind.mockResolvedValue({ records: [record('PRT-b', { label: 'Picker Beta' })], total: 1 })
    const seen: SeenRequest[] = []
    stubMutation(200, { success: true, protocolRefs: ['PRT-a', 'PRT-b'] }, seen)

    render(<RunProtocolList runId="RUN-5" />)
    await screen.findAllByRole('listitem')
    fireEvent.click(screen.getByRole('button', { name: 'Attach a method' }))
    fireEvent.change(await screen.findByRole('combobox', { name: 'Method to attach' }), {
      target: { value: 'PRT-b' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Attach' }))

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    // Labels come from the re-read PLR record, never from the picker's candidate list.
    expect(screen.getAllByRole('listitem').map(labelText)).toEqual(['Alpha (lead)', 'Beta'])
    expect(screen.getAllByRole('listitem').map((el) => el.getAttribute('data-lead'))).toEqual(['true', null])
    // The mutation names the PLANNED-RUN id (never the run record id) and sends the picked id.
    expect(seen[0]?.url).toBe('/api/runs/PLR-5/protocols')
    expect(seen[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(seen[0]?.init?.body))).toEqual({ protocolId: 'PRT-b' })
    expect(mocks.getRecordWithUI).toHaveBeenCalledWith('PLR-5')
    expect(mocks.getRecordWithUI).toHaveBeenCalledTimes(2)
    expect(mocks.getRecord).toHaveBeenCalledTimes(2)
  })

  it('renders the attach control for a run with no protocols yet', async () => {
    mocks.getRecord.mockResolvedValueOnce(record('RUN-6', { plannedRunRef: { id: 'PLR-6' } }))
    mocks.getRecordWithUI.mockResolvedValueOnce({ record: record('PLR-6', {}) })
    render(<RunProtocolList runId="RUN-6" />)
    expect(await screen.findByRole('button', { name: 'Attach a method' })).toBeTruthy()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('detaches from the PLANNED RUN and re-reads the list from the server', async () => {
    mocks.getRecord
      .mockResolvedValueOnce(record('RUN-7', { plannedRunRef: { id: 'PLR-7' } }))
      .mockResolvedValueOnce(record('RUN-7', { plannedRunRef: { id: 'PLR-7' } }))
    mocks.getRecordWithUI
      .mockResolvedValueOnce({
        record: plr('PLR-7', [{ id: 'PRT-a', label: 'Alpha' }, { id: 'PRT-b', label: 'Beta' }]),
      })
      .mockResolvedValueOnce({ record: plr('PLR-7', [{ id: 'PRT-a', label: 'Alpha' }]) })
    const seen: SeenRequest[] = []
    stubMutation(200, { success: true, protocolRefs: ['PRT-a'] }, seen)

    render(<RunProtocolList runId="RUN-7" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Detach Beta' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Detach Beta' })).toBeNull())
    expect(screen.getByRole('button', { name: 'Detach Alpha' })).toBeTruthy()
    expect(seen[0]?.url).toBe('/api/runs/PLR-7/protocols/PRT-b')
    expect(seen[0]?.init?.method).toBe('DELETE')
  })

  it('keeps the rendered list when the mutation fails', async () => {
    mocks.getRecord.mockResolvedValueOnce(record('RUN-8', { plannedRunRef: { id: 'PLR-8' } }))
    mocks.getRecordWithUI.mockResolvedValueOnce({ record: plr('PLR-8', [{ id: 'PRT-a', label: 'Alpha' }]) })
    const seen: SeenRequest[] = []
    stubMutation(500, { error: 'BOOM' }, seen)

    render(<RunProtocolList runId="RUN-8" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Detach Alpha' }))
    await waitFor(() => expect(seen).toHaveLength(1))
    expect(screen.getByRole('button', { name: 'Detach Alpha' })).toBeTruthy()
  })
})
