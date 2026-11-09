/**
 * L2-PROMPT2-REGATE-DRIVERS-REBASELINE-1 u4card — RED-first pin of the leg3 done frame.
 *
 * u3diag verdict (C): the server returns 3 clarificationRequests (options: [], menuProvider: "/m")
 * in a done frame in 16.27s, but the client never paints [data-testid="chat-clarification-card"].
 *
 * This test replays the verbatim leg3 wire bytes through the client render path (not the network).
 *
 * Suspects diagnosed in order (cheapest first):
 *   S1 ChatLog.tsx:117 isClarificationAnswered — `slice(index+1).some(user)` is too broad.
 *       When the thread already holds a later user turn (thread-hydrated or a follow-up),
 *       answered=true replaces BOTH bulky arms with the compact row. The fix: the answer
 *       must be the IMMEDIATELY following user turn (messages[index+1].role === 'user').
 *   S2 useAiChat.ts:1768 conditional spread — exonerated (the spread is correct).
 *   S3 ChatLog.tsx:522-523 guard pair — exonerated by HarnessChatPane.tsx:402.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiClarificationRequest } from '../types/ai'
import { ChatLog } from './ChatLog'

// Mock the picker to a deterministic stub (one pick button per request).
vi.mock('../event-editor/right-pane/ai/ClarificationPicker', () => ({
  ClarificationPicker: ({ request: r, onPick }: { request: AiClarificationRequest; onPick: (a: unknown) => void }) => (
    <div data-testid={`fake-picker-${r.id}`}>
      <button type="button" data-testid={`fake-pick-${r.id}`} onClick={() => onPick({ requestId: r.id, label: r.query })}>pick</button>
    </div>
  ),
  requestHasPicker: (req: AiClarificationRequest) => ['/m', '/l', '/e'].includes(req.menuProvider),
}))

afterEach(cleanup)

// --- Verbatim fixture from curl-sse.log (u3diag receipts) ---
// 3 clarificationRequests, options: [], menuProvider: "/m" (menu-backed, picker-driven).
// message.content = result.clarification.prompt (first request's prompt).
const SHORTHAND = 'intentId: add-clofibrate-to-e2-h5\nactions:\n  - action: add_material\n    material: "1 mM clofibrate in DMSO"\n    volumeUl: 1\n    targetWells: [E2:H5]\n    composition:\n      - material: "clofibrate"\n        role: solute\n      - material: "DMSO"\n        role: solvent\n'

const LEG3_REQUESTS: AiClarificationRequest[] = [
  { id: 'unresolved-c-de6a0cf836', kind: 'material', prompt: 'The draft names "1 mm clofibrate in dmso" and the lab spine could not bind it (ambiguous-noun). Choose what it is, or create a local term.', entityType: 'material', menuProvider: '/m', query: '1 mm clofibrate in dmso', options: [], allowCreateLocal: true },
  { id: 'unresolved-c-7b715dbc5f', kind: 'material', prompt: 'The draft names "clofibrate" and the lab spine could not bind it (ambiguous-noun). Choose what it is, or create a local term.', entityType: 'material', menuProvider: '/m', query: 'clofibrate', options: [], allowCreateLocal: true },
  { id: 'unresolved-c-14f8b8158a', kind: 'material', prompt: 'The draft names "dmso" and the lab spine could not bind it (ambiguous-noun). Choose what it is, or create a local term.', entityType: 'material', menuProvider: '/m', query: 'dmso', options: [], allowCreateLocal: true },
]

const LEG3_PROMPT = LEG3_REQUESTS[0].prompt // same as result.clarification.prompt

const baseProps = {
  isStreaming: false, prompt: '', onPromptChange: vi.fn(), onSend: vi.fn(),
  onCancel: vi.fn(), onReview: vi.fn(), onClarificationPick: vi.fn(), onClarificationSubmit: vi.fn(),
}

describe('L2-PROMPT2-REGATE-DRIVERS-REBASELINE-1 u4card: leg3 done-frame pin', () => {
  it('leg3 done frame — 3 requests (options:[], menuProvider:/m) — card renders, NOT answered', () => {
    const messages = [
      { id: 'user-1', role: 'user' as const, content: 'Add 1 mM clofibrate in DMSO to E2:H5', timestamp: 0 },
      { id: 'assistant-1', role: 'assistant' as const, content: LEG3_PROMPT, shorthand: SHORTHAND,
        clarificationRequests: LEG3_REQUESTS, timestamp: 1 },
    ]
    render(<ChatLog {...baseProps} messages={messages} />)

    // (a) The assistant message carries 3 clarificationRequests
    const card = screen.getByTestId('chat-clarification-card')
    expect(card).toBeTruthy()
    // (b) NOT answered — no compact row
    expect(screen.queryByTestId('chat-log-clarification-answered')).toBeNull()
    // (c) DOM contains the grouped card with 3 slots
    expect(screen.getAllByTestId('chat-clarification-slot')).toHaveLength(3)
    expect(screen.getByTestId('chat-clarification-submit')).toBeTruthy()
  })

  it('S1 fix: user turn separated by non-user message must NOT suppress the card', () => {
    // Thread: assistant clarification → system/assistant message → user turn.
    // BUG (S1): old code `slice(index+1).some(user)` finds ANY user after the
    // clarification, even when it is NOT the immediate answer. This replaces
    // the card with the compact "Answered:" row.
    // FIX: only the immediately following message counts as the answer.
    const messages = [
      { id: 'assistant-1', role: 'assistant' as const, content: LEG3_PROMPT,
        clarificationRequests: LEG3_REQUESTS, timestamp: 0 },
      { id: 'system-status', role: 'system' as const, content: 'Draft preparation in progress.', timestamp: 0.5 },
      { id: 'user-later', role: 'user' as const, content: 'Something else entirely', timestamp: 1 },
    ]
    render(<ChatLog {...baseProps} messages={messages} />)

    // Card must render — the user message at index 2 is NOT the answer to the
    // clarification at index 0 (the immediate next message is a system turn).
    expect(screen.getByTestId('chat-clarification-card')).toBeTruthy()
    expect(screen.queryByTestId('chat-log-clarification-answered')).toBeNull()
  })
})
