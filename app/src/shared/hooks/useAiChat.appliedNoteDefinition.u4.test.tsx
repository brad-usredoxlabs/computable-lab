/**
 * L2-P1-RETURN-LEG-1 u4 (LEG B): the applied note must NAME the definition
 * the placed labware used — the journey operation "After a cold reload (F5),
 * the applied note NAMES the definition the plate uses".
 *
 * The adoption arm (useAiChat.ts acceptPreview, `if (adoption?.adopted)`
 * branch) builds `adoptedSummary` and pushes it as a system message. The
 * staged labwares are IN HAND at that same call site via
 * `stagedExtras?.previewLabwares` — their `definitionId` names the definition
 * the entry commits. The name is resolved ONLY from the bound
 * definitionId -> labware-definition record store (the ghost's `name` is its
 * own title, never the definition's) — never a new store, never a static-map
 * lookup for a registry-bound id (the static LABWARE_DEFINITIONS map does
 * not carry generic/96_well_plate@v1 — one authority: the record store).
 *
 * The note must SURVIVE F5 (AC2): it is written into the thread messages via
 * the same sync the r16D1 reload test pins (useAiChat.reloadAppliedNote —
 * system role rides appendThreadMessage verbatim), so this test asserts the
 * live transcript record the sync persists.
 *
 * RED (pre-fix): the note is "Accepted 1 event plus 1 new labware plus 1
 * placement commit <sha>" — no definition name. GREEN (post-fix): the note
 * names "Generic 96-Well Plate" with the counts wording kept.
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
  getRecord: vi.fn(),
  listRecordsByKind: vi.fn(),
}))

vi.mock('../api/aiThreadClient', () => ({
  getThread: mocked.getThread,
  appendThreadMessage: mocked.appendThreadMessage,
}))
vi.mock('../api/aiClient', () => ({
  streamAssist: mocked.streamAssist,
  getAiHealth: mocked.getAiHealth,
}))
// The deck modal's record readback resolves the bound definition's display
// name from the record store — the hook's note names the SAME truth.
vi.mock('../api/client', () => ({
  apiClient: {
    getRecord: mocked.getRecord,
    getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }),
    listRecordsByKind: mocked.listRecordsByKind,
    // The seam contract the hook calls (client.ts getLabwareDefinitionDisplay):
    // id -> the labware-definition record's display_name, or the id itself
    // when it does not resolve (never a fabricated name).
    getLabwareDefinitionDisplay: vi.fn(async (definitionId: string) => {
      const { records } = await mocked.listRecordsByKind('labware-definition', 200)
      const found = records.find((r: { payload?: Record<string, unknown> }) => r.payload?.id === definitionId)
      const displayName = found ? found.payload.display_name : undefined
      return typeof displayName === 'string' && displayName.length > 0 ? displayName : definitionId
    }),
  },
}))

import { useAiChat } from './useAiChat'

const aiContext: AiContext = { surface: 'run-workspace', summary: 'test', surfaceContext: {} }

const COMMIT_SHA = 'b2c3d4e5f60718293a4b5c6d7e8f9012345678'
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

beforeEach(() => {
  mocked.getThread.mockReset()
  mocked.getThread.mockResolvedValue({ messages: [] })
  mocked.appendThreadMessage.mockReset()
  mocked.appendThreadMessage.mockResolvedValue(undefined)
  vi.mocked(streamAssist).mockReset()
  streamDoneWithPreview()
  mocked.getRecord.mockReset()
  mocked.getRecord.mockResolvedValue(null)
  mocked.listRecordsByKind.mockReset()
  // The record store IS the one authority for a registry-bound definition's
  // display name (the static LABWARE_DEFINITIONS map does not carry
  // generic/96_well_plate@v1) — the hook's note and the deck view resolve the
  // SAME record.
  mocked.listRecordsByKind.mockResolvedValue({
    records: [
      {
        recordId: 'lbw-def-generic-96-well-plate',
        schemaId: 'labware-definition',
        payload: { id: 'generic/96_well_plate@v1', display_name: 'Generic 96-Well Plate' },
      },
    ],
    total: 1,
  })
})

describe('useAiChat — the applied note names the definition the placed labware used (LEG B, u4)', () => {
  it('Apply names the bound definition from the staged previewLabwares (deduped, counts kept) in the note it writes to the thread', async () => {
    mocked.getThread.mockResolvedValue({ messages: [] })

    const { result } = renderHook(() =>
      useAiChat({
        aiContext,
        endpoint: 'event-editor',
        // The deck's staging seam: the staged ghost carries the bound
        // definitionId (the r17 receipt ghost shape — name is the ghost's own
        // title; the definition name lives ONLY in the record store).
        onStagedExtras: () => ({
          previewLabwares: {
            'lbw-placed-1': {
              labwareId: 'lbw-placed-1',
              labwareType: 'plate_96',
              name: 'plate4',
              definitionId: 'generic/96_well_plate@v1',
              definitionSource: 'registry',
            },
          },
        }),
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

    await act(async () => {
      await result.current.acceptPreview()
    })

    // The applied note (the system record the sync persists — it survives F5,
    // per the r16D1 reload leg) names what was placed AND the definition it
    // used. AC2: the counts wording is kept; the name comes from the bound
    // definitionId, never the ghost's own title.
    const note = await waitFor(
      () => {
        const m = result.current.messages.find(
          (msg) => msg.role === 'system' && typeof msg.content === 'string' && msg.content.startsWith('Accepted'),
        )
        expect(m).toBeDefined()
        return m!
      },
      { timeout: 4000 },
    )
    expect(note.content).toContain('Generic 96-Well Plate')
    // Counts wording kept (the r16D1 pinned shape survives as a prefix).
    expect(note.content).toContain('Accepted 1 event')
    expect(note.content).toContain('plus 1 new labware')
    expect(note.content).toContain('plus 1 placement')
    expect(note.content).toContain(`commit ${COMMIT_SHA}`)
    // The ghost's own title is NOT the definition name (no vacuous pin).
    expect(note.content).not.toContain('plate4')
  })

  it('dedups repeated definition names across staged labwares (two entries, one name, counts kept)', async () => {
    mocked.getThread.mockResolvedValue({ messages: [] })

    const { result } = renderHook(() =>
      useAiChat({
        aiContext,
        endpoint: 'event-editor',
        onStagedExtras: () => ({
          previewLabwares: {
            'lbw-placed-1': {
              labwareId: 'lbw-placed-1',
              labwareType: 'plate_96',
              name: 'plate1',
              definitionId: 'generic/96_well_plate@v1',
              definitionSource: 'registry',
            },
            'lbw-placed-2': {
              labwareId: 'lbw-placed-2',
              labwareType: 'plate_96',
              name: 'plate2',
              definitionId: 'generic/96_well_plate@v1',
              definitionSource: 'registry',
            },
          },
        }),
        onPreviewAccept: async () => ({
          adopted: true,
          eventCount: 2,
          labwareCount: 2,
          placementCount: 2,
          commitSha: COMMIT_SHA,
        }),
      }),
    )

    await act(async () => {
      result.current.sendPrompt('Place two 96-well plates on the deck.')
    })
    await waitFor(() => expect(result.current.hasPreview).toBe(true), { timeout: 4000 })

    await act(async () => {
      await result.current.acceptPreview()
    })

    const note = await waitFor(
      () => {
        const m = result.current.messages.find(
          (msg) => msg.role === 'system' && typeof msg.content === 'string' && msg.content.startsWith('Accepted'),
        )
        expect(m).toBeDefined()
        return m!
      },
      { timeout: 4000 },
    )
    // The definition name appears ONCE (de-duped)…
    expect(note.content.match(/Generic 96-Well Plate/g)).toHaveLength(1)
    // …while the labware count stays truthful (two placed).
    expect(note.content).toContain('plus 2 new labware')
  })
})
