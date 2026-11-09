/**
 * L2-CHAT-1 FIX1 — D4 (MEDIUM) RED-first locks: the universal honest wall must
 * be reachable for EVERY channel the universal path can receive.
 *
 * The ported wall used the LEGACY pane's draftEmptiness.draftProducedNothing
 * predicate, which counts equipmentRequirements / recordCreations / deckLayout
 * / labwareRequirements / clarificationRequests as "produced something" — but
 * the universal stack (HarnessChatPane + ChatPreviewCard + useDeckGhostMount)
 * has NO render/ghost arm for any of those (the ghost mount hardcodes them to
 * [] at useDeckGhostMount.ts:73-77 and no universal surface renders them). A
 * success carrying only one of them reached neither the wall nor a card: the
 * spec §3 forbidden silently-empty pane (a polished answer beside an empty
 * plate).
 *
 * The fix narrows the universal path's predicate to the channels the universal
 * stack ACTUALLY mounts (verified render arms):
 *   - events          -> ChatPreviewCard + deck ghosts
 *   - labwareAdditions -> ChatPreviewCard "N new labware" line
 *   - clarification   -> ChatLog clarification block (ChatLog.tsx:196)
 *   - error           -> surfaced as the message content
 * "success + zero mountable + no wall = FAIL" now holds for every channel.
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

async function drive(result: Record<string, unknown>) {
  frames({ type: 'status', message: 'working' }, { type: 'done', result })
  const { result: hook } = renderHook(() => useAiChat({ aiContext }))
  await act(async () => { hook.current.sendPrompt('please deliver something') })
  return hook
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useAiChat — L2-CHAT-1 FIX1 D4: honest wall reachable for every received channel', () => {
  it('D4: an equipmentRequirements-only success is a REPORTED wall (no universal render arm)', async () => {
    const hook = await drive({
      success: true,
      notes: [],
      equipmentRequirements: [{ handle: 'water-bath-1', reason: 'for the lysis step' }],
    })
    await waitFor(() => expect(hook.current.honestWall).toBeTruthy())
    expect(hook.current.hasPreview).toBe(false)
  })

  it('D4: a recordCreations-only success is a REPORTED wall (no universal render arm)', async () => {
    const hook = await drive({
      success: true,
      notes: [],
      recordCreations: [{ kind: 'material', name: 'Lysis buffer', curie: 'cl:lysis-1' }],
    })
    await waitFor(() => expect(hook.current.honestWall).toBeTruthy())
    expect(hook.current.hasPreview).toBe(false)
  })

  it('D4: a deckLayout-only success is a REPORTED wall (no universal render arm)', async () => {
    const hook = await drive({
      success: true,
      notes: [],
      deckLayout: { platformId: 'plat-1', variantId: 'var-1' },
    })
    await waitFor(() => expect(hook.current.honestWall).toBeTruthy())
    expect(hook.current.hasPreview).toBe(false)
  })

  it('D4: a labwareRequirements-only success is a REPORTED wall (no universal render arm)', async () => {
    const hook = await drive({
      success: true,
      notes: [],
      labwareRequirements: [{ classCurie: 'cl:pipette', reason: 'a 10 ul tip' }],
    })
    await waitFor(() => expect(hook.current.honestWall).toBeTruthy())
    expect(hook.current.hasPreview).toBe(false)
  })

  it('D4 control: a success that asks a question (clarification renders in ChatLog) is NOT a wall', async () => {
    const hook = await drive({
      success: true,
      notes: [],
      clarification: { prompt: 'Which plate?', options: ['A', 'B'] },
    })
    await waitFor(() => expect(hook.current.isStreaming).toBe(false))
    // The question is a MOUNTABLE deliverable (ChatLog clarification block) —
    // the wall ("asked no questions") must not fire beside it.
    expect(hook.current.honestWall).toBeNull()
  })
})
