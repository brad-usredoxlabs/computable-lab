/**
 * L2-SUITE-A-uifix2 [E] RED — the O1 pane divergence: a delivered navigation
 * agent_action frame contradicts the empty-success bubble.
 *
 * Evidence (banked wire, receipts/L2-SUITE-B/20261028T011209Z/prompt-9.json):
 *  - sse_frame_types: [status, ..., tool_call, agent_action, tool_result, done]
 *  - agent_action_frames: [{ action: 'open-surface', surface: 'sequences',
 *      target: { kind: 'sequence-tab', tab: 'Analysis' } }]
 *  - done: { notes: ["Action sent — see the workspace."], success: true }
 *  - headless verdict: 'proposal' (the classifier legitimately grades the
 *    turn a proposal via the nav frame).
 *
 * The pane's empty-success bubble (useAiChat.ts:1383) fires on
 * `!askedQuestion && !deckLayoutDelivered`. A nav agent_action delivered
 * through onAgentAction is a DELIVERED change the pane did not count — so the
 * bubble claims "nothing was proposed" beside a turn that navigated the
 * workspace. Same family as D3/F3 (the delivered-change arm on the empty-
 * success gate). This lock pins BOTH arms:
 *  1. a DELIVERED nav (registered handler applies it, no diagnostic) SUPPRESSES
 *     the empty-success bubble (exactly like deckLayoutDelivered);
 *  2. a REFUSED nav (the handler reports a block diagnostic — the action did
 *     not apply) does NOT suppress it — the honest no-anything arm stays
 *     (mirrors the F4 refused-deckLayout mount);
 *  3. the honest no-anything arm (no nav frame, no proposal, no question)
 *     STILL lands the bubble.
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
  surface: 'run-workspace',
  summary: 'Run workspace: RUN-1',
  surfaceContext: { runId: 'RUN-1', eventGraphId: 'EG-1' },
}

function frames(...events: Array<Record<string, unknown>>) {
  vi.mocked(streamAssist).mockImplementation(async function* () {
    for (const e of events) yield e as never
  })
}

const FALSE_BUBBLE = 'AI completed the task but did not propose any changes.'

// The banked wire's nav frame (prompt-9.json agent_action_frames[0]).
const NAV_FRAME = {
  type: 'agent_action',
  action: {
    action: 'open-surface',
    surface: 'sequences',
    target: { kind: 'sequence-tab', tab: 'Analysis' },
  },
}

// The banked wire's done (prompt-9.json done).
const NAV_DONE = {
  type: 'done',
  result: {
    success: true,
    events: [],
    notes: ['Action sent — see the workspace.'],
  },
}

const hasFalseBubble = (messages: Array<{ content: string; role: string }>) =>
  messages.some((m) => m.content === FALSE_BUBBLE)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useAiChat — L2-SUITE-A-uifix2 E: a delivered navigation agent_action suppresses the empty-success bubble', () => {
  it('a DELIVERED nav (handler applies, no diagnostic) suppresses the false empty-success bubble', async () => {
    frames(NAV_FRAME, NAV_DONE)
    // The handler applies the action and returns nothing (a void return /
    // undefined = accepted — the same convention as onDeckLayout's void).
    const onAgentAction = vi.fn(() => undefined)
    const { result } = renderHook(() => useAiChat({ aiContext, onAgentAction }))
    await act(async () => {
      result.current.sendPrompt('Open the Analysis tab in the workspace')
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 4000 })
    // The nav frame was handed to the surface (delivered, not dropped).
    expect(onAgentAction).toHaveBeenCalledTimes(1)
    expect(onAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'open-surface', surface: 'sequences' }),
    )
    // The turn navigated the workspace — it is NOT success-with-nothing, so
    // the false "nothing was proposed" bubble must be absent.
    expect(hasFalseBubble(result.current.messages)).toBe(false)
  })

  it('a REFUSED nav (handler reports a block diagnostic) does NOT suppress the bubble (honest no-anything arm)', async () => {
    frames(NAV_FRAME, NAV_DONE)
    // The handler returns a diagnostic string — the action was BLOCKED (it did
    // not apply). Like the F4 refused deckLayout mount, the bubble stays up:
    // the workspace did not visibly change.
    const onAgentAction = vi.fn(() => 'The workspace could not open that tab. Nothing was changed.')
    const { result } = renderHook(() => useAiChat({ aiContext, onAgentAction }))
    await act(async () => {
      result.current.sendPrompt('Open the Analysis tab in the workspace')
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 4000 })
    expect(onAgentAction).toHaveBeenCalledTimes(1)
    // The block diagnostic is surfaced (the existing agent_action arm), AND the
    // honest empty-success bubble is still there (the nav did not apply).
    expect(hasFalseBubble(result.current.messages)).toBe(true)
  })

  it('the honest no-anything arm is intact: no nav frame, no proposal, no question STILL lands the bubble', async () => {
    frames(NAV_DONE)
    const { result } = renderHook(() => useAiChat({ aiContext }))
    await act(async () => {
      result.current.sendPrompt('do nothing observable')
    })
    await waitFor(
      () => expect(hasFalseBubble(result.current.messages)).toBe(true),
      { timeout: 4000 },
    )
  })
})
