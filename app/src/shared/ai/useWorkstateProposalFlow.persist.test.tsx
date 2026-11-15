/**
 * L2-P1-THREAD-RESTORE-1 (u1persist) — Gate-8 defect 6 (PROMPT1-GATE-20261114T193636Z):
 * the pending compiled proposal is DURABLE across a page reload. The card view +
 * the pending identity ride sessionStorage under ONE key
 * (`cl.workstate-pending-proposal`) — the tab's own checkpoint (the
 * aiThreadClient `cl.ai-thread-tab-ids` / SequenceEditor `cl-sequence-proposal`
 * precedent). The compiled draft itself already survives the server restart
 * (git-backed RecordStore); stale authority is the SERVER's rejection — a
 * spent/superseded identity fails accept through the single writer with a named
 * diagnostic, never a double write.
 *
 * Pinned:
 *  - a compile resolved to phase 'review' writes exactly ONE entry carrying
 *    {adapter, identity:{draftId,revision,reviewHash}, cardView} (the card's
 *    plain-data view — summary/tabs/resolvedTerms ride verbatim);
 *  - a FRESH hook instance (remount) rehydrates the card at phase 'review'
 *    with the SAME identity WITHOUT calling the compile endpoint again;
 *  - accept-success and reject each CLEAR the entry (the spend/abandon is
 *    durable — the bar must not resurrect on reload);
 *  - corrupt JSON in the key ⇒ card stays null, the key is removed, no throw;
 *  - a canAccept:false (blocked) compile CLEARS any older entry — rehydration
 *    forces phase 'review', so persisting a blocked card would manufacture an
 *    accept control the server denied (the trust rule, unchanged);
 *  - a rehydrated accept against a spent draft does NOT crash the client:
 *    the server's rejection lands as a blocked diagnostic (no server text pinned).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
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

const KEY = 'cl.workstate-pending-proposal'

const INTENT = {
  operation: 'compose-workstate',
  tabs: [{ surface: 'analysis', title: 'Analysis' }],
  activeTab: { index: 0 },
}

const COMPILED_OK = {
  draftId: 'DRAFT-P1',
  revision: 3,
  reviewHash: 'e'.repeat(64),
  canAccept: true,
  diagnostics: [],
  result: {
    sessionDocument: { version: 1, tabs: [{ kind: 'analysis', title: 'Analysis' }], activeTabId: null },
    summary: 'Open the analysis surface',
    resolvedTerms: [{ term: 'analysis', label: 'Analysis' }],
  },
}

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  vi.mocked(apiClient.compileWorkstateDraft).mockResolvedValue(COMPILED_OK)
  vi.mocked(apiClient.acceptWorkstateDraft).mockResolvedValue(COMPILED_OK.result)
  executorCalls.applyAcceptedWorkstate.mockReturnValue({ ok: true, kind: 'replaced', diagnostics: [] })
})

function setup() {
  return renderHook(() => useWorkstateProposalFlow())
}

async function compileToReview() {
  const hook = setup()
  act(() => {
    void hook.result.current.proposeWorkstate('workstate', INTENT)
  })
  await waitFor(() => expect(hook.result.current.card?.phase).toBe('review'))
  return hook
}

describe('u1persist — the pending compiled proposal is durable across a reload', () => {
  it('a review compile writes exactly ONE sessionStorage entry carrying {adapter, identity, cardView}', async () => {
    await compileToReview()
    expect(apiClient.compileWorkstateDraft).toHaveBeenCalledTimes(1)
    const raw = sessionStorage.getItem(KEY)
    expect(raw).not.toBeNull()
    const entry = JSON.parse(raw as string)
    expect(entry.adapter).toBe('workstate')
    expect(entry.identity).toEqual({ draftId: 'DRAFT-P1', revision: 3, reviewHash: 'e'.repeat(64) })
    // cardView is the card's plain data — the view fields ride verbatim.
    expect(entry.cardView).toEqual({
      adapter: 'workstate',
      phase: 'review',
      summary: 'Open the analysis surface',
      tabs: [{ kind: 'analysis', title: 'Analysis' }],
      resolvedTerms: [{ term: 'analysis', label: 'Analysis' }],
      draftId: 'DRAFT-P1',
      revision: 3,
    })
  })

  it('a remount (fresh instance, NO compile call) rehydrates the card at phase review with the SAME identity — zero extra fetches; the rehydrated card is ACCEPTABLE', async () => {
    const first = await compileToReview()
    const cardView = first.result.current.card
    first.unmount()
    const second = setup()
    // Rehydration is synchronous on mount — no compile in flight, ever.
    expect(second.result.current.card?.phase).toBe('review')
    expect(second.result.current.card?.draftId).toBe(cardView?.draftId)
    expect(second.result.current.card?.revision).toBe(cardView?.revision)
    expect(second.result.current.card?.summary).toBe(cardView?.summary)
    expect(apiClient.compileWorkstateDraft).toHaveBeenCalledTimes(1) // still the original — never re-compiled
    await act(async () => {
      await second.result.current.acceptWorkstate()
    })
    expect(apiClient.acceptWorkstateDraft).toHaveBeenCalledTimes(1)
    expect(apiClient.acceptWorkstateDraft).toHaveBeenCalledWith({
      draftId: 'DRAFT-P1',
      revision: 3,
      reviewHash: 'e'.repeat(64),
    })
    expect(second.result.current.card?.phase).toBe('applied')
    expect(sessionStorage.getItem(KEY)).toBeNull() // the spend cleared the entry
  })

  it('accept-success CLEARS the entry', async () => {
    const hook = await compileToReview()
    expect(sessionStorage.getItem(KEY)).not.toBeNull() // the write happened (acceptance 1)
    await act(async () => {
      await hook.result.current.acceptWorkstate()
    })
    expect(hook.result.current.card?.phase).toBe('applied')
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })

  it('reject CLEARS the entry', async () => {
    const hook = await compileToReview()
    expect(sessionStorage.getItem(KEY)).not.toBeNull()
    act(() => {
      hook.result.current.rejectWorkstate()
    })
    expect(hook.result.current.card).toBeNull()
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })

  it('corrupt JSON in the key ⇒ card null, key removed, no throw', () => {
    sessionStorage.setItem(KEY, '{not-json')
    const hook = setup()
    expect(hook.result.current.card).toBeNull()
    expect(sessionStorage.getItem(KEY)).toBeNull()
    expect(apiClient.compileWorkstateDraft).not.toHaveBeenCalled()
  })

  it('a canAccept:false compile CLEARS any older entry — no rehydrated accept control for a server-denied draft', async () => {
    const hook = await compileToReview()
    expect(sessionStorage.getItem(KEY)).not.toBeNull()
    vi.mocked(apiClient.compileWorkstateDraft).mockResolvedValueOnce({
      draftId: 'DRAFT-P2',
      revision: 1,
      reviewHash: 'f'.repeat(64),
      canAccept: false,
      diagnostics: [{ code: 'UNRESOLVED_TERM', message: 'term not in registry' }],
    })
    act(() => {
      void hook.result.current.proposeWorkstate('workstate', INTENT)
    })
    await waitFor(() => expect(hook.result.current.card?.phase).toBe('blocked'))
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })

  it('a rehydrated accept against a spent draft does NOT crash — the server rejection lands as a blocked diagnostic (no server text pinned)', async () => {
    const first = await compileToReview()
    first.unmount()
    const second = setup()
    expect(second.result.current.card?.phase).toBe('review')
    vi.mocked(apiClient.acceptWorkstateDraft).mockRejectedValueOnce(new Error('stale draft identity (server rejection)'))
    await act(async () => {
      await second.result.current.acceptWorkstate()
    })
    expect(second.result.current.card?.phase).toBe('blocked')
    expect(second.result.current.card?.diagnostics?.[0]?.message).toContain('stale draft identity')
    expect(sessionStorage.getItem(KEY)).not.toBeNull() // a failed accept is not a spend — the entry survives
  })
})
