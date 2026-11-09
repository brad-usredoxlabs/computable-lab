/**
 * L2-SUITE-A-uifix2 FIX2 [D6] RED — a deck-bar accept (an EXTERNAL commit of
 * the staged preview) makes the chat's proposal card inert and removes the
 * stale "auto-rejected" dead chrome.
 *
 * Gate re-gate-3 defect 6 (MINOR), /deck/EVG-…-40ac4623 after the P3 accept:
 * the accept step returned {accepted:true}, the preview bar was gone, the
 * record contentSha advanced 718e21aa — yet `[data-testid=chat-preview]`
 * still rendered an ACTIVE Apply/Discard (a second Apply on an
 * already-applied batch), with a stale "Previous preview was auto-rejected."
 * line above it (shot 41-04-p3-accepted-footprint.png).
 *
 * ROOT CAUSE: the deck bar (PreviewActionBar → adoptStagedPreview →
 * commitPreview) commits the EDITOR preview (state.preview nulls inside the
 * reducer) but leaves the universal chat hook's OWN `previewEvents` staged
 * (separate state in useAiChat). So `hasPreview` stays true (the
 * ChatPreviewCard keeps ACTIVE chrome) and the next send's `revising` check
 * (sendPrompt) sees the stale staged batch and appends the "auto-rejected"
 * line — even though the batch was ACCEPTED, not rejected.
 *
 * THE FIX (this file pins it):
 *  - the hook exposes a one-shot `clearStagedPreviewForExternalCommit(
 *    commitSha?)` that the deck bar calls from its post-adoption hook with the
 *    persisted commit's sha: it clears the chat's staged state, ends the
 *    draft chain, and records an honest "Proposal applied (commit <sha>)."
 *    line (an ACCEPT, not a rejection). It is a no-op when nothing is staged
 *    (the chat-Apply adopter already cleared it — one adopter, one clear).
 *  - the stale "Previous preview was auto-rejected." line is DROPPED from
 *    sendPrompt's revise branch: a send that supersedes a staged preview is a
 *    REVISE turn — the staged draft still rides back as `draftRevision`
 *    context (asserted here), so nothing honest is lost; the pill was dead
 *    chrome sitting above the still-active card and mislabeled the outcome.
 *
 * RED (before the fix): the `clearStagedPreviewForExternalCommit` method does
 * not exist (undefined), and a revise send appends the auto-rejected line.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAiChat } from './useAiChat'
import { streamAssist } from '../api/aiClient'
import type { AiContext } from '../../types/aiContext'
import type { PlateEvent } from '../../types/events'

// Stub the stream + thread + API clients (the same family the ghost test
// uses): no live stack, no thread writes, deterministic send.
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

vi.mock('../api/aiThreadClient', () => ({
  getThread: vi.fn().mockRejectedValue(new Error('no thread')),
  appendThreadMessage: vi.fn().mockResolvedValue(undefined),
  promoteThread: vi.fn().mockResolvedValue(undefined),
}))

const mockAiContext: AiContext = {
  surface: 'event-editor',
  surfaceContext: {},
  summary: 'Test summary',
}

const addMaterial: PlateEvent = {
  eventId: 'evt-add_material-czwnctg4',
  event_type: 'add_material',
  details: { volume: { value: 100, unit: 'uL' }, material_ref: { kind: 'record', id: 'MAT-1' }, wells: ['A1'] },
} as unknown as PlateEvent

function renderChat() {
  return renderHook(() =>
    useAiChat({
      aiContext: mockAiContext,
      onAcceptEvent: vi.fn(),
      onAddLabwareFromRecord: vi.fn(),
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  // An empty generator: the turn finishes with no stream events (no done, no
  // frames) — the send completes, and the pre-stream message writes are what
  // this file asserts.
  vi.mocked(streamAssist).mockReturnValue((async function* () {
    /* no frames */
  })())
})

