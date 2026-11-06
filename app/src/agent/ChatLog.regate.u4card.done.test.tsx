/**
 * L2-PROMPT2-REGATE-DRIVERS-REBASELINE-1 u5dec — client done-arm replay.
 *
 * The adversarial DEFECT 1/2 pin: the existing tests hand-build the assistant
 * message and only pin ChatLog rendering. Nobody replayed the leg3 done frame
 * THROUGH THE CLIENT DONE ARM (useAiChat), which is where a dropped
 * clarificationRequests would actually hide.
 *
 * This test feeds a done event (verbatim leg3 wire bytes: 3 clarificationRequests,
 * options: [], menuProvider: "/m") through the useAiChat hook's done arm, then
 * asserts:
 *   (a) the resulting assistant message carries clarificationRequests.length === 3
 *   (b) rendering that message list through ChatLog shows
 *       [data-testid="chat-clarification-card"] and NO compact answered row.
 *
 * The adjacency predicate is exercised by building a message array where the
 * leg3 assistant (from the done arm) is followed by a system message, then a
 * user turn. The trunk form slice(index+1).some(user) finds the user and
 * suppresses the card. The fixed form checks only the immediately following
 * message (ChatLog.tsx:117, landed in this item's u4card commit 412f82c9).
 *
 * u5dec decision: PIN-ONLY — the product already uses the adjacency form, and
 * the mutation run proves the broader trunk form turns (b1) RED. Both
 * directions are pinned: (b1) non-adjacent later user -> card stays; (b2)
 * immediately-following user -> compact answered row (so a never-answered
 * predicate also fails here, not just in the sibling ChatLog.test.tsx pins).
 */
import { cleanup, render, screen, renderHook, act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAiChat } from '../shared/hooks/useAiChat'
import { streamAssist } from '../shared/api/aiClient'
import type { AiContext } from '../types/aiContext'
import type { AiClarificationRequest, ChatMessage } from '../types/ai'
import { ChatLog } from './ChatLog'

vi.mock('../shared/api/aiClient', () => ({
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }),
  },
}))

vi.mock('../event-editor/right-pane/ai/ClarificationPicker', () => ({
  ClarificationPicker: ({ request: r, onPick }: { request: AiClarificationRequest; onPick: (a: unknown) => void }) => (
    <div data-testid={`fake-picker-${r.id}`}>
      <button type="button" data-testid={`fake-pick-${r.id}`} onClick={() => onPick({ requestId: r.id, label: r.query })}>pick</button>
    </div>
  ),
  requestHasPicker: (req: AiClarificationRequest) => ['/m', '/l', '/e'].includes(req.menuProvider),
}))

afterEach(cleanup)

// --- Verbatim leg3 wire bytes (from ChatLog.regate.u4card.test.tsx) ---
const LEG3_REQUESTS: AiClarificationRequest[] = [
  { id: 'unresolved-c-de6a0cf836', kind: 'material', prompt: 'The draft names "1 mm clofibrate in dmso" and the lab spine could not bind it (ambiguous-noun). Choose what it is, or create a local term.', entityType: 'material', menuProvider: '/m', query: '1 mm clofibrate in dmso', options: [], allowCreateLocal: true },
  { id: 'unresolved-c-7b715dbc5f', kind: 'material', prompt: 'The draft names "clofibrate" and the lab spine could not bind it (ambiguous-noun). Choose what it is, or create a local term.', entityType: 'material', menuProvider: '/m', query: 'clofibrate', options: [], allowCreateLocal: true },
  { id: 'unresolved-c-14f8b8158a', kind: 'material', prompt: 'The draft names "dmso" and the lab spine could not bind it (ambiguous-noun). Choose what it is, or create a local term.', entityType: 'material', menuProvider: '/m', query: 'dmso', options: [], allowCreateLocal: true },
]

const LEG3_PROMPT = LEG3_REQUESTS[0].prompt

const aiContext: AiContext = {
  surface: 'run-workspace',
  summary: 'Run workspace: RUN-1',
  surfaceContext: { runId: 'RUN-1', eventGraphId: 'EG-1' },
}

function frames(...events: Array<Record<string, unknown>>) {
  return async function* () {
    for (const e of events) yield e as never
  }
}

const baseProps = {
  isStreaming: false, prompt: '', onPromptChange: vi.fn(), onSend: vi.fn(),
  onCancel: vi.fn(), onReview: vi.fn(), onClarificationPick: vi.fn(), onClarificationSubmit: vi.fn(),
}

/** (a) Drive the leg3 done frame through the real useAiChat done arm. */
async function leg3ThroughDoneArm(): Promise<ChatMessage[]> {
  vi.mocked(streamAssist).mockImplementationOnce(frames({
    type: 'done',
    result: {
      success: true,
      events: [],
      notes: [],
      clarificationRequests: LEG3_REQUESTS,
      clarification: { prompt: LEG3_PROMPT, entityType: 'material', options: [], menuProvider: '/m', query: '1 mm clofibrate in dmso' },
    },
  }))

  const { result } = renderHook(() => useAiChat({ aiContext }))
  await act(async () => {
    result.current.sendPrompt('Add 1 mM clofibrate in DMSO to E2:H5')
  })
  await waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 4000 })

  const assistant = result.current.messages.find((m) => m.role === 'assistant' && m.clarificationRequests?.length === 3)!
  expect(assistant.clarificationRequests).toHaveLength(3)
  expect(assistant.clarificationRequests?.[0]?.id).toBe('unresolved-c-de6a0cf836')
  return result.current.messages.slice(0, 2) // user prompt + leg3 assistant
}

describe('L2-PROMPT2-REGATE-DRIVERS-REBASELINE-1 u4cardfix: leg3 done frame through useAiChat client done arm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('(b1) keeps the card when a system buffer separates the clarification from a later user turn', async () => {
    const messages: ChatMessage[] = [
      ...(await leg3ThroughDoneArm()),
      { id: 'system-buffer', role: 'system' as const, content: 'Draft preparation in progress.', timestamp: Date.now() + 1 },
      { id: 'user-followup', role: 'user' as const, content: 'Something else entirely', timestamp: Date.now() + 2 },
    ]
    expect(messages.length).toBe(4)

    render(<ChatLog {...baseProps} messages={messages} />)
    // Card must render — the user at index 3 is NOT the immediate answer to the
    // clarification at index 1 (the immediately following message is system).
    // The trunk form slice(index+1).some(user) suppresses here (mutation RED).
    expect(screen.getByTestId('chat-clarification-card')).toBeTruthy()
    expect(screen.queryByTestId('chat-log-clarification-answered')).toBeNull()
  })

  it('(b2) collapses to the answered row when the user turn immediately follows the clarification', async () => {
    const messages: ChatMessage[] = [
      ...(await leg3ThroughDoneArm()),
      { id: 'user-answer', role: 'user' as const, content: 'Something else entirely', timestamp: Date.now() + 1 },
    ]

    render(<ChatLog {...baseProps} messages={messages} />)
    // Only the user turn's CONTENT is rendered here; the system-buffer case above
    // shows the same content NOT collapsing to this row.
    expect(screen.queryByTestId('chat-clarification-card')).toBeNull()
    expect(screen.getByTestId('chat-log-clarification-answered')).toHaveTextContent('Something else entirely')
  })
})
