/**
 * PB-CH-4 — the Wave-1 mount: AiTabPanel consumes the PB-CH-3 executor and
 * the tier-2 compile→review→accept flow.
 *
 * THE criteria pinned here (spec §1 + reviewer-bait list):
 *  - tier-1 applies on arrival: exactly one executor.executeTier1 call, no
 *    dialog, no second call, no mount-side store dispatch;
 *  - an ok:false executor outcome surfaces its diagnostic text (returned to
 *    the trace) and opens NO dialog / makes NO second call;
 *  - a workstate_proposal event alone renders NO accept control — only the
 *    "compiling…" slot — until the compile response arrives;
 *  - a canAccept:false compile renders summary + diagnostics and NO accept
 *    control;
 *  - with a pending card, advancing 600 ms fires ZERO putSession and the tab
 *    store reference-identity is unchanged (AR-2: no push before accept);
 *  - Accept posts exactly {draftId,revision,reviewHash}; the FLAT response
 *    body is handed to applyAcceptedWorkstate with {accepted:true} + identity;
 *    ZERO /ai/assist/stream fetch occurs during accept (no second AI call);
 *  - Reject drops the card, clears the pending identity, zero apiClient calls,
 *    zero store dispatches;
 *  - a second proposal while one is pending compiles with draftId+revision; a
 *    late response for a superseded compile is DISCARDED (must not resurrect).
 *
 * Harness: AiTabPanel.protocolEdit.test.tsx precedent (option-capturing
 * useChatThread mock, providers mocked per that file) + useSessionSync.test.ts
 * mocked-apiClient store so the push accounting is real. The executor seam is
 * mocked at its module (the panel imports the hook; the hook's internals are
 * pinned in useWorkstateExecutor.test.tsx — PB-CH-3's, consumed as-is).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { WorkspaceProvider } from '../../workspace/WorkspaceContext'
import { defaultWorkspaceState } from '../../workspace/types'
import { OpenTabsProvider, useOpenTabs, type OpenTabsState } from '../../../shared/shell/OpenTabsContext'
import { useSessionSync } from '../../../shared/session/useSessionSync'
import type { SurfaceSpec } from '../../../shared/surfaces'

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 0,
      fingerprints: [''],
      getPage: () => Promise.resolve(null),
      destroy: () => undefined,
    }),
    destroy: () => undefined,
  })),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class {
    render() {
      return Promise.resolve()
    }
  },
}))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.mjs' }))

const mocks = vi.hoisted(() => ({
  chatOptions: null as null | {
    workingFocus?: { protocolId: string; stepId: string; label: string; ordinal?: number }
    onAgentAction?: (action: unknown) => string | undefined
    onWorkstateProposal?: (intent: Record<string, unknown>) => void
    onDraftResult?: (result: unknown, prompt: string) => void
  },
  executeTier1: vi.fn(),
  applyAcceptedWorkstate: vi.fn(),
  compileWorkstateDraft: vi.fn(),
  acceptWorkstateDraft: vi.fn(),
  getSession: vi.fn(),
  putSession: vi.fn(),
  focusedStep: { current: null as null | { stepId: string; label: string; ordinal?: number } },
  protocolIdentity: { current: null as null | { recordId: string; title?: string; sha?: string } },
  openTabsState: { current: null as OpenTabsState | null },
}))

// Registry fixture with RENAMED ids (useWorkstateExecutor.test.tsx precedent —
// registry is data; the card must read labels from it, never hardcode).
const REGISTRY = [
  { id: 'surface-run', label: 'Renamed run surface', path: '/runs/:runId', params: { runId: 'run' }, objectTypes: ['run'], selectableKinds: [] },
] as unknown as SurfaceSpec[]

vi.mock('./useChatThread', () => ({
  useChatThread: (options: {
    workingFocus?: { protocolId: string; stepId: string; label: string; ordinal?: number }
    onAgentAction?: (action: unknown) => string | undefined
    onWorkstateProposal?: (intent: Record<string, unknown>) => void
    onDraftResult?: (result: unknown, prompt: string) => void
  }) => {
    mocks.chatOptions = options
    return {
      state: { messages: [], pending: null, status: null, error: null, trace: [] },
      isStreaming: false,
      send: vi.fn(async () => undefined),
      stop: vi.fn(),
      reset: vi.fn(),
      clearProtocolCandidate: vi.fn(),
    }
  },
}))

vi.mock('../../../shared/session/useWorkstateExecutor', () => ({
  useWorkstateExecutor: () => ({
    executeTier1: mocks.executeTier1,
    applyAcceptedWorkstate: mocks.applyAcceptedWorkstate,
  }),
}))

vi.mock('../../../shared/surfaces/registry', () => ({
  useSurfaceRegistry: () => REGISTRY,
  loadSurfaceRegistry: () => Promise.resolve(REGISTRY),
}))

vi.mock('../../protocol/ProtocolSelectionContext', () => ({
  NO_PROTOCOL_RESOURCES: { labwares: [], equipment: [] },
  NO_LABWARE_BINDINGS: {},
  useProtocolSelection: () => ({
    protocol: mocks.protocolIdentity.current,
    steps: [
      { stepId: 'step-seed', label: 'Seed cells', ordinal: 1, kind: 'add_material' },
      { stepId: 'step-read', label: 'Read plate', ordinal: 2, kind: 'read' },
    ],
    resources: { labwares: [], equipment: [] },
    focusedStep: mocks.focusedStep.current,
    setFocusedStep: vi.fn(),
  }),
}))

vi.mock('../../../shared/api/client', () => ({
  apiClient: {
    warmAiContext: vi.fn(async () => null),
    getAiWarmStatus: vi.fn(async () => null),
    getSurfaces: vi.fn(async () => ({ surfaces: REGISTRY })),
    compileWorkstateDraft: (...args: unknown[]) => mocks.compileWorkstateDraft(...(args as [])),
    acceptWorkstateDraft: (...args: unknown[]) => mocks.acceptWorkstateDraft(...(args as [])),
    getSession: (...args: unknown[]) => mocks.getSession(...(args as [])),
    putSession: (...args: unknown[]) => mocks.putSession(...(args as [])),
  },
}))

import { AiTabPanel } from './AiTabPanel'

const ACTION = {
  action: 'focus' as const,
  target: { kind: 'protocol-step', protocolId: 'PRT-000123', stepId: 'step-read', label: 'Read plate' },
}

const INTENT = {
  operation: 'compose-workstate',
  tabs: [{ surface: 'surface-run', target: { term: 'ROS run' } }],
}

const COMPILED_OK = {
  draftId: 'DRAFT-7',
  revision: 1,
  reviewHash: 'a'.repeat(64),
  canAccept: true,
  diagnostics: [],
  result: {
    sessionDocument: { version: 1, tabs: [{ kind: 'run', runId: 'RUN-9', title: 'ROS run' }], activeTabId: 'run:RUN-9' },
    summary: 'Open the ROS run',
    resolvedTerms: [{ term: 'ROS run', curieOrRecordId: 'RUN-9', label: 'ROS run' }],
  },
}

const FLAT_ACCEPT_BODY = COMPILED_OK.result

function StoreProbe() {
  const tabs = useOpenTabs()
  mocks.openTabsState.current = tabs.state
  return null
}

function SyncMount() {
  useSessionSync()
  return null
}

function renderPanel() {
  const base = defaultWorkspaceState('STU-000001')
  return render(
    <MemoryRouter>
      <OpenTabsProvider>
        <SyncMount />
        <StoreProbe />
        <WorkspaceProvider
          studyId="STU-000001"
          saveDebounceMs={0}
          loadFn={async () => ({
            state: {
              ...base,
              tabs: [{ id: 't1', kind: 'deck' as const, eventGraphId: 'EVG-1', title: 'Deck' }],
              activeTabId: 't1',
            } as ReturnType<typeof defaultWorkspaceState>,
          })}
          saveFn={async (_id, s) => ({ state: s })}
        >
          <AiTabPanel />
        </WorkspaceProvider>
      </OpenTabsProvider>
    </MemoryRouter>,
  )
}

/** Settle useSessionSync's mount-time baseline push so every counted push is
 *  attributable to something the mount did after the card appeared. */
