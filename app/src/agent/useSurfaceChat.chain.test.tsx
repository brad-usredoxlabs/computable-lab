/**
 * L2-CHAT-UI-1 LEG D0 — the execute-chain frame lands on the UNIVERSAL path.
 *
 * AiTabPanel carries its own private flowCardAdapterRef for the chain render
 * branch; the universal seam (useSurfaceChat → AiPanelContext →
 * HarnessChatPane) must carry the same behavior WITHOUT that private ref:
 *
 *  - useSurfaceChat wires onChainProposal to flow.proposeWorkstate('chain',
 *    intent) — the 'chain' adapter is declared data at
 *    config/drafting/adapters.yaml (one constant on the existing adapter
 *    union, the record-drafting line shape copied — no fork, no second flow);
 *  - a 'chain' proposal on the universal flow renders ChainProposalCard
 *    inside HarnessChatPane (the pane branches on the card's ADAPTER — the
 *    card state carries it; the pane and the flow stay surface-agnostic,
 *    no surface-name literals);
 *  - the card's strings are the SERVER-BUILT card document verbatim (the
 *    flow rides result.card into card state — the client builds no copy,
 *    maps nothing, reformats nothing);
 *  - accept/reject on the chain wall drive flow.acceptWorkstate /
 *    flow.rejectWorkstate (the SAME single compile→card→accept/reject
 *    machinery — no new reducer/chat machinery);
 *  - a non-chain card renders WorkstateProposalCard UNCHANGED (the existing
 *    render is the else arm — the branch switches on the adapter constant
 *    only).
 *
 * useAiChat is stubbed at its module seam (the hook's stream machinery is
 * not the subject of this leg — the seam's callbacks are), mirroring the
 * proven mock shapes in the flow's own tests (shared/ai).
 */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { AiPanelProvider } from '../shared/context/AiPanelContext'
import { useSurfaceChat } from './useSurfaceChat'
import { HarnessChatPane } from './HarnessChatPane'
import { useAiChat, type UseAiChatReturn } from '../shared/hooks/useAiChat'
import type { WorkstateExecutor } from '../shared/session/useWorkstateExecutor'
import type { AiContext } from '../types/aiContext'
import type { ChainCardView } from '../event-editor/right-pane/ai/ChainProposalCard'

vi.mock('../shared/hooks/useAiChat', () => ({ useAiChat: vi.fn() }))
const useAiChatMock = vi.mocked(useAiChat)

// ChatLog reuses the exported clarificationAnswerPrompt from AiTabPanel, whose
// import graph reaches pdfjs-dist; mock it so jsdom doesn't crash on DOMMatrix
// (the proven pattern from HarnessChatPane.test.tsx).
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: 0, fingerprints: [''], getPage: () => Promise.resolve(null), destroy: () => undefined }), destroy: () => undefined })),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class { render() { return Promise.resolve() } },
}))

const executorMock = vi.hoisted(() => ({
  executeTier1: vi.fn(),
  applyAcceptedWorkstate: vi.fn(),
}))

vi.mock('../shared/session/useWorkstateExecutor', () => ({
  useWorkstateExecutor: () => executorMock as unknown as WorkstateExecutor,
}))

const compileMock = vi.hoisted(() => vi.fn())
const acceptMock = vi.hoisted(() => vi.fn())
vi.mock('../shared/api/client', () => ({
  apiClient: {
    compileWorkstateDraft: compileMock,
    acceptWorkstateDraft: acceptMock,
    getSurfaces: vi.fn().mockResolvedValue({ surfaces: [] }),
  },
}))

