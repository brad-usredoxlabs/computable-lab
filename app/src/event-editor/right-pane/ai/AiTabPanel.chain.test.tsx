/**
 * MATRES-CHAIN fix-run 2 (gate defect D1/D2, receipts
 * /home/brad/.hermes/cl/receipts/MATRES-CHAIN/2026-10-24_115822/report.md) —
 * the ROUTED run surface relays chain_proposal and mounts the review wall.
 *
 * RED AT BASE: the mounted panel on the routed page (AiTabPanel, mounted via
 * agent/AgentChatPane.tsx on /runs/:runId) never passes onChainProposal to its
 * chat hook, so the frame is swallowed (callback undefined), no compile request
 * is issued, and ChainProposalCard never renders. The only mount that passed
 * the callback lived on a page no route serves (graph/RunWorkspacePage.tsx).
 *
 * THE criteria pinned here (the gate's C1–C7 wiring half + the honesty
 * discipline the workstate guard already enforces):
 *  - the routed panel WIRES onChainProposal into useChatThread (the relay
 *    exists — the frame is not swallowed);
 *  - a chain_proposal relay issues EXACTLY ONE compile request with adapter
 *    'chain' and the INTENT verbatim (POST /api/drafts/compile is THE trust
 *    boundary — the same shared flow, one adapter constant, not a fork);
 *  - the compiling slot renders with NO accept control until the compile
 *    response arrives (PB-CH-4 discipline);
 *  - a canAccept:true compile mounts ChainProposalCard carrying the
 *    SERVER-BUILT card document verbatim (artifactKind header, verbatim claim
 *    labels, reconciliation readout, honesty ceiling) with Accept/Reject;
 *  - a canAccept:false compile renders the diagnostics with NO accept control
 *    (blocked wall, PROTO-AI-9 R-Defect-2 class);
 *  - Accept posts exactly {draftId,revision,reviewHash}; the FLAT body goes to
 *    applyAcceptedWorkstate with {accepted:true} + identity; ZERO
 *    /ai/assist/stream fetch during accept; the spent card loses its controls;
 *  - Reject drops the card: zero further apiClient calls, zero store pushes;
 *  - with a pending chain card, advancing 600 ms fires ZERO putSession and the
 *    tab store reference-identity is unchanged (AR-2: no push before accept);
 *  - a notes-only `done` result on a chain turn keeps the card as the ONLY
 *    review surface — no 'reviewing' mode, no empty 'Apply to run'
 *    (PB-CH-4 D1 / PB-CH-8 fix1 turn-flag discipline, now covering chain turns).
 *
 * Harness: AiTabPanel.workstate.test.tsx precedent verbatim (option-capturing
 * useChatThread mock, providers mocked per that file, executor seam mocked at
 * its module, apiClient mocked so the compile/accept/push accounting is real).
 * ChainProposalCard is NOT mocked — the real presentational component renders
 * the server-built card document.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { WorkspaceProvider } from '../../workspace/WorkspaceContext'
import { defaultWorkspaceState } from '../../workspace/types'
import { OpenTabsProvider, useOpenTabs, type OpenTabsState } from '../../../shared/shell/OpenTabsContext'
import { useSessionSync } from '../../../shared/session/useSessionSync'
import type { SurfaceSpec } from '../../../shared/surfaces'
import type { ChainCardView } from './ChainProposalCard'

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
    onWorkstateProposal?: (intent: Record<string, unknown>) => void
    onChainProposal?: (intent: Record<string, unknown>) => void
    onDraftResult?: (result: unknown, prompt: string) => void
  },
  chatState: {
    messages: [] as unknown[],
    pending: null as unknown,
    status: null as unknown,
    error: null as unknown,
    trace: [] as unknown[],
  },
  send: vi.fn(async () => undefined),
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
// registry is data; nothing here hardcodes a surface name).
const REGISTRY = [
  { id: 'surface-run', label: 'Renamed run surface', path: '/runs/:runId', params: { runId: 'run' }, objectTypes: ['run'], selectableKinds: [] },
] as unknown as SurfaceSpec[]

vi.mock('./useChatThread', () => ({
  useChatThread: (options: {
    onWorkstateProposal?: (intent: Record<string, unknown>) => void
    onChainProposal?: (intent: Record<string, unknown>) => void
    onDraftResult?: (result: unknown, prompt: string) => void
  }) => {
    mocks.chatOptions = options
    return {
      state: mocks.chatState,
      isStreaming: false,
      send: mocks.send,
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

// The elicited execute-chain INTENT (compose_execute_chain's thin attestation
// envelope — the frame the server emits as {type:'chain_proposal', chain}).
const CHAIN_INTENT = {
  operation: 'compose_execute_chain',
  artifactKind: 'attestation-chain',
  prepared: { material: 'fenofibrate stock', amount: { value: 10, unit: 'mL' } },
  aliquots: [{ id: 'ALI-CHAIN-1', volume: { value: 1, unit: 'mL' } }],
  claims: [
    { verb: 'prepared', about: { id: 'MATI-CHAIN-abc', type: 'material-instance' }, claimStatus: 'completed' },
    { verb: 'aliquoted', about: { id: 'ALI-CHAIN-1', type: 'aliquot' }, claimStatus: 'completed' },
  ],
}

// The SERVER-BUILT card document (chain/ExecuteChainDraft.ts §9b shape — the
// ChainProposalCard.test.tsx fixture vocabulary: labels VERBATIM, reconciliation
// numbers from the DATA scale table, the ceiling note from the policy file).
const CHAIN_CARD: ChainCardView = {
  artifactKind: 'attestation-chain',
  claims: [
    {
      label: 'completed',
      verb: 'prepared',
      aboutId: 'MATI-CHAIN-abc',
      aboutType: 'material-instance',
      occurredAtStatus: 'known',
      occurredAt: '2026-10-21T09:30:00-04:00',
      identity: { performer: 'unknown', accountSupplier: 'unknown', attestor: 'Brad' },
    },
    {
      label: 'reported-by-other',
      verb: 'aliquoted',
      aboutId: 'ALI-CHAIN-1',
      aboutType: 'aliquot',
      occurredAtStatus: 'unknown',
      identity: { performer: 'Ana', accountSupplier: 'Ana', attestor: 'Brad' },
    },
  ],
  reconciliation: {
    title: 'Arithmetic reconciliation',
    sumScaled: 1000,
    preparedScaled: 1000,
    counts: [
      { label: 'stored', count: 9 },
      { label: 'used', count: 1 },
    ],
  },
  ceilingNote:
    'Arithmetic reconciles this draft with itself: it is no evidence the wet work happened. What the acceptance attests is each claim\u2019s label — completed, unknown, or reported-by-other — recorded against the scientist who declared it. A completed label is a person\u2019s attestation, not a measurement.',
}

const CHAIN_COMPILED_OK = {
  draftId: 'DRAFT-CHAIN-1',
  revision: 1,
  reviewHash: 'd'.repeat(64),
  canAccept: true,
  diagnostics: [],
  result: {
    sessionDocument: {
      version: 1,
      tabs: [{ kind: 'attestation-chain', recordId: 'ATC-CHAIN-1', title: 'Execute chain' }],
      activeTabId: 'attestation-chain:ATC-CHAIN-1',
    },
    summary: 'Attest the fenofibrate stock chain',
    card: CHAIN_CARD,
  },
}

// The drafts accept-body contract (flat body: the STORED compiled result).
const CHAIN_ACCEPT_BODY = {
  sessionDocument: CHAIN_COMPILED_OK.result.sessionDocument,
  summary: CHAIN_COMPILED_OK.result.summary,
}

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
  mocks.chatOptions = null
  mocks.send.mockReset()
  mocks.send.mockResolvedValue(undefined)
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

describe('AiTabPanel (routed run surface) — D2 relay: chain_proposal reaches the compile seam', () => {
  it('the routed panel passes onChainProposal into its chat hook — the frame is relayed, never swallowed', async () => {
    await mount()
    // D2 at base: the key is ABSENT (the only mount that passed it lived on a
    // page no route serves), so useChatThread's chain_proposal case fires
    // nothing and no compile request is ever issued.
    expect('onChainProposal' in (mocks.chatOptions ?? {})).toBe(true)
    expect(typeof mocks.chatOptions?.onChainProposal).toBe('function')
  })

  it('a chain_proposal relay issues EXACTLY ONE compile request with adapter chain and the intent verbatim, and renders the compiling slot with NO accept control', async () => {
    await mount()
    let resolveCompile: (v: unknown) => void = () => undefined
    mocks.compileWorkstateDraft.mockImplementationOnce(
      () => new Promise((resolve) => { resolveCompile = resolve }),
    )

    await act(async () => {
      mocks.chatOptions?.onChainProposal?.(CHAIN_INTENT)
    })

    expect(mocks.compileWorkstateDraft).toHaveBeenCalledTimes(1)
    expect(mocks.compileWorkstateDraft).toHaveBeenCalledWith({ adapter: 'chain', intent: CHAIN_INTENT })
    expect(screen.getByTestId('chain-card-compiling')).toBeTruthy()
    expect(screen.queryByTestId('chain-card-accept')).toBeNull()

    await act(async () => {
      resolveCompile(CHAIN_COMPILED_OK)
      await Promise.resolve()
    })
    expect(screen.getByTestId('chain-card-accept')).toBeTruthy()
  })

  it('a canAccept:true chain compile mounts ChainProposalCard with the SERVER-BUILT card verbatim (artifactKind header, verbatim labels, reconciliation, ceiling)', async () => {
    await mount()
    mocks.compileWorkstateDraft.mockResolvedValue(CHAIN_COMPILED_OK)

    await act(async () => {
      mocks.chatOptions?.onChainProposal?.(CHAIN_INTENT)
      await Promise.resolve()
    })

    const card = screen.getByTestId('chain-card')
    // C3: artifactKind rides the header (a visible default, never invisible).
    expect(screen.getByTestId('chain-card-artifact-kind').textContent).toBe('attestation-chain')
    // C2: every claim label renders VERBATIM as stored (bait 9).
    const rows = screen.getAllByTestId('chain-card-claim')
    expect(rows.length).toBe(2)
    expect(card.textContent).toContain('completed')
    expect(card.textContent).toContain('reported-by-other')
    // C4: the arithmetic reconciliation readout (server-built numbers).
    expect(screen.getByTestId('chain-card-reconciliation').textContent).toContain('aliquots 1000 / prepared 1000')
    expect(screen.getByTestId('chain-card-reconciliation').textContent).toContain('stored: 9')
    expect(screen.getByTestId('chain-card-reconciliation').textContent).toContain('used: 1')
    // C5: the §7.4 honesty-ceiling note is REQUIRED card text (bait 10).
    expect(screen.getByTestId('chain-card-ceiling').textContent).toContain('no evidence the wet work happened')
    // The draft identity rides the header (the same envelope the accept posts).
    expect(card.textContent).toContain('DRAFT-CHAIN-1')
    expect(card.textContent).toContain('revision 1')
  })

  it('a canAccept:false chain compile renders the named diagnostics with NO accept control (blocked wall)', async () => {
    await mount()
    mocks.compileWorkstateDraft.mockResolvedValue({
      draftId: 'DRAFT-CHAIN-2',
      revision: 1,
      reviewHash: 'e'.repeat(64),
      canAccept: false,
      diagnostics: [
        { code: 'CHAIN_ARITHMETIC_SUM_EXCEEDS_PREPARED', severity: 'error', message: 'aliquot volumes sum past the prepared amount — rule execute-chain.sum-lte-prepared' },
      ],
      result: { summary: 'Attest the fenofibrate stock chain', card: CHAIN_CARD },
    })

    await act(async () => {
      mocks.chatOptions?.onChainProposal?.(CHAIN_INTENT)
      await Promise.resolve()
    })

    const card = screen.getByTestId('chain-card')
    expect(screen.queryByTestId('chain-card-accept')).toBeNull()
    expect(card.textContent).toContain('execute-chain.sum-lte-prepared')
    // Reject is real even on a blocked wall.
    expect(screen.getByTestId('chain-card-reject')).toBeTruthy()
  })

  it('Accept posts exactly {draftId,revision,reviewHash}; the FLAT body goes to applyAcceptedWorkstate with {accepted:true} + identity; ZERO /ai/assist/stream fetch during accept; the spent card loses its controls', async () => {
    await mount()
    mocks.compileWorkstateDraft.mockResolvedValue(CHAIN_COMPILED_OK)
    mocks.acceptWorkstateDraft.mockResolvedValue(CHAIN_ACCEPT_BODY)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await act(async () => {
      mocks.chatOptions?.onChainProposal?.(CHAIN_INTENT)
      await Promise.resolve()
    })
    fireEvent.click(screen.getByTestId('chain-card-accept'))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.acceptWorkstateDraft).toHaveBeenCalledTimes(1)
    expect(mocks.acceptWorkstateDraft).toHaveBeenCalledWith({
      draftId: 'DRAFT-CHAIN-1',
      revision: 1,
      reviewHash: 'd'.repeat(64),
    })
    expect(mocks.applyAcceptedWorkstate).toHaveBeenCalledTimes(1)
    expect(mocks.applyAcceptedWorkstate).toHaveBeenCalledWith(
      CHAIN_ACCEPT_BODY,
      { accepted: true },
      { draftId: 'DRAFT-CHAIN-1', revision: 1, reviewHash: 'd'.repeat(64) },
    )
    // No second AI call at accept time — ever.
    for (const call of fetchSpy.mock.calls) {
      expect(String(call[0])).not.toContain('assist/stream')
    }
    // Spent card: controls disappear (no dead buttons).
    expect(screen.queryByTestId('chain-card-accept')).toBeNull()
    expect(screen.getByTestId('chain-card-applied')).toBeTruthy()
  })

  it('Reject drops the chain card, clears the pending identity, zero further apiClient calls, zero store dispatches', async () => {
    await mount()
    mocks.compileWorkstateDraft.mockResolvedValue(CHAIN_COMPILED_OK)

    await act(async () => {
      mocks.chatOptions?.onChainProposal?.(CHAIN_INTENT)
      await Promise.resolve()
    })
    const storeBefore = mocks.openTabsState.current
    const compileCallsBefore = mocks.compileWorkstateDraft.mock.calls.length

    fireEvent.click(screen.getByTestId('chain-card-reject'))
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.queryByTestId('chain-card')).toBeNull()
    expect(mocks.compileWorkstateDraft.mock.calls.length).toBe(compileCallsBefore)
    expect(mocks.acceptWorkstateDraft).not.toHaveBeenCalled()
    expect(mocks.openTabsState.current).toBe(storeBefore)
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(mocks.putSession).not.toHaveBeenCalled()
  })

  it('with a pending chain card, advancing 600 ms fires ZERO putSession and the tab store reference-identity is unchanged (AR-2: no push before accept)', async () => {
    await mount()
    mocks.compileWorkstateDraft.mockResolvedValue(CHAIN_COMPILED_OK)

    await act(async () => {
      mocks.chatOptions?.onChainProposal?.(CHAIN_INTENT)
      await Promise.resolve()
    })
    const storeBefore = mocks.openTabsState.current
    expect(screen.getByTestId('chain-card-accept')).toBeTruthy()

    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(mocks.putSession).not.toHaveBeenCalled()
    expect(mocks.openTabsState.current).toBe(storeBefore)
    // The proposed landing never entered the tab store.
    expect(storeBefore?.tabs.some((t) => t.tab.id === 'attestation-chain:ATC-CHAIN-1')).toBe(false)
  })
})

describe('AiTabPanel — turn honesty: a chain turn keeps the card as its ONLY review surface', () => {
  // PB-CH-4 D1 / PB-CH-8 fix1 discipline extended to chain turns: the
  // compose_execute_chain turn ALSO fires the event-graph onDraftResult path
  // with a notes-only result, which would otherwise dispatch draft-ready with
  // an EMPTY changes list — sidebar 'reviewing', auto subtab 'changes', the
  // chat section (where the chain card renders) UNMOUNTED, and an actionable
  // 'Apply to run' over nothing.
  it('a notes-only done result on a chain turn keeps the chain card mounted — no reviewing mode, no Apply to run', async () => {
    await mount()
    mocks.compileWorkstateDraft.mockResolvedValue(CHAIN_COMPILED_OK)

    // Same-turn stream, verified order: chain_proposal, then done.
    await act(async () => {
      mocks.chatOptions?.onChainProposal?.(CHAIN_INTENT)
      await Promise.resolve()
    })
    expect(screen.getByTestId('chain-card-accept')).toBeTruthy()

    await act(async () => {
      mocks.chatOptions?.onDraftResult?.(
        { success: true, notes: ['Proposed an execute-chain attestation — review the card; nothing was written.'] },
        'I prepared 10 mL of fenofibrate stock and aliquoted 1 mL',
      )
      await Promise.resolve()
    })

    // (a) the card is STILL rendered — the chat section did not unmount.
    expect(screen.getByTestId('chain-card')).toBeTruthy()
    expect(screen.getByTestId('chain-card-accept')).toBeTruthy()
    // (b) the pane is NOT in 'reviewing'/changes mode.
    expect(screen.queryByTestId('ai-subtab-changes')).toBeNull()
    expect(screen.getByTestId('ai-tab-system-prompt').textContent).not.toContain('Review changes')
    // (c) NO 'Apply to run' affordance anywhere.
    expect(screen.queryByTestId('changes-apply')).toBeNull()
    expect(screen.queryByText('Apply to run')).toBeNull()
    // Invariants untouched: no accept fired, zero session push while pending.
    expect(mocks.acceptWorkstateDraft).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(mocks.putSession).not.toHaveBeenCalled()
  })

  it('the guard is per-turn: once the chain card is rejected, a later plain draft result still opens the changes review', async () => {
    await mount()
    mocks.compileWorkstateDraft.mockResolvedValue(CHAIN_COMPILED_OK)

    await act(async () => {
      mocks.chatOptions?.onChainProposal?.(CHAIN_INTENT)
      await Promise.resolve()
    })
    await act(async () => {
      mocks.chatOptions?.onDraftResult?.({ success: true, notes: ['Proposed an execute-chain attestation.'] }, 'attest the chain')
      await Promise.resolve()
    })
    expect(screen.queryByTestId('ai-subtab-changes')).toBeNull()

    // Reject resolves the card; the guard flag was already consumed by the
    // turn's done — a subsequent event-graph draft must review normally.
    fireEvent.click(screen.getByTestId('chain-card-reject'))
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
