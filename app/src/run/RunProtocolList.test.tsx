import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { protocolRefsOf } from './runProtocolRefs'
import { RunProtocolList } from './RunProtocolList'

const mocks = vi.hoisted(() => ({ getRecord: vi.fn() }))

vi.mock('../shared/api/client', () => ({ apiClient: { getRecord: mocks.getRecord } }))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
beforeEach(() => {
  mocks.getRecord.mockReset()
})

function record(recordId: string, payload: Record<string, unknown>) {
  return { recordId, schemaId: 'test/schema', payload }
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
    mocks.getRecord
      .mockResolvedValueOnce(record('RUN-1', { plannedRunRef: { id: 'PLR-1' } }))
      .mockResolvedValueOnce(record('PLR-1', {
        localProtocolRefs: [
          { id: 'PRT-a', label: 'Alpha' },
          { id: 'PRT-b', label: 'Beta' },
          { id: 'PRT-c' },
        ],
      }))
    render(<RunProtocolList runId="RUN-1" />)
    const items = await screen.findAllByRole('listitem')
    expect(items.map((el) => el.textContent)).toEqual(['Alpha (lead)', 'Beta', 'PRT-c'])
    expect(items[0]!.getAttribute('data-lead')).toBe('true')
    expect(items[1]!.getAttribute('data-lead')).toBeNull()
    expect(screen.getByText('3 protocols')).toBeTruthy()
  })

  it('renders exactly one item for a legacy single protocolRef', async () => {
    mocks.getRecord
      .mockResolvedValueOnce(record('RUN-2', { plannedRunRef: { id: 'PLR-2' } }))
      .mockResolvedValueOnce(record('PLR-2', { protocolRef: { id: 'PRT-legacy', label: 'Legacy' } }))
    render(<RunProtocolList runId="RUN-2" />)
    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(1)
    expect(items[0]!.textContent).toBe('Legacy (lead)')
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
})
