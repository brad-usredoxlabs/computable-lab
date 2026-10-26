/**
 * L2-CHAT-1 FIX1 — D2 + D3 RED-first locks.
 *
 * D2 (MEDIUM): acceptPreview's successful (handler-wired) branch never reset
 *    revisionTrailRef / stagedSourceRef, so a prompt from an already-APPLIED
 *    draft chain leaked into a LATER chain's draftRevision.revisionHistory.
 *    Fix: reset the trail on every successful accept (mirror the else branches).
 *
 * D3 (MEDIUM): the universal draftRevision payload diverged from the legacy
 *    pane (AiTabPanel.tsx:296-315, 642-668): it carried NO sourcePrompt and its
 *    revisionHistory INCLUDED the first draft's prompt. Legacy carries the first
 *    draft's prompt as currentPreviewDraft.sourcePrompt and keeps the trail
 *    EXCLUSIVE of it (the trail starts at the 2nd draft). Fix: align the shape.
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

const DONE = (eventId: string) => ({
  type: 'done',
  result: { success: true, events: [{ eventId, event_type: 'add_material', details: {} }], notes: [] },
})

type DraftRevision = {
  currentPreviewDraft: { events: Array<{ eventId: string }>; sourcePrompt?: string }
  revisionHistory: Array<{ prompt: string; createdAt: string }>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useAiChat — L2-CHAT-1 FIX1 D2/D3 revision-trail + draftRevision shape', () => {
  it('D2: a successful Apply resets the trail so a LATER chain does not carry the applied chain\'s prompt', async () => {
    const onAcceptEvent = vi.fn()
    const { result } = renderHook(() => useAiChat({ aiContext, onAcceptEvent }))

    // Chain 1: A (fresh) -> B (revise) -> C (revise). The trail now holds B.
    frames({ type: 'status', message: 's' }, DONE('EVT-A'))
    await act(async () => { result.current.sendPrompt('draft A') })
    await waitFor(() => expect(result.current.hasPreview).toBe(true))

    frames({ type: 'status', message: 's' }, DONE('EVT-B'))
    await act(async () => { result.current.sendPrompt('revise to B') })
    await waitFor(() => expect(result.current.previewEvents.length).toBe(1))

    frames({ type: 'status', message: 's' }, DONE('EVT-C'))
    await act(async () => { result.current.sendPrompt('revise to C') })
    await waitFor(() => expect(result.current.previewEvents.length).toBe(1))

    // Apply the staged chain (handler wired) — the chain is now DONE.
    await act(async () => { await result.current.acceptPreview() })
    await waitFor(() => expect(onAcceptEvent).toHaveBeenCalledTimes(1))

    // Chain 2 (fresh): D -> E (revise). E's request must NOT carry B (the
    // applied chain's prompt). D2: the Apply reset the trail.
    frames({ type: 'status', message: 's' }, DONE('EVT-D'))
    await act(async () => { result.current.sendPrompt('draft D') })
    await waitFor(() => expect(result.current.hasPreview).toBe(true))

    frames({ type: 'status', message: 's' }, DONE('EVT-E'))
    await act(async () => { result.current.sendPrompt('revise to E') })
    await waitFor(() => expect(result.current.previewEvents.length).toBe(1))

    // E is the revise in chain 2: its request is the LAST streamAssist call.
    const lastCall = vi.mocked(streamAssist).mock.calls[4]![2] as Record<string, unknown>
    const draftRevision = lastCall.draftRevision as DraftRevision
    expect(draftRevision).toBeDefined()
    // D2: the applied chain's prompt (B) must NOT leak into chain 2's trail.
    const prompts = draftRevision.revisionHistory.map((e) => e.prompt)
    expect(prompts).not.toContain('revise to B')
  })

  it('D3: a 2-turn chain rides the first draft\'s prompt as sourcePrompt with an EMPTY trail (legacy shape)', async () => {
    const { result } = renderHook(() => useAiChat({ aiContext }))

    frames({ type: 'status', message: 's' }, DONE('EVT-1'))
    await act(async () => { result.current.sendPrompt('draft a transfer to B1') })
    await waitFor(() => expect(result.current.hasPreview).toBe(true))

    frames({ type: 'status', message: 's' }, DONE('EVT-2'))
    await act(async () => { result.current.sendPrompt('actually use C1 instead') })
    await waitFor(() => expect(result.current.previewEvents.length).toBe(1))

    const ctx = vi.mocked(streamAssist).mock.calls[1]![2] as Record<string, unknown>
    const draftRevision = ctx.draftRevision as DraftRevision
    expect(draftRevision).toBeDefined()
    expect(draftRevision.currentPreviewDraft.events).toEqual([
      expect.objectContaining({ eventId: 'EVT-1' }),
    ])
    // D3: the first draft's prompt rides as sourcePrompt, and the trail is
    // EXCLUSIVE of it (legacy: trail starts at the 2nd draft). So a 2-turn
    // chain has an EMPTY revisionHistory on turn 2.
    expect(draftRevision.currentPreviewDraft.sourcePrompt).toBe('draft a transfer to B1')
    expect(draftRevision.revisionHistory).toHaveLength(0)
  })

  it('D3: on a 3rd turn the trail carries the 2nd draft\'s prompt (never the 1st)', async () => {
    const { result } = renderHook(() => useAiChat({ aiContext }))

    frames({ type: 'status', message: 's' }, DONE('EVT-1'))
    await act(async () => { result.current.sendPrompt('draft a transfer to B1') })
    await waitFor(() => expect(result.current.hasPreview).toBe(true))

    frames({ type: 'status', message: 's' }, DONE('EVT-2'))
    await act(async () => { result.current.sendPrompt('actually use C1 instead') })
    await waitFor(() => expect(result.current.previewEvents.length).toBe(1))

    frames({ type: 'status', message: 's' }, DONE('EVT-3'))
    await act(async () => { result.current.sendPrompt('then read A2') })
    await waitFor(() => expect(result.current.previewEvents.length).toBe(1))

    const ctx = vi.mocked(streamAssist).mock.calls[2]![2] as Record<string, unknown>
    const draftRevision = ctx.draftRevision as DraftRevision
    expect(draftRevision).toBeDefined()
    // D3 legacy shape: sourcePrompt = the 2nd draft's prompt; trail = the 2nd
    // draft's prompt only (the 1st draft's prompt is never in the trail).
    expect(draftRevision.currentPreviewDraft.sourcePrompt).toBe('actually use C1 instead')
    expect(draftRevision.revisionHistory).toHaveLength(1)
    expect(draftRevision.revisionHistory[0].prompt).toBe('actually use C1 instead')
    expect(draftRevision.revisionHistory[0].prompt).not.toBe('draft a transfer to B1')
  })
})
