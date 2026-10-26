/**
 * L2-CHAT-1 FIX1 — D1 (HIGH): the chat card's Apply must UNMOUNT the ghost
 * preview so the deck's PreviewActionBar cannot commit the SAME events a
 * second time (duplicate persisted event graph).
 *
 * Mechanism under test: useAiChat.acceptPreview's successful (handler-wired)
 * branch used to apply events (onAcceptEvent/appendEvent) but NEVER call the
 * discard seam (onPreviewDiscarded), so the editor's ghost preview stayed
 * mounted. The deck's PreviewActionBar then offered Accept again and its
 * commitPreview appended the SAME previewEvents a second time.
 *
 * This test mirrors the REAL reducer's append_event / commit_preview /
 * clear_preview (EventEditorContext.tsx:825-899) so "apply via chat card, then
 * attempt deck-bar commit" reproduces the exact double-write.
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

// A mini editor mirroring the REAL reducer's append_event / commit_preview /
// clear_preview (EventEditorContext.tsx:825-899). The D1 defect: the chat
// card's Apply (appendEvent) leaves the ghost preview mounted, so the deck's
// PreviewActionBar (commitPreview) commits the SAME events a second time.
const editor = {
  events: [] as Array<{ eventId: string }>,
  preview: null as unknown,
  // append_event (825-826): events:[...state.events, action.event] — no dedupe.
  appendEvent: (event: { eventId: string }) => {
    editor.events = [...editor.events, event]
  },
  // clear_preview (871-883): preview -> null.
  clearPreview: () => {
    editor.preview = null
  },
  // set_preview (849-868): replace the mounted preview.
  setPreview: (preview: unknown) => {
    editor.preview = preview
  },
  // commit_preview (884-899): no-op unless a preview is mounted; else appends
  // the preview's events (894) and clears the preview.
  commitPreview: (previewEvents?: Array<{ eventId: string }>) => {
    const preview = editor.preview
    if (!preview) return
    const list =
      previewEvents ??
      (preview as { previewEvents: Array<{ eventId: string }> }).previewEvents
    editor.events = [...editor.events, ...list]
    editor.preview = null
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  editor.events = []
  editor.preview = null
})

describe('useAiChat — D1: chat-card Apply unmounts the ghost (one adopter)', () => {
  it('Apply via the chat card clears the ghost so the deck bar cannot re-commit the same events', async () => {
    frames(
      { type: 'status', message: 'working' },
      {
        type: 'done',
        result: {
          success: true,
          events: [{ eventId: 'EVT-1', event_type: 'add_material', details: {} }],
          notes: [],
        },
      },
    )
    const { result } = renderHook(() =>
      useAiChat({
        aiContext,
        onAcceptEvent: (event) => editor.appendEvent(event as { eventId: string }),
        onProposalDrafted: (draft) =>
          editor.setPreview({ previewEvents: draft.events, previewPlacements: [] }),
        onPreviewDiscarded: () => editor.clearPreview(),
      }),
    )

    await act(async () => {
      result.current.sendPrompt('draft an add_material for A1')
    })
    await waitFor(() => expect(result.current.hasPreview).toBe(true))

    // The ghost is mounted on the editor state (the universal ghost leg).
    expect(editor.preview).toBeTruthy()
    expect((editor.preview as { previewEvents: Array<{ eventId: string }> }).previewEvents).toEqual([
      expect.objectContaining({ eventId: 'EVT-1' }),
    ])

    // Apply via the chat card (the wired accept handler).
    await act(async () => {
      await result.current.acceptPreview()
    })
    // The events were applied EXACTLY ONCE (the single adopter).
    await waitFor(() => expect(editor.events.map((e) => e.eventId)).toEqual(['EVT-1']))
    // D1 FIX: the ghost preview is UNMOUNTED with the apply (the discard seam
    // the reject path uses). Before the fix it stayed mounted, so the deck bar
    // below could commit the same events a second time.
    expect(editor.preview).toBeNull()

    // Attempt the deck-bar commit (the second adopter). With the ghost
    // unmounted, commitPreview is a NO-OP — no duplicate events.
    editor.commitPreview()
    expect(editor.events.map((e) => e.eventId)).toEqual(['EVT-1'])
  })

  it('D1+D2: acceptPreviewWithResolutions (the resolve-ref accept path) ALSO unmounts the ghost and resets the trail', async () => {
    // The SECOND successful-accept path. The review's D1 ("exactly one
    // adopter") and D2 ("reset on EVERY successful accept") mandate it —
    // leaving it would re-introduce the same double-commit / trail leak on
    // the resolve-ref path.
    frames(
      { type: 'status', message: 'working' },
      {
        type: 'done',
        result: {
          success: true,
          events: [{ eventId: 'EVT-1', event_type: 'add_material', details: {} }],
          notes: [],
        },
      },
    )
    const { result } = renderHook(() =>
      useAiChat({
        aiContext,
        onAcceptEvent: (event) => editor.appendEvent(event as { eventId: string }),
        onProposalDrafted: (draft) =>
          editor.setPreview({ previewEvents: draft.events, previewPlacements: [] }),
        onPreviewDiscarded: () => editor.clearPreview(),
      }),
    )

    await act(async () => {
      result.current.sendPrompt('draft an add_material for A1')
    })
    await waitFor(() => expect(result.current.hasPreview).toBe(true))
    expect(editor.preview).toBeTruthy()

    // Accept via the resolve-ref path (empty resolutions = nothing to rewrite).
    await act(async () => {
      result.current.acceptPreviewWithResolutions(new Map())
    })
    // Applied EXACTLY ONCE, and the ghost is unmounted with the apply.
    await waitFor(() => expect(editor.events.map((e) => e.eventId)).toEqual(['EVT-1']))
    expect(editor.preview).toBeNull()
    // The deck bar cannot re-commit the same events a second time.
    editor.commitPreview()
    expect(editor.events.map((e) => e.eventId)).toEqual(['EVT-1'])
  })
})
