/**
 * PB-CH-6 — the shared proposal flow (ONE compile→card→accept/reject
 * implementation, lifted from AiTabPanel's inline orchestration).
 *
 * Pinned behavior (identical to the wave-1 contract pinned by
 * AiTabPanel.workstate.test.tsx — this file is the SAME contract asserted at
 * the shared seam so the mounts cannot fork it):
 *  - no accept control until a server compile says canAccept:true;
 *  - canAccept:false ⇒ blocked card with diagnostics, NO accept control;
 *  - a newer proposal supersedes an in-flight compile; a late response for a
 *    superseded compile is DISCARDED (never resurrected);
 *  - accept = exactly ONE accept fetch + the executor apply with the
 *    {accepted:true} attestation + identity; ZERO stream calls;
 *  - executor duplicate-guard outcome (duplicate-ignored) spends the card too;
 *  - executor ok:false ⇒ card returns to blocked with the executor's
 *    diagnostics verbatim;
 *  - reject = abandon: zero apiClient calls, pending identity cleared;
 *  - agent_action narrowing → executor.executeTier1; unroutable frame →
 *    NAMED diagnostic text, never a guess.
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

const INTENT = {
  operation: 'compose-workstate',
  tabs: [{ surface: 'analysis', title: 'Analysis' }],
  activeTab: { index: 0 },
}

const COMPILED_OK = {
  draftId: 'DRAFT-11',
  revision: 2,
  reviewHash: 'b'.repeat(64),
  canAccept: true,
  diagnostics: [],
  result: {
    sessionDocument: { version: 1, tabs: [{ kind: 'analysis', title: 'Analysis' }], activeTabId: null },
    summary: 'Open the analysis surface',
    resolvedTerms: [{ term: 'analysis', label: 'Analysis' }],
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiClient.compileWorkstateDraft).mockResolvedValue(COMPILED_OK)
  vi.mocked(apiClient.acceptWorkstateDraft).mockResolvedValue(COMPILED_OK.result)
  executorCalls.executeTier1.mockReturnValue({ ok: true, kind: 'replaced', diagnostics: [] })
  executorCalls.applyAcceptedWorkstate.mockReturnValue({ ok: true, kind: 'replaced', diagnostics: [] })
})

function setup() {
  const { result } = renderHook(() => useWorkstateProposalFlow())
  return result
}

describe('useWorkstateProposalFlow — compile→card lifecycle', () => {
  it('proposal fires the compile with the adapter as a parameter; card is the compiling slot (NO accept control)', async () => {
    const result = setup()
    act(() => {
      void result.current.proposeWorkstate('workstate', INTENT)
    })
    expect(result.current.card?.phase).toBe('compiling')
    await waitFor(() => expect(result.current.card?.phase).toBe('review'))
    expect(apiClient.compileWorkstateDraft).toHaveBeenCalledTimes(1)
    expect(apiClient.compileWorkstateDraft).toHaveBeenCalledWith({ adapter: 'workstate', intent: INTENT })
    expect(result.current.card?.draftId).toBe('DRAFT-11')
    expect(result.current.card?.revision).toBe(2)
  })

  it('the analysis adapter rides the SAME flow (one constant, not a fork)', async () => {
    const result = setup()
    act(() => {
      void result.current.proposeWorkstate('analysis', INTENT)
    })
    await waitFor(() => expect(result.current.card?.phase).toBe('review'))
    expect(apiClient.compileWorkstateDraft).toHaveBeenCalledWith({ adapter: 'analysis', intent: INTENT })
  })

  it('canAccept:false ⇒ blocked card with diagnostics and NO accept path (accept is a no-op)', async () => {
    vi.mocked(apiClient.compileWorkstateDraft).mockResolvedValueOnce({
      draftId: 'DRAFT-12',
      revision: 1,
      reviewHash: 'c'.repeat(64),
      canAccept: false,
      diagnostics: [{ code: 'UNRESOLVED_TERM', message: 'term not in registry' }],
    })
    const result = setup()
    act(() => {
      void result.current.proposeWorkstate('workstate', INTENT)
    })
    await waitFor(() => expect(result.current.card?.phase).toBe('blocked'))
    expect(result.current.card?.diagnostics?.[0]?.message).toBe('term not in registry')
    act(() => {
      void result.current.acceptWorkstate()
    })
    expect(apiClient.acceptWorkstateDraft).not.toHaveBeenCalled()
  })

  it('a compile transport failure renders a blocked card with the error message — nothing was written', async () => {
    vi.mocked(apiClient.compileWorkstateDraft).mockRejectedValueOnce(new Error('compile endpoint down'))
    const result = setup()
    act(() => {
      void result.current.proposeWorkstate('workstate', INTENT)
    })
    await waitFor(() => expect(result.current.card?.phase).toBe('blocked'))
    expect(result.current.card?.diagnostics?.[0]?.message).toContain('compile endpoint down')
  })

  it('a newer proposal supersedes an in-flight compile; the late response is DISCARDED', async () => {
    let resolveFirst: ((v: typeof COMPILED_OK) => void) | null = null
    vi.mocked(apiClient.compileWorkstateDraft).mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirst = resolve }),
    )
    const result = setup()
    act(() => {
      void result.current.proposeWorkstate('workstate', { ...INTENT, activeTab: { index: 0 } })
    })
    expect(apiClient.compileWorkstateDraft).toHaveBeenCalledTimes(1)
    act(() => {
      void result.current.proposeWorkstate('workstate', { ...INTENT, activeTab: { index: 1 } })
    })
    await waitFor(() => expect(result.current.card?.phase).toBe('review'))
    // The first (superseded) compile now answers late — it must not resurrect.
    act(() => {
      resolveFirst?.({ ...COMPILED_OK, draftId: 'DRAFT-STALE', revision: 99 })
    })
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current.card?.draftId).not.toBe('DRAFT-STALE')
    expect(result.current.card?.phase).toBe('review')
  })

  it('accept = ONE accept fetch with {draftId,revision,reviewHash} + executor apply with attestation + identity; card spent to applied', async () => {
    const result = setup()
    act(() => {
      void result.current.proposeWorkstate('workstate', INTENT)
    })
    await waitFor(() => expect(result.current.card?.phase).toBe('review'))
    await act(async () => {
      await result.current.acceptWorkstate()
    })
    expect(apiClient.acceptWorkstateDraft).toHaveBeenCalledTimes(1)
    expect(apiClient.acceptWorkstateDraft).toHaveBeenCalledWith({
      draftId: 'DRAFT-11',
      revision: 2,
      reviewHash: 'b'.repeat(64),
    })
    expect(executorCalls.applyAcceptedWorkstate).toHaveBeenCalledTimes(1)
    expect(executorCalls.applyAcceptedWorkstate).toHaveBeenCalledWith(
      COMPILED_OK.result,
      { accepted: true },
      { draftId: 'DRAFT-11', revision: 2, reviewHash: 'b'.repeat(64) },
    )
    expect(result.current.card?.phase).toBe('applied')
  })

  it('executor duplicate-guard outcome (duplicate-ignored) spends the card — no dead buttons', async () => {
    executorCalls.applyAcceptedWorkstate.mockReturnValue({ ok: true, kind: 'duplicate-ignored', diagnostics: [] })
    const result = setup()
    act(() => {
      void result.current.proposeWorkstate('workstate', INTENT)
    })
    await waitFor(() => expect(result.current.card?.phase).toBe('review'))
    await act(async () => {
      await result.current.acceptWorkstate()
    })
    expect(result.current.card?.phase).toBe('applied')
  })

  it('executor ok:false ⇒ card returns to blocked with the executor diagnostics verbatim', async () => {
    executorCalls.applyAcceptedWorkstate.mockReturnValue({
      ok: false,
      kind: 'noop',
      diagnostics: [{ code: 'NO_TAB_STORE', message: 'no OpenTabsProvider mounted; tier-1 actions do not fall back to window hacks', path: 'openTabs' }],
    })
    const result = setup()
    act(() => {
      void result.current.proposeWorkstate('workstate', INTENT)
    })
    await waitFor(() => expect(result.current.card?.phase).toBe('review'))
    await act(async () => {
      await result.current.acceptWorkstate()
    })
    expect(result.current.card?.phase).toBe('blocked')
    expect(result.current.card?.diagnostics?.[0]?.code).toBe('NO_TAB_STORE')
    expect(result.current.card?.diagnostics?.[0]?.message).toContain('window hacks')
  })

  it('reject = abandon: card cleared, zero accept/compile calls, a later accept is a no-op', async () => {
    const result = setup()
    act(() => {
      void result.current.proposeWorkstate('workstate', INTENT)
    })
    await waitFor(() => expect(result.current.card?.phase).toBe('review'))
    act(() => {
      result.current.rejectWorkstate()
    })
    expect(result.current.card).toBeNull()
    act(() => {
      void result.current.acceptWorkstate()
    })
    expect(apiClient.acceptWorkstateDraft).not.toHaveBeenCalled()
  })

  it('agent_action narrowing → executeTier1; an unroutable frame returns a NAMED diagnostic and calls nothing', () => {
    const result = setup()
    const diagnostic = result.current.handleAgentAction({ action: 'open-surface' })
    expect(executorCalls.executeTier1).not.toHaveBeenCalled()
    expect(diagnostic).toBe('Agent action carried no routable target — nothing was written.')

    const okDiagnostic = result.current.handleAgentAction({ action: 'open-surface', surface: 'analysis' })
    expect(executorCalls.executeTier1).toHaveBeenCalledTimes(1)
    expect(okDiagnostic).toBeUndefined()

    executorCalls.executeTier1.mockReturnValueOnce({
      ok: false,
      kind: 'noop',
      diagnostics: [{ code: 'NO_TAB_STORE', message: 'no OpenTabsProvider mounted; tier-1 actions do not fall back to window hacks', path: 'openTabs' }],
    })
    const failed = result.current.handleAgentAction({ action: 'open-surface', surface: 'analysis' })
    expect(failed).toContain('window hacks')
  })
})
