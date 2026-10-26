/**
 * L2-CHAT-1 gatefix1 D1 (client leg) — the deck surface's AI context must
 * carry the SAME core fields the other chat surfaces send.
 *
 * The tier-2 gate found every /deck chat turn crashing server-side:
 * DeckSurfaceChat's surfaceContext omitted `labwares`, `eventSummary`, and
 * `availableVerbs`, so the prompt builder died on the first read. This test
 * pins the shape parity with graph/hooks/useLabwareAiContext (via
 * acceptedEventGraphProjection): the three fields present, shaped like the
 * projection (labware id/type/name + grid dims; getEventSummary join; verb
 * names from the active vocab pack), alongside the fields the deck already
 * sent.
 */
import { describe, expect, it, vi, type Mock } from 'vitest'
import { render } from '@testing-library/react'
import { DeckSurfaceChat } from './DeckSurfaceChat'

vi.mock('../EventEditorContext', () => ({ useEventEditor: vi.fn() }))
vi.mock('../../agent/useSurfaceChat', () => ({ useSurfaceChat: vi.fn() }))
vi.mock('../../agent/ChatFocusContext', () => ({ useSetChatFocus: () => vi.fn() }))
vi.mock('./useDeckGhostMount', () => ({
  useDeckGhostMount: () => ({ onProposalDrafted: vi.fn(), onPreviewDiscarded: vi.fn() }),
}))
vi.mock('./deckAdoption', () => ({ adoptStagedPreview: vi.fn() }))

import { useEventEditor } from '../EventEditorContext'
import { useSurfaceChat } from '../../agent/useSurfaceChat'
import type { PlateEvent } from '../../types/events'
import type { Labware } from '../../types/labware'

const useEventEditorMock = useEventEditor as unknown as Mock
const useSurfaceChatMock = useSurfaceChat as unknown as Mock

function labwareFixture(id: string): Labware {
  return {
    labwareId: id,
    labwareType: 'plate_96',
    name: `Plate ${id}`,
    addressing: { type: 'grid', rows: 8, columns: 12 },
    geometry: {} as Labware['geometry'],
  }
}

function makeState(overrides: Record<string, unknown> = {}) {
  return {
    eventGraphId: 'EVG-a5-fixture-method',
    runId: 'RUN-2026-09-19-run-vwr8',
    platformId: 'biomix-2',
    variantId: 'biomix-2/1',
    vocabPackId: 'liquid-handling/v1',
    placements: [],
    events: [] as PlateEvent[],
    selection: null,
    labwares: {} as Record<string, Labware>,
    commitPreview: vi.fn(),
    appendEvent: vi.fn(),
    clearPreview: vi.fn(),
    ...overrides,
  }
}

function capturedAiContext(): { surfaceContext: Record<string, unknown> } {
  const calls = useSurfaceChatMock.mock.calls
  const options = calls[calls.length - 1]?.[0] as {
    aiContext: { surfaceContext: Record<string, unknown> }
  }
  return { surfaceContext: options.aiContext.surfaceContext }
}

describe('DeckSurfaceChat AI context — parity core fields (D1)', () => {
  it('sends labwares / eventSummary / availableVerbs alongside the deck fields', () => {
    const state = makeState()
    useEventEditorMock.mockReturnValue({ state, actions: state })
    useSurfaceChatMock.mockReturnValue({ chat: {}, flow: {} })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<DeckSurfaceChat />)

    const ctx = capturedAiContext().surfaceContext
    expect(ctx.eventGraphId).toBe('EVG-a5-fixture-method')
    expect(ctx.vocabPackId).toBe('liquid-handling/v1')
    // The three previously-omitted fields are now present and non-undefined.
    expect(ctx.labwares).toEqual([])
    expect(ctx.eventSummary).toBe('No events yet.')
    expect(Array.isArray(ctx.availableVerbs)).toBe(true)
    expect((ctx.availableVerbs as string[]).length).toBeGreaterThan(0)
  })

  it('shapes the fields like the labware-editor parity source', () => {
    const events: PlateEvent[] = [
      {
        eventId: 'ev-1',
        event_type: 'transfer',
        details: {
          volume: { value: 10, unit: 'uL' },
          source_wells: ['A1'],
          dest_wells: ['B2'],
        } as unknown as PlateEvent['details'],
      },
    ]
    const state = makeState({
      labwares: { plate1: labwareFixture('plate1') },
      events,
      selection: { labwareId: 'plate1', wells: ['A1'], anchor: null },
    })
    useEventEditorMock.mockReturnValue({ state, actions: state })
    useSurfaceChatMock.mockReturnValue({ chat: {}, flow: {} })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<DeckSurfaceChat />)

    const ctx = capturedAiContext().surfaceContext
    // summarizeLabwares parity: id/type/name + grid rows/columns.
    expect(ctx.labwares).toEqual([
      {
        labwareId: 'plate1',
        labwareType: 'plate_96',
        name: 'Plate plate1',
        rows: 8,
        columns: 12,
      },
    ])
    // getEventSummary join parity (transfer → "Transfer 10 uL (A1, B2)").
    expect(ctx.eventSummary).toBe('Transfer 10 uL (A1, B2)')
    // availableVerbs: verb names from the active pack (liquid-handling/v1).
    expect(ctx.availableVerbs).toContain('transfer')
    // The pre-existing deck fields are untouched.
    expect(ctx.selection).toEqual({ labwareId: 'plate1', wells: ['A1'] })
    expect(ctx.eventCount).toBe(1)
  })
})
