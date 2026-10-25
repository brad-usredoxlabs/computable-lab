/**
 * MATRES-CHAIN (OQ-3(a) ratified) — RED-first: the generic stack (useAiChat +
 * types/ai.ts) must understand the `chain_proposal` frame instead of silently
 * dropping it (the PB-CH-6 defect class, mirrored from
 * useAiChat.recordDraftProposal.test.tsx exactly).
 *
 * Pinned:
 *  - a chain_proposal frame fires onChainProposal with the VERBATIM payload
 *    (no reshaping, no validation — the trust boundary is
 *    POST /api/drafts/compile, Ajv + lint + arithmetic + canAccept);
 *  - NO callback registered ⇒ the frame surfaces as a NAMED system bubble —
 *    never swallowed;
 *  - a throwing callback ⇒ system line, turn continues (never-break-the-turn).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAiChat } from './useAiChat'
import { streamAssist } from '../api/aiClient'
import type { AiContext } from '../../types/aiContext'

vi.mock('../api/aiClient', () => ({
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))

vi.mock('../api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }),
  },
}))

const aiContext: AiContext = {
  surface: 'analysis',
  summary: 'test surface',
  surfaceContext: {},
}

function frames(...events: Array<Record<string, unknown>>) {
  vi.mocked(streamAssist).mockImplementation(async function* () {
    for (const e of events) yield e as never
  })
}

// The VERBATIM server frame (AgentOrchestrator emits {type:'chain_proposal',
// chain} — the thin envelope: the elicited execute-chain intent, nothing else).
const CHAIN_FRAME = {
  type: 'chain_proposal',
  chain: {
    operation: 'compose-execute-chain',
    artifactKind: 'attestation-chain',
    prepared: { name: 'Fenofibrate stock 1 mL', volume: { value: 1, unit: 'mL' } },
    aliquots: { count: 10, volume: { value: 100, unit: 'uL' } },
    claims: [{ label: 'completed', verb: 'produced' }],
  },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useAiChat — chain_proposal envelope (MATRES-CHAIN)', () => {
  it('chain_proposal frame fires onChainProposal with the verbatim payload', async () => {
    frames(
      { type: 'status', message: 'working' },
      CHAIN_FRAME,
      { type: 'done', result: { success: true, notes: ['Proposed an execute chain — review the card; nothing was written.'] } },
    )
    const onChainProposal = vi.fn()
    const { result } = renderHook(() => useAiChat({ aiContext, onChainProposal }))

    act(() => {
      result.current.sendPrompt('I made 1 mL of fenofibrate stock and split it into 10 100 uL aliquots, one used today, nine at -20')
    })

    await waitFor(() => expect(result.current.isStreaming).toBe(false))
    expect(onChainProposal).toHaveBeenCalledTimes(1)
    expect(onChainProposal).toHaveBeenCalledWith(CHAIN_FRAME.chain)
  })

  it('chain_proposal with NO callback registered surfaces a NAMED system bubble — the frame is never swallowed', async () => {
    frames(
      CHAIN_FRAME,
      { type: 'done', result: { success: true, notes: [] } },
    )
    const { result } = renderHook(() => useAiChat({ aiContext }))

    act(() => {
      result.current.sendPrompt('make 1 mL, 10x100uL aliquots, 1 today, 9 at -20')
    })

    await waitFor(() => expect(result.current.isStreaming).toBe(false))
    const systemLines = result.current.messages.filter(
      (m) => m.role === 'system' && /execute chain/i.test(String(m.content)),
    )
    expect(systemLines.length).toBeGreaterThanOrEqual(1)
  })

  it('a throwing onChainProposal ⇒ system line, turn continues (never-break-the-turn)', async () => {
    frames(
      CHAIN_FRAME,
      { type: 'done', result: { success: true, notes: ['done'] } },
    )
    const onChainProposal = vi.fn(() => {
      throw new Error('mount blew up')
    })
    const { result } = renderHook(() => useAiChat({ aiContext, onChainProposal }))

    act(() => {
      result.current.sendPrompt('make 1 mL, 10x100uL aliquots')
    })

    await waitFor(() => expect(result.current.isStreaming).toBe(false))
    expect(onChainProposal).toHaveBeenCalledTimes(1)
    const systemBubble = result.current.messages.find(
      (m) => m.role === 'system' && m.content.includes('mount blew up'),
    )
    expect(systemBubble).toBeDefined()
    expect(systemBubble!.content).toContain('Nothing was written')
  })
})