async function settlePushBaseline() {
  await act(async () => {
    vi.advanceTimersByTime(600)
  })
  mocks.putSession.mockClear()
}

beforeEach(() => {
  vi.useFakeTimers()
  window.localStorage.clear()
  // Friction-first proof: confirm must be a SPY so "no dialog" is testable,
  // and a call would return false rather than block the test.
  vi.spyOn(window, 'confirm').mockImplementation(() => false)
  mocks.chatOptions = null
  mocks.executeTier1.mockReset()
  mocks.executeTier1.mockReturnValue({ ok: true, kind: 'focused', diagnostics: [] })
  mocks.applyAcceptedWorkstate.mockReset()
  mocks.applyAcceptedWorkstate.mockReturnValue({ ok: true, kind: 'replaced', diagnostics: [] })
  mocks.compileWorkstateDraft.mockReset()
  mocks.acceptWorkstateDraft.mockReset()
  mocks.getSession.mockReset()
  mocks.getSession.mockResolvedValue({
    session: { version: 1, userId: 'default', tabs: [], activeTabId: null, updatedAt: '2026-10-07T00:00:00.000Z' },
  })
  mocks.putSession.mockReset()
  mocks.putSession.mockResolvedValue({ session: { updatedAt: '2026-10-07T00:00:01.000Z' } })
  mocks.openTabsState.current = null
  mocks.focusedStep.current = null
  mocks.protocolIdentity.current = { recordId: 'PRT-000123', title: 'ROS assay' }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function mount() {
  renderPanel()
  await act(async () => {
    await Promise.resolve()
  })
  await settlePushBaseline()
}

describe('AiTabPanel — tier-1 mount (applies on arrival)', () => {
  it('an agent_action event causes exactly one executor.executeTier1 call with the payload — no dialog, no second call, no mount-side store dispatch', async () => {
    await mount()
    const storeBefore = mocks.openTabsState.current

    await act(async () => {
      mocks.chatOptions?.onAgentAction?.(ACTION)
    })

    expect(mocks.executeTier1).toHaveBeenCalledTimes(1)
    expect(mocks.executeTier1).toHaveBeenCalledWith(ACTION)
    // No confirm dialog anywhere (friction-first + PB-CH-3 conservative path).
    expect(window.confirm).not.toHaveBeenCalled()
    // The mount dispatches NOTHING itself: same store reference, zero pushes.
    expect(mocks.openTabsState.current).toBe(storeBefore)
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(mocks.putSession).not.toHaveBeenCalled()
    expect(mocks.compileWorkstateDraft).not.toHaveBeenCalled()
  })

  it('an ok:false executor outcome returns its diagnostic message for the trace and opens no dialog / makes no second call', async () => {
    await mount()
    const storeBefore = mocks.openTabsState.current
    mocks.executeTier1.mockReturnValue({
      ok: false,
      kind: 'noop',
      diagnostics: [{ code: 'NO_TAB_STORE', message: 'no OpenTabsProvider mounted; tier-1 actions do not fall back to window hacks', path: 'openTabs' }],
    })

    const outcomeText = await act(async () => {
      return mocks.chatOptions?.onAgentAction?.(ACTION)
    })

    expect(outcomeText).toContain('no OpenTabsProvider mounted')
    expect(window.confirm).not.toHaveBeenCalled()
    expect(mocks.compileWorkstateDraft).not.toHaveBeenCalled()
    expect(mocks.acceptWorkstateDraft).not.toHaveBeenCalled()
    expect(mocks.openTabsState.current).toBe(storeBefore)
  })

  it('with focusedStep set, the mount threads workingFocus into the chat options; with none focused the key is ABSENT', async () => {
    mocks.focusedStep.current = { stepId: 'step-read', label: 'Read plate', ordinal: 2 }
    await mount()
    expect(mocks.chatOptions?.workingFocus).toEqual({
      protocolId: 'PRT-000123',
      stepId: 'step-read',
      label: 'Read plate',
      ordinal: 2,
    })

    cleanup()
    mocks.focusedStep.current = null
    await mount()
    expect('workingFocus' in (mocks.chatOptions ?? {})).toBe(false)
  })
})

describe('AiTabPanel — tier-2 card (actionable ONLY from a canAccept:true compile)', () => {
  it('a workstate_proposal event alone renders NO accept control (compiling slot) until the compile response arrives', async () => {
    await mount()
    let resolveCompile: (v: unknown) => void = () => undefined
    mocks.compileWorkstateDraft.mockImplementationOnce(
      () => new Promise((resolve) => { resolveCompile = resolve }),
    )

    await act(async () => {
      mocks.chatOptions?.onWorkstateProposal?.(INTENT)
    })

    expect(mocks.compileWorkstateDraft).toHaveBeenCalledTimes(1)
    expect(mocks.compileWorkstateDraft).toHaveBeenCalledWith({ adapter: 'workstate', intent: INTENT })
    expect(screen.getByTestId('workstate-card-compiling')).toBeTruthy()
    expect(screen.queryByTestId('workstate-card-accept')).toBeNull()

    await act(async () => {
      resolveCompile(COMPILED_OK)
      await Promise.resolve()
    })
    expect(screen.getByTestId('workstate-card-accept')).toBeTruthy()
  })

  it('compile response canAccept:false renders summary + diagnostics and NO accept control', async () => {
    await mount()
    mocks.compileWorkstateDraft.mockResolvedValue({
      draftId: 'DRAFT-8',
      revision: 1,
      reviewHash: 'b'.repeat(64),
      canAccept: false,
      diagnostics: [
        { code: 'DRAFT_INVALID', severity: 'error', message: 'tabs.0: term "bogus thing" resolves to nothing in this lab' },
      ],
      result: { summary: 'Open the bogus thing' },
    })

    await act(async () => {
      mocks.chatOptions?.onWorkstateProposal?.(INTENT)
      await Promise.resolve()
    })

    expect(screen.queryByTestId('workstate-card-accept')).toBeNull()
    expect(screen.getByTestId('workstate-card').textContent).toContain('resolves to nothing in this lab')
    expect(screen.getByTestId('workstate-card').textContent).toContain('Open the bogus thing')
  })

  it('with a pending card, advancing 600 ms fires ZERO putSession and the tab store reference-identity is unchanged (AR-2)', async () => {
    await mount()
    mocks.compileWorkstateDraft.mockResolvedValue(COMPILED_OK)

    await act(async () => {
      mocks.chatOptions?.onWorkstateProposal?.(INTENT)
      await Promise.resolve()
    })
    const storeBefore = mocks.openTabsState.current
    expect(screen.getByTestId('workstate-card-accept')).toBeTruthy()

    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(mocks.putSession).not.toHaveBeenCalled()
    expect(mocks.openTabsState.current).toBe(storeBefore)
    // And the proposed sessionDocument never entered the tab store.
    expect(storeBefore?.tabs.some((t) => t.tab.id === 'run:RUN-9')).toBe(false)
  })

  it('Accept posts exactly {draftId,revision,reviewHash}; the FLAT body goes to applyAcceptedWorkstate with {accepted:true} + identity; ZERO /ai/assist/stream fetch during accept', async () => {
    await mount()
    mocks.compileWorkstateDraft.mockResolvedValue(COMPILED_OK)
    mocks.acceptWorkstateDraft.mockResolvedValue(FLAT_ACCEPT_BODY)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await act(async () => {
      mocks.chatOptions?.onWorkstateProposal?.(INTENT)
      await Promise.resolve()
    })
    fireEvent.click(screen.getByTestId('workstate-card-accept'))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.acceptWorkstateDraft).toHaveBeenCalledTimes(1)
    expect(mocks.acceptWorkstateDraft).toHaveBeenCalledWith({
      draftId: 'DRAFT-7',
      revision: 1,
      reviewHash: 'a'.repeat(64),
    })
    expect(mocks.applyAcceptedWorkstate).toHaveBeenCalledTimes(1)
    expect(mocks.applyAcceptedWorkstate).toHaveBeenCalledWith(
      FLAT_ACCEPT_BODY,
      { accepted: true },
      { draftId: 'DRAFT-7', revision: 1, reviewHash: 'a'.repeat(64) },
    )
    // No second AI call at accept time — ever.
    for (const call of fetchSpy.mock.calls) {
      expect(String(call[0])).not.toContain('assist/stream')
    }
    // Spent card: controls disappear (no dead buttons). (No waitFor here:
    // testing-library's waitFor cannot detect vitest fake timers and would
    // hang; the act flush above already committed the state update.)
    expect(screen.queryByTestId('workstate-card-accept')).toBeNull()
    expect(screen.getByTestId('workstate-card').textContent).toContain('Applied')
  })

  it('a failed accept (executor ok:false) shows diagnostics, keeps the card rejectable, and moved nothing', async () => {
    await mount()
    mocks.compileWorkstateDraft.mockResolvedValue(COMPILED_OK)
    mocks.acceptWorkstateDraft.mockResolvedValue({ nonsense: true })
    mocks.applyAcceptedWorkstate.mockReturnValue({
      ok: false,
      kind: 'noop',
      diagnostics: [{ code: 'MALFORMED_ACCEPTED_DOCUMENT', message: 'accept body carries no sessionDocument', path: 'body.sessionDocument' }],
    })
    const storeBefore = mocks.openTabsState.current

    await act(async () => {
      mocks.chatOptions?.onWorkstateProposal?.(INTENT)
      await Promise.resolve()
    })
    fireEvent.click(screen.getByTestId('workstate-card-accept'))
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByTestId('workstate-card').textContent).toContain('accept body carries no sessionDocument')
    expect(screen.getByTestId('workstate-card-reject')).toBeTruthy()
    expect(mocks.openTabsState.current).toBe(storeBefore)
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(mocks.putSession).not.toHaveBeenCalled()
  })

  it('Reject drops the card, clears the pending identity, zero apiClient calls, zero store dispatches', async () => {
    await mount()
    mocks.compileWorkstateDraft.mockResolvedValue(COMPILED_OK)

    await act(async () => {
      mocks.chatOptions?.onWorkstateProposal?.(INTENT)
      await Promise.resolve()
    })
    const storeBefore = mocks.openTabsState.current
    const compileCallsBefore = mocks.compileWorkstateDraft.mock.calls.length

    fireEvent.click(screen.getByTestId('workstate-card-reject'))
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.queryByTestId('workstate-card')).toBeNull()
    expect(mocks.compileWorkstateDraft.mock.calls.length).toBe(compileCallsBefore)
    expect(mocks.acceptWorkstateDraft).not.toHaveBeenCalled()
    expect(mocks.openTabsState.current).toBe(storeBefore)
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(mocks.putSession).not.toHaveBeenCalled()
  })

  it('a second proposal while one is pending compiles with draftId+revision; a late response for a superseded compile is DISCARDED', async () => {
    await mount()

    // Phase 1: a resolved compile gives the mount its one pending identity.
    mocks.compileWorkstateDraft.mockResolvedValueOnce(COMPILED_OK)
    await act(async () => {
      mocks.chatOptions?.onWorkstateProposal?.(INTENT)
      await Promise.resolve()
    })
    expect(screen.getByTestId('workstate-card').textContent).toContain('revision 1')

    // Phase 2: two more proposals arrive while the card is pending. Each bumps
    // the SAME draft (server-side deterministic recompile) and supersedes the
    // previous compile — the ref holds at most one pending identity.
    let resolveSuperseded: (v: unknown) => void = () => undefined
    let resolveCurrent: (v: unknown) => void = () => undefined
    mocks.compileWorkstateDraft
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSuperseded = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveCurrent = resolve }))

    await act(async () => {
      mocks.chatOptions?.onWorkstateProposal?.({ ...INTENT, activeTab: { index: 0 } })
    })
    expect(mocks.compileWorkstateDraft).toHaveBeenLastCalledWith({
      adapter: 'workstate',
      intent: { ...INTENT, activeTab: { index: 0 } },
      draftId: 'DRAFT-7',
      revision: 1,
    })
    expect(screen.getByTestId('workstate-card-compiling')).toBeTruthy()
    expect(screen.queryByTestId('workstate-card-accept')).toBeNull()

    await act(async () => {
      mocks.chatOptions?.onWorkstateProposal?.({ ...INTENT, activeTab: { index: 1 } })
    })
    expect(mocks.compileWorkstateDraft).toHaveBeenLastCalledWith({
      adapter: 'workstate',
      intent: { ...INTENT, activeTab: { index: 1 } },
      draftId: 'DRAFT-7',
      revision: 1,
    })
    expect(screen.getByTestId('workstate-card-compiling')).toBeTruthy()

    // The CURRENT compile resolves → the review card shows revision 2.
    await act(async () => {
      resolveCurrent({ ...COMPILED_OK, revision: 2, reviewHash: 'c'.repeat(64), result: { ...COMPILED_OK.result, summary: 'Newer workspace' } })
      await Promise.resolve()
    })
    expect(screen.getByTestId('workstate-card').textContent).toContain('Newer workspace')
    expect(screen.getByTestId('workstate-card').textContent).toContain('revision 2')

    // The SUPERSEDED compile lands late: it must not resurrect or overwrite.
    await act(async () => {
      resolveSuperseded({ ...COMPILED_OK, result: { ...COMPILED_OK.result, summary: 'Superseded workspace' } })
      await Promise.resolve()
    })
    expect(screen.getByTestId('workstate-card').textContent).toContain('Newer workspace')
    expect(screen.getByTestId('workstate-card').textContent).not.toContain('Superseded workspace')
    expect(screen.getByTestId('workstate-card').textContent).toContain('revision 2')
  })
})