describe('useAiChat — L2-SUITE-A-uifix2 FIX2 [D6]: external-commit clear + no stale auto-rejected line', () => {
  it('clears the staged preview when the deck bar commits it externally (accepted:true + contentSha advanced) — hasPreview goes false, honest ACCEPT line named by the commit sha', () => {
    const { result } = renderChat()
    act(() => {
      result.current.setPreviewEvents([addMaterial])
      result.current.setPreviewEventState(addMaterial.eventId, 'pending')
    })
    expect(result.current.hasPreview).toBe(true)
    expect(result.current.previewEvents).toHaveLength(1)

    const messagesBefore = result.current.messages.length
    act(() => {
      result.current.clearStagedPreviewForExternalCommit('718e21aa')
    })

    // The staged preview is gone → the ChatPreviewCard goes inert (it
    // renders only when hasPreview).
    expect(result.current.hasPreview).toBe(false)
    expect(result.current.previewEvents).toEqual([])
    expect(result.current.previewEventStates.size).toBe(0)
    // An honest ACCEPT (not a rejection), named by the commit's sha
    // (the record's advanced contentSha).
    expect(result.current.messages.length).toBe(messagesBefore + 1)
    expect(result.current.messages[result.current.messages.length - 1]?.content).toBe(
      'Proposal applied (commit 718e21aa).',
    )
  })

  it('records an honest ACCEPT line even when the persisted commit carries no sha (non-null-safe)', () => {
    const { result } = renderChat()
    act(() => {
      result.current.setPreviewEvents([addMaterial])
    })
    const messagesBefore = result.current.messages.length
    act(() => {
      result.current.clearStagedPreviewForExternalCommit()
    })
    expect(result.current.hasPreview).toBe(false)
    expect(result.current.messages.length).toBe(messagesBefore + 1)
    expect(result.current.messages[result.current.messages.length - 1]?.content).toBe('Proposal applied.')
  })

  it('is a no-op when nothing is staged (the chat-Apply adopter already cleared it — one adopter, one clear, no duplicate line)', () => {
    const { result } = renderChat()
    const messagesBefore = result.current.messages.length
    // First call with a staged preview: clears + records the accept.
    act(() => {
      result.current.setPreviewEvents([addMaterial])
    })
    act(() => {
      result.current.clearStagedPreviewForExternalCommit('sha-a')
    })
    const afterFirst = result.current.messages.length
    // Second call (nothing staged anymore): must NOT append a second line.
    act(() => {
      result.current.clearStagedPreviewForExternalCommit('sha-b')
    })
    expect(result.current.messages.length).toBe(afterFirst)
    expect(result.current.hasPreview).toBe(false)
    expect(result.current.messages.length).toBeGreaterThan(messagesBefore)
  })

  it('a revise send that supersedes a staged preview does NOT append the stale "auto-rejected" line — the staged draft still rides back as draftRevision context', async () => {
    const { result } = renderChat()
    act(() => {
      result.current.setPreviewEvents([addMaterial])
    })
    expect(result.current.hasPreview).toBe(true)

    await act(async () => {
      await result.current.sendPrompt('next prompt')
    })

    // The stale dead-chrome line is GONE (D6).
    const autoRejected = result.current.messages.filter(
      (m) => m.content.includes('auto-rejected'),
    )
    expect(autoRejected.length).toBe(0)

    // But the honest REVISE context is preserved: the staged draft rode back
    // to the server as draftRevision (the superseded draft's events).
    await waitFor(() => {
      expect(streamAssist).toHaveBeenCalled()
    })
    const callArgs = vi.mocked(streamAssist).mock.calls[0]
    expect(callArgs).toBeTruthy()
    const contextPayload = callArgs[2] as { draftRevision?: { currentPreviewDraft: { events: PlateEvent[] } } }
    expect(contextPayload?.draftRevision?.currentPreviewDraft?.events).toEqual([addMaterial])
  })

  it('the auto-rejected line is absent even on a FRESH send (no staged preview) — the string is retired, not just suppressed in the revise branch', async () => {
    const { result } = renderChat()
    expect(result.current.hasPreview).toBe(false)

    await act(async () => {
      await result.current.sendPrompt('a fresh prompt')
    })

    const autoRejected = result.current.messages.filter(
      (m) => m.content.includes('auto-rejected'),
    )
    expect(autoRejected.length).toBe(0)
  })
})
