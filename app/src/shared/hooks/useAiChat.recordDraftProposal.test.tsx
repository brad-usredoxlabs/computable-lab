/**
 * QMS7-7 — RED-first: the generic stack (useAiChat + types/ai.ts) must
 * understand the `record_draft_proposal` frame instead of silently dropping it
 * (the PB-CH-6 defect class, mirrored from useAiChat.analysisProposal.test.tsx
 * and useAiChat.channelEnvelopes.test.tsx exactly).
 *
 * Pinned:
 *  - a record_draft_proposal frame fires onRecordDraftProposal with the
 *    VERBATIM payload (no reshaping, no validation — the trust boundary is
 *    POST /api/drafts/compile, Ajv + canAccept);
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

// The generic stack is surface-agnostic for frame handling; 'analysis' is the
// union member this harness rides (the /registry mount itself goes through
// useChatThread, not useAiChat — see AiTabPanel.recordDraft.test.tsx).
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

// The VERBATIM server frame (the QMS7-7 orchestrator arm emits
// {type:'record_draft_proposal', recordDraft}; envelope shape per the
// recordDraft tool-def property — operation + kind + fields only).
const RECORD_DRAFT_FRAME = {
  type: 'record_draft_proposal',
  recordDraft: {
    operation: 'compose-record',
    kind: 'training-material',
    fields: { title: 'Pipetting safety basics', materialType: 'slide_deck' },
  },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useAiChat — record_draft_proposal envelope (QMS7-7)', () => {
  it('record_draft_proposal frame fires onRecordDraftProposal with the verbatim payload', async () => {
    frames(
      { type: 'status', message: 'working' },
      RECORD_DRAFT_FRAME,
      { type: 'done', result: { success: true, notes: ['Proposed a record draft — review the card; nothing was written.'] } },
    )
    const onRecordDraftProposal = vi.fn()
    const { result } = renderHook(() => useAiChat({ aiContext, onRecordDraftProposal }))

    act(() => {
      result.current.sendPrompt('create a proposed training document for human review')
    })

    await waitFor(() => expect(result.current.isStreaming).toBe(false))
    expect(onRecordDraftProposal).toHaveBeenCalledTimes(1)
    expect(onRecordDraftProposal).toHaveBeenCalledWith(RECORD_DRAFT_FRAME.recordDraft)
  })

  it('record_draft_proposal with NO callback registered surfaces a NAMED system bubble — the frame is never swallowed', async () => {
    frames(
      RECORD_DRAFT_FRAME,
      { type: 'done', result: { success: true, notes: [] } },
    )
    const { result } = renderHook(() => useAiChat({ aiContext }))

    act(() => {
      result.current.sendPrompt('create a proposed training document')
    })

    await waitFor(() => expect(result.current.isStreaming).toBe(false))
    const systemBubble = result.current.messages.find(
      (m) => m.role === 'system' && m.content.includes('record draft'),
    )
    expect(systemBubble).toBeDefined()
    expect(systemBubble!.content).toContain('cannot show proposal cards')
  })

  it('a throwing onRecordDraftProposal surfaces a system line and the turn continues', async () => {
    frames(
      RECORD_DRAFT_FRAME,
      { type: 'done', result: { success: true, notes: [] } },
    )
    const onRecordDraftProposal = vi.fn(() => {
      throw new Error('card mount exploded')
    })
    const { result } = renderHook(() => useAiChat({ aiContext, onRecordDraftProposal }))

    act(() => {
      result.current.sendPrompt('create a proposed training document')
    })

    await waitFor(() => expect(result.current.isStreaming).toBe(false))
    expect(onRecordDraftProposal).toHaveBeenCalledTimes(1)
    const systemBubble = result.current.messages.find(
      (m) => m.role === 'system' && m.content.includes('card mount exploded'),
    )
    expect(systemBubble).toBeDefined()
    expect(systemBubble!.content).toContain('Nothing was written')
  })
})