// The SERVER-BUILT chain card document (server/src/chain/ExecuteChainDraft.ts
// §9b shape — claims verbatim, reconciliation numbers, honesty-ceiling copy
// from config/drafting/execute-chain-arithmetic.yaml data). The test asserts
// PASS-THROUGH of exactly this object — no reformatting by the client.
const CHAIN_CARD: ChainCardView = {
  artifactKind: 'attestation-chain',
  claims: [
    {
      label: 'completed — the stock was prepared and split',
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
}

const WORKSTATE_SUMMARY = 'Add 1 mM clofibrate to A1:C3'

// A stub of the chat: only the fields the pane and the registration seam
// actually consume (the proven stubChat shape from HarnessChatPane.test.tsx).
function stubChat(): UseAiChatReturn {
  return {
    messages: [],
    isStreaming: false,
    isAccepting: false,
    previewEvents: [],
    previewLabwareAdditions: [],
    previewEventStates: new Map(),
    executingApplianceJobIds: new Set<string>(),
    previewStagedLabwareCount: 0,
    hasPreview: false,
    unresolvedRefs: [],
    honestWall: null,
    adoptionError: null,
    inputText: '',
    sendPrompt: vi.fn(),
    cancelStream: vi.fn(),
    aiAvailable: true,
  } as unknown as UseAiChatReturn
}

const AI_CONTEXT: AiContext = { surface: 'analysis', summary: 'st', surfaceContext: {} }

// The surface side of the seam: useSurfaceChat inside the nearest
// AiPanelProvider (the real registration path — the pane reads what
// useSurfaceChat registered).
function Host() {
  const { chat, flow } = useSurfaceChat({ aiContext: AI_CONTEXT })
  void flow
  return <>{chat && <HarnessChatPane />}</>
}

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  useAiChatMock.mockReturnValue(stubChat())
  executorMock.applyAcceptedWorkstate.mockReturnValue({ ok: true, kind: 'replaced', diagnostics: [] })
})

