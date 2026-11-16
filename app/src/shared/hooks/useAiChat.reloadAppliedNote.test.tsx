/**
 * L2-P1-R16D1-RELOAD-1 u1 — the AI chat thread's applied-result record must
 * survive a cold browser reload, so a person returning to the thread can see
 * what was already applied (gate r16 D1 high).
 *
 * JOURNEY OPERATION: place sentence -> card -> Apply -> cold reload. On Apply
 * the hook pushes an adopted-summary `system` message (useAiChat.ts ~2543:
 * "Accepted 1 event plus 1 new labware plus 1 placement commit <sha>").
 *
 * That message was dropped by TWO machine lines and never persisted:
 *   1. the sync effect SKIPS system messages (`if (m.role === 'system')
 *      continue`) — so it never reached the thread messages endpoint;
 *   2. hydration FILTERS system out (`m.role === 'user' || m.role ===
 *      'assistant'`) — so even a persisted one would not come back on reload.
 *
 * The server (server/src/ai-threads/AiThreadStore.ts `append`) spreads
 * `input.message` with NO role whitelist, and ThreadRole already includes
 * `'system'` — so NO server change is needed; the message persistence has a
 * single authority (the thread-messages endpoint) and it accepts `system`.
 *
 * RED (pre-fix): the HYDRATE and SYNC assertions below both fail — the
 * system message is filtered on hydrate and skipped on sync. GREEN (post-fix):
 * both ride `system` through. Mutation controls: re-adding the `continue` in
 * the sync effect turns the SYNC test RED; re-adding the role filter in
 * hydration turns the HYDRATE + IDEMPOTENT tests RED.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { AiContext } from '../../types/aiContext'
import type { PlateEvent } from '../../types/events'
import { streamAssist } from '../api/aiClient'

const mocked = vi.hoisted(() => ({
  getThread: vi.fn(),
  appendThreadMessage: vi.fn().mockResolvedValue(undefined),
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))

vi.mock('../api/aiThreadClient', () => ({
  getThread: mocked.getThread,
  appendThreadMessage: mocked.appendThreadMessage,
}))
vi.mock('../api/aiClient', () => ({
  streamAssist: mocked.streamAssist,
  getAiHealth: mocked.getAiHealth,
}))
vi.mock('../api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }),
  },
}))

import { useAiChat } from './useAiChat'

const aiContext: AiContext = { surface: 'run-workspace', summary: 'test', surfaceContext: {} }

const COMMIT_SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
const ADOPTED_SUMMARY = `Accepted 1 event plus 1 new labware plus 1 placement commit ${COMMIT_SHA}`

// The applied-result system record exactly as the hook's adoption arm pushes
// it (role 'system', content = the adopted summary line).
const PERSISTED_APPLIED = {
  role: 'system' as const,
  content: ADOPTED_SUMMARY,
  createdAt: '2026-11-14T10:45:53.000Z',
}

// A transfer event so the done arm stages a non-empty preview (the adoption
// seam fires only when eventsToAccept.length > 0) — mirrors the real place
// flow's placement event.
const PLACE_EVENT: PlateEvent = {
  eventId: 'EVT-PLACE-1',
  event_type: 'transfer',
  details: {
    source_labwareId: 'L1',
    source_wells: ['A1'],
    dest_labwareId: 'P1',
    dest_wells: ['B1'],
    volume: { value: 50, unit: 'uL' },
  },
} as unknown as PlateEvent

function streamDoneWithPreview() {
  vi.mocked(streamAssist).mockImplementation(async function* () {
    yield { type: 'status', message: 'working' } as never
    yield {
      type: 'done',
      result: {
        success: true,
        events: [PLACE_EVENT],
        labwareAdditions: [{ recordId: 'REC-P1', reason: 'destination', deckSlot: 'slot-1' }],
        notes: [],
      },
    } as never
  })
}

function systemAppends(): Array<Record<string, unknown>> {
  return mocked.appendThreadMessage.mock.calls
    .map((c) => c[1] as { message?: { role?: string; content?: string; metadata?: unknown } })
    .filter((b) => b?.message?.role === 'system')
    .map((b) => b.message as unknown as Record<string, unknown>)
}

beforeEach(() => {
  mocked.getThread.mockReset()
  mocked.getThread.mockResolvedValue({ messages: [] })
  mocked.appendThreadMessage.mockReset()
  mocked.appendThreadMessage.mockResolvedValue(undefined)
  vi.mocked(streamAssist).mockReset()
  streamDoneWithPreview()
})

describe('useAiChat — applied-result record survives a cold reload (L2-P1-R16D1-RELOAD-1 u1)', () => {
  it('SYNC: Apply pushes an adopted-summary system message that is PERSISTED to the thread (role system reaches appendThreadMessage)', async () => {
    // Fresh thread (empty read) so the turn is the only source of messages.
    mocked.getThread.mockResolvedValue({ messages: [] })

    const { result } = renderHook(() =>
      useAiChat({
        aiContext,
        endpoint: 'event-editor',
        // The deck's accept seam: a COMPLETE adoption (the real deckAdoption
        // core's observable contract) — adopted, with the counts the summary
        // line reports and the persisted commit's sha.
        onPreviewAccept: async () => ({
          adopted: true,
          eventCount: 1,
          labwareCount: 1,
          placementCount: 1,
          commitSha: COMMIT_SHA,
        }),
      }),
    )

    await act(async () => {
      result.current.sendPrompt('Place a 96-well plate on the deck.')
    })
    await waitFor(() => expect(result.current.hasPreview).toBe(true), { timeout: 4000 })

    // Apply via the chat card (the journey operation: card -> Apply).
    await act(async () => {
      await result.current.acceptPreview()
    })

    // The applied-result system record appears in the live transcript.
    await waitFor(() =>
      expect(
        result.current.messages.some((m) => m.role === 'system' && m.content === ADOPTED_SUMMARY),
      ).toBe(true),
    )

    // THE persistence leg: the sync effect must NOT skip it — the system
    // message reaches the thread messages endpoint (role preserved, content
    // verbatim). Pre-fix: `if (m.role === 'system') continue` drops it, so
    // appendThreadMessage is never called with a system role.
    await waitFor(() => expect(systemAppends().length).toBeGreaterThan(0), { timeout: 4000 })
    const persisted = systemAppends().find((m) => m.content === ADOPTED_SUMMARY)
    expect(persisted).toBeDefined()
    expect(persisted!.content).toBe(ADOPTED_SUMMARY)
  })

  it('HYDRATE: a persisted applied-result system message survives the hydration filter (reload shows the record)', async () => {
    // A cold reload reads a thread that already contains the applied-result
    // system record (persisted by a prior session's Apply).
    mocked.getThread.mockResolvedValue({ messages: [PERSISTED_APPLIED] })

    const { result } = renderHook(() => useAiChat({ aiContext, endpoint: 'event-editor' }))

    // Pre-fix the hydration filter (`m.role === 'user' || m.role ===
    // 'assistant'`) drops it, so the reloaded thread shows nothing applied.
    await waitFor(
      () =>
        expect(
          result.current.messages.some((m) => m.role === 'system' && m.content === ADOPTED_SUMMARY),
        ).toBe(true),
      { timeout: 4000 },
    )
    // The record comes back VERBATIM (content + role preserved — the commit
    // sha is still there, so the person sees exactly what was applied).
    const restored = result.current.messages.find(
      (m) => m.role === 'system' && m.content === ADOPTED_SUMMARY,
    )
    expect(restored).toBeDefined()
    expect(restored!.role).toBe('system')
    expect(restored!.content).toContain(`commit ${COMMIT_SHA}`)
  })

  it('IDEMPOTENT: a hydrated applied-result system message is NOT re-posted on the second sync pass (no duplicate)', async () => {
    mocked.getThread.mockResolvedValue({ messages: [PERSISTED_APPLIED] })

    const { result } = renderHook(() => useAiChat({ aiContext, endpoint: 'event-editor' }))

    // Hydration settles: the record is present exactly ONCE in the transcript.
    await waitFor(
      () =>
        expect(
          result.current.messages.filter((m) => m.role === 'system').length,
        ).toBe(1),
      { timeout: 4000 },
    )

    // Wait out the post-hydration sync pass (the hydration .finally bumps
    // hydrationSeq, which re-runs the sync effect — the "second sync pass").
    // The hydrated system id is in persistedIdsRef (hydration adds it), so it
    // must NOT be re-posted: no system append at all, and the transcript stays
    // at exactly one system message (no duplicate).
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(systemAppends()).toHaveLength(0)
    expect(result.current.messages.filter((m) => m.role === 'system').length).toBe(1)
  })
})
