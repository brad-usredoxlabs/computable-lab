/**
 * MATRES-CHAIN §7.5 — the chain adapter rides the SAME shared proposal flow
 * (ONE compile→card→accept/reject implementation; the union widening is the
 * QMS7-7-precedent diff, the flow body is shared machinery).
 *
 * Pinned:
 *  - proposeWorkstate('chain', intent) compiles through the SAME
 *    POST /api/drafts/compile seam with adapter:'chain';
 *  - the SERVER-BUILT card document (result.card: claims verbatim,
 *    reconciliation, honesty ceiling) rides into the card state VERBATIM —
 *    the client builds no copy (the recordFields precedent);
 *  - canAccept:false ⇒ blocked card with the named arithmetic rule id, NO
 *    accept control;
 *  - accept = exactly ONE accept fetch + the executor apply with the
 *    {accepted:true} attestation + identity; ZERO stream calls; the landing
 *    sessionDocument (record-edit tab) is what the executor receives;
 *  - a blocked arithmetic compile never reaches accept.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWorkstateProposalFlow } from './useWorkstateProposalFlow'
import { apiClient } from '../api/client'
import type { WorkstateExecutor } from '../session/useWorkstateExecutor'

vi.mock('../api/client', () => ({
  apiClient: {
    compileWorkstateDraft: vi.fn(),
    acceptWorkstateDraft: vi.fn(),
  },
}))

const executorCalls = vi.hoisted(() => ({
  executeTier1: vi.fn(),
  applyAcceptedWorkstate: vi.fn(),
}))

vi.mock('../session/useWorkstateExecutor', () => ({
  useWorkstateExecutor: () => executorCalls as unknown as WorkstateExecutor,
}))

const CHAIN_INTENT = {
  operation: 'compose-execute-chain',
  artifactKind: 'attestation-chain',
  prepared: { name: 'Fenofibrate stock 1 mL', volume: { value: 1, unit: 'mL' } },
  aliquots: { count: 10, volume: { value: 100, unit: 'uL' } },
  claims: [{ label: 'completed', verb: 'produced' }],
}

const CHAIN_COMPILED_OK = {
  draftId: 'DRAFT-CHAIN-1',
  revision: 1,
  reviewHash: 'c'.repeat(64),
  canAccept: true,
  diagnostics: [],
  result: {
    summary: 'Execute chain: 1 mL prepared, 10 aliquots of 100 uL',
    sessionDocument: {
      version: 1,
      tabs: [{ kind: 'record-edit', recordId: 'MATTEST-abc', title: 'Attestation' }],
      activeTabId: 'record-edit:MATTEST-abc',
    },
    card: {
      artifactKind: 'attestation-chain',
      claims: [
        {
          label: 'completed',
          verb: 'produced',
          aboutId: 'MATERIALINSTANCE-abc',
          aboutType: 'material-instance',
          occurredAtStatus: 'unknown',
          identity: { performer: 'unknown', accountSupplier: 'unknown', attestor: 'unknown' },
        },
      ],
      reconciliation: {
        title: 'Arithmetic check',
        sumScaled: 1000,
        preparedScaled: 1000,
        counts: [{ label: 'used', count: 1 }, { label: 'stored', count: 9 }],
      },
      ceilingNote: 'The arithmetic proves this draft is internally consistent. It does not prove the pipetting happened.',
    },
  },
}

const CHAIN_COMPILED_BLOCKED = {
  draftId: 'DRAFT-CHAIN-2',
  revision: 1,
  reviewHash: 'd'.repeat(64),
  canAccept: false,
  diagnostics: [
    { code: 'chain-arithmetic:volume-sum-lte-prepared', message: 'aliquot volumes sum 1100 uL exceeds the prepared volume 1000 uL' },
  ],
  result: {
    sessionDocument: null,
    summary: 'Execute chain blocked',
    card: CHAIN_COMPILED_OK.result.card,
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiClient.compileWorkstateDraft).mockResolvedValue(CHAIN_COMPILED_OK)
  vi.mocked(apiClient.acceptWorkstateDraft).mockResolvedValue(CHAIN_COMPILED_OK.result)
  executorCalls.executeTier1.mockReturnValue({ ok: true, kind: 'replaced', diagnostics: [] })
  executorCalls.applyAcceptedWorkstate.mockReturnValue({ ok: true, kind: 'replaced', diagnostics: [] })
})

function setup() {
  const { result } = renderHook(() => useWorkstateProposalFlow())
  return result
}

describe('useWorkstateProposalFlow — the chain adapter on the SAME seam', () => {
  it("proposeWorkstate('chain', intent) compiles with adapter:'chain' and the card is the compiling slot (NO accept control)", async () => {
    const flow = setup()
    await act(async () => {
      await flow.current.proposeWorkstate('chain', CHAIN_INTENT)
    })
    expect(apiClient.compileWorkstateDraft).toHaveBeenCalledTimes(1)
    const call = vi.mocked(apiClient.compileWorkstateDraft).mock.calls[0][0]
    expect(call.adapter).toBe('chain')
    expect(call.intent).toEqual(CHAIN_INTENT)
    expect(flow.current.card?.phase).toBe('review')
  })

  it('the SERVER-BUILT card document rides into the card state VERBATIM (claims, reconciliation, ceiling) — the client builds no copy', async () => {
    const flow = setup()
    await act(async () => {
      await flow.current.proposeWorkstate('chain', CHAIN_INTENT)
    })
    const card = flow.current.card
    expect(card?.chainCard).toEqual(CHAIN_COMPILED_OK.result.card)
    expect(card?.chainCard?.claims[0]?.label).toBe('completed')
    expect(card?.chainCard?.reconciliation?.counts).toEqual([
      { label: 'used', count: 1 },
      { label: 'stored', count: 9 },
    ])
    expect(card?.chainCard?.ceilingNote).toBe(CHAIN_COMPILED_OK.result.card.ceilingNote)
  })

  it('canAccept:false ⇒ blocked card carrying the named arithmetic rule id, NO accept path', async () => {
    vi.mocked(apiClient.compileWorkstateDraft).mockResolvedValue(CHAIN_COMPILED_BLOCKED)
    const flow = setup()
    await act(async () => {
      await flow.current.proposeWorkstate('chain', CHAIN_INTENT)
    })
    expect(flow.current.card?.phase).toBe('blocked')
    expect(flow.current.card?.diagnostics?.[0]?.code).toBe('chain-arithmetic:volume-sum-lte-prepared')
    await act(async () => {
      await flow.current.acceptWorkstate()
    })
    expect(apiClient.acceptWorkstateDraft).not.toHaveBeenCalled()
    expect(executorCalls.applyAcceptedWorkstate).not.toHaveBeenCalled()
  })

  it('accept = ONE accept fetch + executor apply with the {accepted:true} attestation + identity; ZERO stream calls; card spent', async () => {
    const flow = setup()
    await act(async () => {
      await flow.current.proposeWorkstate('chain', CHAIN_INTENT)
    })
    await act(async () => {
      await flow.current.acceptWorkstate()
    })
    expect(apiClient.acceptWorkstateDraft).toHaveBeenCalledTimes(1)
    expect(apiClient.acceptWorkstateDraft).toHaveBeenCalledWith({
      draftId: 'DRAFT-CHAIN-1',
      revision: 1,
      reviewHash: 'c'.repeat(64),
    })
    expect(executorCalls.applyAcceptedWorkstate).toHaveBeenCalledTimes(1)
    const [body, attestation, identity] = executorCalls.applyAcceptedWorkstate.mock.calls[0]
    expect(body).toEqual(CHAIN_COMPILED_OK.result)
    expect(attestation).toEqual({ accepted: true })
    expect(identity).toEqual({ draftId: 'DRAFT-CHAIN-1', revision: 1, reviewHash: 'c'.repeat(64) })
    expect(flow.current.card?.phase).toBe('applied')
  })

  it('reject = abandon: zero apiClient calls beyond the compile, pending identity cleared', async () => {
    const flow = setup()
    await act(async () => {
      await flow.current.proposeWorkstate('chain', CHAIN_INTENT)
    })
    act(() => flow.current.rejectWorkstate())
    expect(flow.current.card).toBeNull()
    expect(apiClient.acceptWorkstateDraft).not.toHaveBeenCalled()
  })
})