describe('AiTabPanel — D1 gate fix: a workstate turn never opens the event-graph review', () => {
  // Gate defect D1 (receipts 2026-10-07_orchgate2, wave1-pending-card.png,
  // card-state cardVisible:false): the compose_workstate turn ALSO fires the
  // event-graph onDraftResult path — the result carries notes only (no error,
  // no protocolEdit, no clarificationRequests, empty events), so it fell to
  // the final else and dispatched draft-ready with changes:[] — sidebar
  // 'reviewing', auto subtab 'changes', the chat section (where the card
  // renders) UNMOUNTED, and an actionable 'Apply to run' over an empty change
  // list. The card must be the turn's ONLY review surface.
  //
  // Event ordering VERIFIED in code (not assumed): the server emits
  // `workstate_proposal` DURING orchestrator.run (server/src/ai/
  // AgentOrchestrator.ts:2199, compose_workstate branch) and `done` is sent
  // only AFTER run() resolves (server/src/api/handlers/AIHandlers.ts:288) —
  // so in the SSE stream the proposal frame always precedes the done frame.
  // The guard below is still written so a stale flag can never leak into a
  // later turn (consumed in onDraftResult + cleared on every next send).
  it('a done result on a turn that emitted workstate_proposal keeps the card as the ONLY review surface — no reviewing mode, no Apply to run', async () => {
    await mount()
    mocks.compileWorkstateDraft.mockResolvedValue(COMPILED_OK)

    // Same-turn stream, verified order: workstate_proposal, then done.
    await act(async () => {
      mocks.chatOptions?.onWorkstateProposal?.(INTENT)
      await Promise.resolve()
    })
    expect(screen.getByTestId('workstate-card-accept')).toBeTruthy()

    // The turn's `done` result — compose_workstate's AgentResult verbatim
    // (AgentOrchestrator.ts: notes only; success:true; no events/error/
    // protocolEdit/clarifications).
    await act(async () => {
      mocks.chatOptions?.onDraftResult?.(
        { success: true, notes: ['Proposed a workspace — review the card to accept; nothing was written.'] },
        'open the ROS run',
      )
      await Promise.resolve()
    })

    // (a) the card is STILL rendered — compiling slot at minimum, here the
    // review card; the chat section did not unmount.
    expect(screen.getByTestId('workstate-card')).toBeTruthy()
    expect(screen.getByTestId('workstate-card-accept')).toBeTruthy()
    // (b) the pane is NOT in 'reviewing'/changes mode.
    expect(screen.queryByTestId('ai-subtab-changes')).toBeNull()
    expect(screen.getByTestId('ai-tab-system-prompt').textContent).not.toContain('Review changes')
    // (c) NO 'Apply to run' affordance anywhere.
    expect(screen.queryByTestId('changes-apply')).toBeNull()
    expect(screen.queryByText('Apply to run')).toBeNull()
    // The chat subtab stays active while the card is pending.
    expect(screen.getByTestId('ai-subtab-chat').className).toContain('ai-tab__subtab--active')
    // Invariants untouched: no accept fired, zero session push while pending.
    expect(mocks.acceptWorkstateDraft).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(mocks.putSession).not.toHaveBeenCalled()
  })

  it('the guard is per-turn: once the card is rejected, a later plain draft result still opens the changes review', async () => {
    await mount()
    mocks.compileWorkstateDraft.mockResolvedValue(COMPILED_OK)

    await act(async () => {
      mocks.chatOptions?.onWorkstateProposal?.(INTENT)
      await Promise.resolve()
    })
    await act(async () => {
      mocks.chatOptions?.onDraftResult?.({ success: true, notes: ['Proposed a workspace.'] }, 'open the ROS run')
      await Promise.resolve()
    })
    expect(screen.queryByTestId('ai-subtab-changes')).toBeNull()

    // Reject resolves the card; the guard flag was already consumed by the
    // turn's done — a subsequent event-graph draft must review normally.
    fireEvent.click(screen.getByTestId('workstate-card-reject'))
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      mocks.chatOptions?.onDraftResult?.({ success: true, events: [{ event_type: 'transfer' }] }, 'draft a transfer')
      await Promise.resolve()
    })
    expect(screen.getByTestId('ai-subtab-changes')).toBeTruthy()
    expect(screen.getByTestId('changes-apply')).toBeTruthy()
  })
})