describe('L2-CHAT-UI-1 LEG D0 — the chain frame on the universal path', () => {
  it('useSurfaceChat wires onChainProposal to the flow with the chain adapter constant', () => {
    renderHook(() => useSurfaceChat({ aiContext: AI_CONTEXT }), { wrapper: AiPanelProvider })
    const calls = useAiChatMock.mock.calls
    const callbacks = calls[calls.length - 1][0] as { onChainProposal: (i: Record<string, unknown>) => void }
    const chainIntent = { operation: 'compose-execute-chain' }
    act(() => {
      callbacks.onChainProposal(chainIntent)
    })
    expect(compileMock).toHaveBeenCalledTimes(1)
    const call = compileMock.mock.calls[0][0]
    expect(call.adapter).toBe('chain')
    expect(call.intent).toEqual(chainIntent)
  })

  it('a chain proposal renders ChainProposalCard in the universal pane with the SERVER-BUILT card verbatim', async () => {
    compileMock.mockResolvedValue({
      draftId: 'DRAFT-CHAIN-1',
      revision: 1,
      reviewHash: 'c'.repeat(64),
      canAccept: true,
      diagnostics: [],
      result: {
        summary: 'Execute chain: 1 mL prepared, 10 aliquots of 100 uL',
        card: CHAIN_CARD,
      },
    })
    render(<AiPanelProvider><Host /></AiPanelProvider>)

    // Drive a chain intent through the SEAM (the same relay useAiChat's
    // chain_proposal frame performs when the callback is registered).
    const options = useAiChatMock.mock.calls[0][0] as { onChainProposal: (i: Record<string, unknown>) => void }
    act(() => {
      options.onChainProposal?.({ operation: 'compose-execute-chain' })
    })
    await waitFor(() => {
      expect(screen.getByTestId('chain-card')).toBeInTheDocument()
    })

    // PASS-THROUGH: the strings are the server-built document, verbatim.
    expect(screen.getByTestId('chain-card-artifact-kind')).toHaveTextContent('attestation-chain')
    expect(screen.getByTestId('chain-card-claims').textContent).toContain('completed — the stock was prepared and split')
    expect(screen.getByTestId('chain-card-reconciliation').textContent).toContain('aliquots 1000 / prepared 1000')
    expect(screen.getByTestId('chain-card-ceiling')).toHaveTextContent(
      'The arithmetic proves this draft is internally consistent. It does not prove the pipetting happened.',
    )
    // The pane rendered the CHAIN wall, not the composition card.
    expect(screen.queryByTestId('workstate-card')).toBeNull()
  })

  it('accept on the universal chain wall drives the flow (one accept fetch + executor apply, card spent)', async () => {
    compileMock.mockResolvedValue({
      draftId: 'DRAFT-CHAIN-1',
      revision: 1,
      reviewHash: 'c'.repeat(64),
      canAccept: true,
      diagnostics: [],
      result: { card: CHAIN_CARD },
    })
    acceptMock.mockResolvedValue({ card: CHAIN_CARD })
    render(<AiPanelProvider><Host /></AiPanelProvider>)

    const options = useAiChatMock.mock.calls[0][0] as { onChainProposal: (i: Record<string, unknown>) => void }
    act(() => {
      options.onChainProposal?.({ operation: 'compose-execute-chain' })
    })
    await waitFor(() => {
      expect(screen.getByTestId('chain-card-accept')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('chain-card-accept'))
    await waitFor(() => {
      expect(screen.getByTestId('chain-card-applied')).toBeInTheDocument()
    })
    expect(acceptMock).toHaveBeenCalledTimes(1)
    expect(acceptMock).toHaveBeenCalledWith({
      draftId: 'DRAFT-CHAIN-1',
      revision: 1,
      reviewHash: 'c'.repeat(64),
    })
    expect(executorMock.applyAcceptedWorkstate).toHaveBeenCalledTimes(1)
  })

  it('reject on the universal chain wall abandons: the card is gone, zero accept fetches', async () => {
    compileMock.mockResolvedValue({
      draftId: 'DRAFT-CHAIN-2',
      revision: 1,
      reviewHash: 'd'.repeat(64),
      canAccept: true,
      diagnostics: [],
      result: { card: CHAIN_CARD },
    })
    render(<AiPanelProvider><Host /></AiPanelProvider>)

    const options = useAiChatMock.mock.calls[0][0] as { onChainProposal: (i: Record<string, unknown>) => void }
    act(() => {
      options.onChainProposal?.({ operation: 'compose-execute-chain' })
    })
    await waitFor(() => {
      expect(screen.getByTestId('chain-card-reject')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('chain-card-reject'))
    await waitFor(() => {
      expect(screen.queryByTestId('chain-card')).toBeNull()
      expect(screen.queryByTestId('harness-chat-proposal')).toBeNull()
    })
    expect(acceptMock).not.toHaveBeenCalled()
  })

  it('a non-chain proposal still renders WorkstateProposalCard unchanged (the else arm is untouched)', async () => {
    compileMock.mockResolvedValue({
      draftId: 'DRAFT-WS-1',
      revision: 2,
      reviewHash: 'w'.repeat(64),
      canAccept: true,
      diagnostics: [],
      result: {
        summary: WORKSTATE_SUMMARY,
        sessionDocument: { tabs: [{ kind: 'record-edit', title: 'Material' }] },
      },
    })
    render(<AiPanelProvider><Host /></AiPanelProvider>)

    const options = useAiChatMock.mock.calls[0][0] as { onWorkstateProposal: (i: Record<string, unknown>) => void }
    act(() => {
      options.onWorkstateProposal?.({ operation: 'open-record' })
    })
    await waitFor(() => {
      expect(screen.getByTestId('workstate-card')).toBeInTheDocument()
    })
    expect(screen.getByTestId('workstate-card')).toHaveTextContent(WORKSTATE_SUMMARY)
    expect(screen.queryByTestId('chain-card')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /accept/i }))
    await waitFor(() => {
      expect(screen.getByTestId('workstate-card-applied')).toBeInTheDocument()
    })
    expect(acceptMock).toHaveBeenCalledTimes(1)
  })
})
