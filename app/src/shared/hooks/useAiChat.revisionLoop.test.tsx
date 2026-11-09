/**
 * L2-CHAT-1 (universal chat revision loop) — RED-first locks for the GENERIC
 * stack (useAiChat), mirroring the locks AiTabPanel.honestWall.test.tsx +
 * AiTabPanel.ghostRemount.test.tsx pin on the legacy pane:
 *
 *  - REVISION TRAIL: a follow-up done while a preview is staged rides
 *    `draftRevision` (currentPreviewDraft + revisionHistory) back to the
 *    request — the universal round-trip, the same structured context
 *    AiTabPanel's context builder sends (AiTabPanel.tsx:308-315, 642-668).
 *  - HONEST WALL: a `success:true` done that produced nothing (the shared
 *    draftEmptiness rule) is a REPORTED failure in the universal path —
 *    plain language, owned by its turn (a fresh send clears it).
 *  - LOUD ACCEPT: accepting a staged preview with NO wired onAcceptEvent
 *    surfaces a reported failure message — never the silent `if (handler)`
 *    no-op (spec §1: "make the missing-handler case loud").
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

/** Drive a canned frame sequence through the mocked streamAssist generator. */
function frames(...events: Array<Record<string, unknown>>) {
  vi.mocked(streamAssist).mockImplementation(async function* () {
    for (const e of events) yield e as never
  })
}

const DONE_WITH_EVENT = {
  type: 'done',
  result: {
    success: true,
    events: [{ eventId: 'EVT-1', event_type: 'add_material', details: {} }],
    notes: [],
  },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useAiChat — L2-CHAT-1 universal revision loop', () => {
  it('REVISION TRAIL: a follow-up send while a preview is staged rides draftRevision (events + revisionHistory) back to the request', async () => {
    frames({ type: 'status', message: 'working' }, DONE_WITH_EVENT)
    const { result } = renderHook(() => useAiChat({ aiContext }))

    await act(async () => {
      result.current.sendPrompt('draft a transfer to B1')
    })
    await waitFor(() => expect(result.current.hasPreview).toBe(true))

    const firstContext = vi.mocked(streamAssist).mock.calls[0]![2] as Record<string, unknown>
    expect(firstContext.draftRevision).toBeUndefined()

    // A follow-up turn while the ghost is staged is a REVISE.
    frames({ type: 'status', message: 'working again' }, DONE_WITH_EVENT)
    await act(async () => {
      result.current.sendPrompt('actually use C1 instead')
    })
    await waitFor(() => expect(result.current.previewEvents.length).toBe(1))

    const secondContext = vi.mocked(streamAssist).mock.calls[1]![2] as Record<string, unknown>
    const draftRevision = secondContext.draftRevision as {
      currentPreviewDraft: { events: Array<{ eventId: string }>; sourcePrompt?: string }
      revisionHistory: Array<{ prompt: string; createdAt: string }>
    }
    expect(draftRevision).toBeDefined()
    expect(draftRevision.currentPreviewDraft.events).toEqual([
      expect.objectContaining({ eventId: 'EVT-1' }),
    ])
    // L2-CHAT-1 FIX1 D3 (legacy AiTabPanel.tsx:296-315, 642-647 shape): the
    // first draft's prompt rides as currentPreviewDraft.sourcePrompt and the
    // trail is EXCLUSIVE of it — so a 2-turn chain carries an EMPTY
    // revisionHistory on turn 2 (the trail starts at the 2nd draft).
    expect(draftRevision.currentPreviewDraft.sourcePrompt).toBe('draft a transfer to B1')
    expect(draftRevision.revisionHistory).toHaveLength(0)
  })

  it('HONEST WALL: a success that produced nothing is a REPORTED failure in plain language, owned by its turn', async () => {
    frames(
      { type: 'status', message: 'working' },
      { type: 'done', result: { success: true, notes: ['I looked at the run.'] } },
    )
    const { result } = renderHook(() => useAiChat({ aiContext }))

    await act(async () => {
      result.current.sendPrompt('free-form request that claims success')
    })
    await waitFor(() => expect(result.current.honestWall).toBeTruthy())
    expect(result.current.honestWall).toContain('Draft produced no events')
    expect(result.current.hasPreview).toBe(false)

    // The reported failure belongs to ITS turn: a fresh send clears it.
    frames({ type: 'status', message: 'working again' }, DONE_WITH_EVENT)
    await act(async () => {
      await result.current.sendPrompt('draft a read for A1')
    })
    expect(result.current.honestWall).toBeNull()
    await waitFor(() => expect(result.current.hasPreview).toBe(true))
  })

  it('LOUD ACCEPT: accepting with NO wired onAcceptEvent reports the failure — never a silent no-op', async () => {
    frames({ type: 'status', message: 'working' }, DONE_WITH_EVENT)
    const { result } = renderHook(() => useAiChat({ aiContext }))
    await act(async () => {
      result.current.sendPrompt('draft a transfer to B1')
    })
    await waitFor(() => expect(result.current.hasPreview).toBe(true))

    await act(async () => {
      result.current.acceptPreview()
    })
    await waitFor(() => {
      const failure = result.current.messages.find(
        (m) => m.role === 'system' && m.content.includes('could not be applied'),
      )
      expect(failure).toBeTruthy()
    })
  })

  it('wired onAcceptEvent still applies (control: the loud path is absent when a handler IS wired)', async () => {
    const onAcceptEvent = vi.fn()
    frames({ type: 'status', message: 'working' }, DONE_WITH_EVENT)
    const { result } = renderHook(() => useAiChat({ aiContext, onAcceptEvent }))
    await act(async () => {
      result.current.sendPrompt('draft a transfer to B1')
    })
    await waitFor(() => expect(result.current.hasPreview).toBe(true))

    await act(async () => {
      result.current.acceptPreview()
    })
    await waitFor(() => expect(onAcceptEvent).toHaveBeenCalledTimes(1))
    expect(onAcceptEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'EVT-1' }),
    )
    expect(
      result.current.messages.some((m) => m.content.includes('could not be applied')),
    ).toBe(false)
  })
})
