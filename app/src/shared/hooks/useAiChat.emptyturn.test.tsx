/**
 * L2-P1-EMPTY-TURN-CARD-1 u1 — a zero-events turn with NO delivered channel
 * must surface the actionable honest wall, never settle with only the
 * "No events generated." narration (gate PROMPT1-GATE-20261114T133918Z
 * draw 1, thread d6af42ce: 125 s poll, cardCount 0, no wall).
 *
 * Defect: onRecordDraftProposal is registered by the universal stack
 * (useSurfaceChat.ts:41), so a record_draft_proposal frame sets
 * handledProposalFrame = true (useAiChat.ts, the relay block) — which skips
 * BOTH emptiness gates, leaving the turn with narration only.
 *
 * RED at base: the relayed frame suppresses the wall (honestWall stays null).
 * GREEN at tip: the wall fires, names the unmounted channel, and points at
 * the next step (naming the unknown-noun route when the payload carries it).
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
  apiClient: { getRecord: vi.fn(), getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }) },
}))

const aiContext: AiContext = { surface: 'event-editor', summary: 's', surfaceContext: {} }
const DRAFT = { operation: 'compose-record', kind: 'labware' }
const doneResult: Record<string, unknown> = { success: true, events: [], notes: [] }

beforeEach(() => { vi.clearAllMocks() })

async function drive(frames: Array<Record<string, unknown>>, relay?: (draft: Record<string, unknown>) => void) {
  vi.mocked(streamAssist).mockImplementation(async function* () {
    for (const f of frames) yield f as never
  })
  const { result: hook } = renderHook(() => useAiChat({ aiContext, onRecordDraftProposal: relay }))
  await act(async () => { hook.current.sendPrompt('place the unknown product on the deck') })
  await waitFor(() => expect(hook.current.isStreaming).toBe(false), { timeout: 8000 })
  return hook
}

describe('useAiChat — L2-P1-EMPTY-TURN-CARD-1 u1: zero-events turn with no delivered channel', () => {
  it('relayed record-draft frame + zero-events done with nothing delivered: the honest wall fires and names the unknown-noun route', async () => {
    const relay = vi.fn()
    const hook = await drive([
      { type: 'status', message: 'working' },
      { type: 'record_draft_proposal', recordDraft: DRAFT },
      { type: 'done', result: { ...doneResult, unresolvedRefs: [{ ref: { id: 'unknown', label: 'Thermo Optical-Quality Imaging Plate', reason: 'unknown-noun' }, usedInEvents: [] }] } },
    ], relay)
    expect(relay).toHaveBeenCalledTimes(1)
    // The turn did NOT settle with only the "No events generated." narration.
    const wall = hook.current.honestWall
    expect(wall, 'the honest wall must fire when nothing was delivered').toBeTruthy()
    expect(wall).toContain('Draft produced no events')
    // It names the channel that could not mount …
    expect(wall).toContain('record draft that did not mount')
    // … names the unknown-noun route the payload carries …
    expect(wall).toContain('unknown-noun')
    // … and points at a next step.
    expect(wall).toContain('create a local term')
  })

  it('control: a zero-events done with NO relay (no delivered channel) still fires the wall (pre-existing arm)', async () => {
    const relay = vi.fn()
    const hook = await drive([
      { type: 'status', message: 'working' },
      { type: 'done', result: doneResult },
    ], relay)
    expect(relay).not.toHaveBeenCalled()
    await waitFor(() => expect(hook.current.honestWall).toBeTruthy())
    expect(hook.current.honestWall).toContain('Draft produced no events')
    // The narration tail still lands in the assistant message (unchanged).
    // (The empty-success bubble appends AFTER the assistant row — the pinned
    // order (empty.test.ts / hydrationClobber.test.tsx) — so assert the
    // assistant row's content, not the last row's.)
    const assistant = hook.current.messages[hook.current.messages.length - 2]
    expect(String(assistant.content)).toContain('No events generated.')
  })
})
