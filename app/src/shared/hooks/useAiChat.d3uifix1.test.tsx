/**
 * L2-SUITE-A-uifix1 [D3] RED — the gate-1 browser defect: material-add turns
 * that ended "success-with-nothing".
 *
 * Evidence shape (the real server leg, not a guess):
 *  - gate backend.log (traces tjor7p/4xj7xf/08zy46, historyLen=20):
 *      `done event_shorthand success=true events=0 clarifications=1|2|1`
 *  - headless drive receipts prompt-4/5/6: cards=1/2/1, same counts.
 *  - shorthandChat.ts:1342+ needs-clarification arm returns
 *      { success: true, events: [], clarificationRequests: [...],
 *        clarification: legacy, loopAskCounts, shorthand }
 *    — EXACTLY the done payload the browser's inherited-history drive
 *    consumed. The client must therefore surface the cards.
 *
 * What this lock pins (the D3 claim through the universal done arm):
 *  1. the assistant message carries `clarificationRequests` VERBATIM (the
 *     ChatLog typed-clarification arm's input — ChatLog.tsx:197 renders
 *     buttons only from this field);
 *  2. the assistant message carries the LEGACY `clarification` (ChatLog's
 *     clarification block, ChatLog.tsx:196 — the second render arm);
 *  3. the wall is null (a question WAS asked — askedQuestion gate);
 *  4. the false "AI completed the task but did not propose any changes."
 *     system bubble is ABSENT — it claims nothing was proposed while the
 *     turn proposed cards (the gate's visible symptom).
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

beforeEach(() => {
  vi.clearAllMocks()
})

// The gate's P4 done shape: events=0, clarifications=1 (a readings-bearing
// material fact — options + menuProvider 'choice', the receipts' card arm).
const P4_CLARIFICATION_REQUEST = {
  id: 'unresolved-c-68d65279c6',
  kind: 'material',
  prompt:
    'The declared composition fractions sum to 110 percent, not the declared 100 percent',
  origin: 'harness',
  entityType: 'material',
  menuProvider: 'choice',
  query: 'Trypsin-EDTA, DMEM, FBS',
  options: [
    {
      id: 'whole-mixture-supplement',
      label: 'whole-mixture supplement (the supplement is a share of the final volume; the base is a share of the remaining)',
      snippet: 'Trypsin-EDTA 45%, DMEM 45%, FBS 10%',
    },
  ],
}

describe('useAiChat — L2-SUITE-A-uifix1 D3: an events=0 + clarificationRequests done is NOT success-with-nothing', () => {
  it('rides the typed clarification requests onto the assistant message (ChatLog card arm) and suppresses the false empty-success bubble', async () => {
    frames({
      type: 'done',
      result: {
        success: true,
        events: [],
        notes: [],
        loopAskCounts: { 'unresolved-c-68d65279c6': 1 },
        clarificationRequests: [P4_CLARIFICATION_REQUEST],
      },
    })
    const { result } = renderHook(() => useAiChat({ aiContext }))
    await act(async () => {
      result.current.sendPrompt('Add 100uL of 50/50 Trypsin-EDTA/DMEM with 10% FBS to wells A2:H6')
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 4000 })
    const assistant = result.current.messages.find((m) => m.role === 'assistant')!
    // (1) the typed requests ride VERBATIM — ChatLog's button arm (197)
    // renders from exactly this field.
    expect(assistant.clarificationRequests).toHaveLength(1)
    expect(assistant.clarificationRequests?.[0]?.id).toBe('unresolved-c-68d65279c6')
    // (2) the legacy clarification rides too (ChatLog's block arm, 196).
    expect(assistant.clarification?.prompt).toBe(P4_CLARIFICATION_REQUEST.prompt)
    expect(assistant.clarification?.options).toHaveLength(1)
    // (3) a question WAS asked — the honest wall must not fire beside it.
    expect(result.current.honestWall).toBeNull()
    // (4) the false "nothing was proposed" bubble is absent.
    const falseBubble = result.current.messages.find(
      (m) => m.role === 'system' && m.content === 'AI completed the task but did not propose any changes.',
    )
    expect(falseBubble).toBeUndefined()
  })

  it('a menu-backed (no options) clarification request still counts as asked and suppresses the bubble', async () => {
    // The P5/P6 shape: a /m-menu-backed material noun (options: [],
    // menuProvider '/m', allowCreateLocal) — the ChatLog picker arm.
    frames({
      type: 'done',
      result: {
        success: true,
        events: [],
        notes: [],
        clarificationRequests: [
          {
            id: 'unresolved-c-clo-fibrate',
            kind: 'material',
            prompt: 'The draft names "clofibrate" and the lab spine could not bind it (unresolved). Choose what it is, or create a local term.',
            origin: 'harness',
            entityType: 'material',
            menuProvider: '/m',
            query: 'clofibrate',
            options: [],
            allowCreateLocal: true,
          },
        ],
      },
    })
    const { result } = renderHook(() => useAiChat({ aiContext }))
    await act(async () => {
      result.current.sendPrompt('Add 1uL 1mM clofibrate in DMSO to wells A2:H2 with an 8-channel pipette')
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 4000 })
    const assistant = result.current.messages.find((m) => m.role === 'assistant')!
    expect(assistant.clarificationRequests).toHaveLength(1)
    expect(result.current.honestWall).toBeNull()
    expect(
      result.current.messages.some(
        (m) => m.content === 'AI completed the task but did not propose any changes.',
      ),
    ).toBe(false)
  })

  it('control: a genuinely empty success (no events, no questions, no deliverables) STILL lands the empty-success bubble', async () => {
    frames({
      type: 'done',
      result: { success: true, events: [], notes: [] },
    })
    const { result } = renderHook(() => useAiChat({ aiContext }))
    await act(async () => {
      result.current.sendPrompt('do nothing observable')
    })
    await waitFor(
      () =>
        expect(
          result.current.messages.some(
            (m) => m.content === 'AI completed the task but did not propose any changes.',
          ),
        ).toBe(true),
      { timeout: 4000 },
    )
  })
})
