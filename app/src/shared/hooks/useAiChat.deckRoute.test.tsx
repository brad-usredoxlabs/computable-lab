/**
 * L2-P1-DECK-ACTION-ROUTE-1 u1deckmount (DECK-ACTIONS-ARE-THE-OPERATION clause 1+3):
 * a done carrying ONLY labwareAdditions (no events) MOUNTS through the existing deck
 * action (onAddLabwareFromRecord — the same action the manual right-click uses), not
 * the "cannot mount without events" wall. A payload-resolution THROW keeps the named
 * wall (truth, never a lie). No handler wired: byte-identical to base. RED on base:
 * the spy is never called and the wall swallows the plate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAiChat } from './useAiChat'
import { streamAssist } from '../api/aiClient'
import { apiClient } from '../api/client'
import type { AiContext } from '../../types/aiContext'
import type { AiLabwareAddition } from '../../types/ai'

vi.mock('../api/aiClient', () => ({ streamAssist: vi.fn(), getAiHealth: vi.fn().mockResolvedValue({ available: true }) }))
vi.mock('../api/aiThreadClient', () => ({ getThread: vi.fn().mockRejectedValue(new Error('no thread')), appendThreadMessage: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../api/client', () => ({ apiClient: { getRecord: vi.fn(), getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }) } }))

const aiContext: AiContext = {
  surface: 'event-editor',
  summary: 'Deck EG-1 — manual / manual_freeform',
  surfaceContext: { runId: 'RUN-DECK-1', eventGraphId: 'EG-1' },
  editorMode: 'deck',
}
const ADDITION: AiLabwareAddition = { recordId: 'REC-DECK-1', reason: 'destination plate', deckSlot: 'slot-1' }
type AddLabware = (record: Record<string, unknown>, addition?: AiLabwareAddition) => void

/** Drive a labware-ONLY done (no events) through the hook. */
async function drive(onAddLabwareFromRecord?: AddLabware) {
  // The record fetch rejects — the resolver falls back to the seed/local payload (the legacy apply's path).
  vi.mocked(apiClient.getRecord).mockRejectedValue(new Error('not backed by /api/records'))
  vi.mocked(streamAssist).mockImplementation(async function* () {
    yield { type: 'status', message: 'working' } as never
    yield { type: 'done', result: { success: true, notes: [], labwareAdditions: [ADDITION] } } as never
  })
  const { result } = renderHook(() =>
    useAiChat({ aiContext, onProposalDrafted: () => undefined, ...(onAddLabwareFromRecord ? { onAddLabwareFromRecord } : {}) }),
  )
  await act(async () => { result.current.sendPrompt('put a plate on the deck') })
  await waitFor(() => expect(result.current.isStreaming).toBe(false))
  return result
}
const transcript = (r: Awaited<ReturnType<typeof drive>>) => [...r.current.messages.filter((m) => m.role === 'system').map((m) => m.content), r.current.honestWall ?? ''].join('\n')
beforeEach(() => { vi.clearAllMocks() })

describe('useAiChat — u1deckmount: a labware-only done MOUNTS on the deck, not the wall', () => {
  it('handler wired: one call per addition; transcript says placed; NO "cannot mount" string', async () => {
    const onAddLabwareFromRecord = vi.fn()
    const hook = await drive(onAddLabwareFromRecord)
    await waitFor(() => expect(onAddLabwareFromRecord).toHaveBeenCalledTimes(1))
    const [payload, addition] = onAddLabwareFromRecord.mock.calls[0] as [Record<string, unknown>, AiLabwareAddition]
    expect(addition).toEqual(ADDITION)
    expect(payload).toMatchObject({ kind: 'labware', recordId: 'REC-DECK-1' })
    expect(transcript(hook)).toContain('Placed 1 new labware on the deck.')
    expect(transcript(hook)).not.toContain('cannot mount')
  })
  it('NO handler wired: byte-identical to base — the named wall keeps "cannot mount without events"', async () => {
    const hook = await drive(undefined)
    await waitFor(() => expect(hook.current.honestWall).toBeTruthy())
    expect(hook.current.honestWall).toContain('proposed 1 new labware, which this surface cannot mount without events')
    expect(transcript(hook)).not.toContain('Placed')
  })
  it('payload resolution THROWS: that addition keeps the named wall (names truth, never a lie)', async () => {
    // The spy throws only on the resolver's call (the 2nd def-payload read);
    // the 1st is getLinearWellTemplate's read inside normalizePreviewEvents
    // (before the wall leg — a pre-existing path this unit must not crash).
    let calls = 0
    const spy = vi
      .spyOn(await import('../../types/labware'), 'labwareDefinitionRecordToPayload')
      .mockImplementation(() => { if (calls++ >= 1) throw new Error('resolution failed'); return null })
    const onAddLabwareFromRecord = vi.fn()
    const hook = await drive(onAddLabwareFromRecord)
    spy.mockRestore()
    expect(onAddLabwareFromRecord).not.toHaveBeenCalled()
    await waitFor(() => expect(hook.current.honestWall).toBeTruthy())
    expect(hook.current.honestWall).toContain('proposed 1 new labware, which this surface cannot mount without events')
  })
})
