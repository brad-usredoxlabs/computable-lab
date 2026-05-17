import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiStreamEvent } from '../../types/ai'
import { EventEditorAiDock } from './EventEditorAiDock'

const mocks = vi.hoisted(() => ({
  setPreview: vi.fn(),
  clearPreview: vi.fn(),
  commitPreview: vi.fn(),
  placeNewLabware: vi.fn(),
  appendEvent: vi.fn(),
  streamDraftEvents: vi.fn(),
}))

vi.mock('../EventEditorContext', () => ({
  useEventEditor: () => ({
    state: {
      loadState: 'ready',
      loadError: null,
      platforms: [
        {
          id: 'opentrons_flex',
          label: 'Opentrons Flex',
          allowedVocabIds: ['liquid-handling/v1'],
          defaultVariant: 'flex_96',
          toolTypeIds: [],
          variants: [
            {
              id: 'flex_96',
              title: 'Flex 96-channel',
              slots: [{ id: 'B2', kind: 'deck' }],
            },
          ],
        },
      ],
      platformId: 'opentrons_flex',
      variantId: 'flex_96',
      vocabPackId: 'liquid-handling/v1',
      toolTypeId: null,
      assistPipetteId: null,
      runId: null,
      labwares: {},
      placements: [],
      focusPlacementId: null,
      selection: null,
      events: [],
      tipState: { kind: 'empty' },
      preview: null,
      fixIt: {
        isOpen: false,
        seed: null,
        chat: [],
        streaming: false,
        stage: 'chatting',
        error: null,
        spec: null,
        applyStage: null,
        applyResult: null,
        fixHistory: [],
        pendingRetryPrompt: null,
      },
    },
    actions: {
      setPreview: mocks.setPreview,
      clearPreview: mocks.clearPreview,
      commitPreview: mocks.commitPreview,
      placeNewLabware: mocks.placeNewLabware,
      appendEvent: mocks.appendEvent,
      consumeRetryPrompt: vi.fn(),
      closeFixIt: vi.fn(),
    },
  }),
}))

vi.mock('../../shared/api/aiClient', () => ({
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
  streamDraftEvents: mocks.streamDraftEvents,
}))

async function* yieldEvents(events: AiStreamEvent[]): AsyncGenerator<AiStreamEvent> {
  for (const event of events) yield event
}

describe('EventEditorAiDock', () => {
  beforeEach(() => {
    mocks.setPreview.mockReset()
    mocks.clearPreview.mockReset()
    mocks.commitPreview.mockReset()
    mocks.placeNewLabware.mockReset()
    mocks.appendEvent.mockReset()
    mocks.streamDraftEvents.mockReset()
  })
  afterEach(() => {
    cleanup()
  })

  it('promotes a labware-only draft into the editor preview instead of committing', async () => {
    mocks.streamDraftEvents.mockReturnValue(yieldEvents([
      {
        type: 'done',
        result: {
          success: true,
          events: [],
          notes: [],
          labwareAdditions: [{ recordId: '96-well plate', deckSlot: 'B2' }],
        },
      },
    ]))

    render(<EventEditorAiDock />)

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Place a 96-well plate on deck slot B2.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(mocks.setPreview).toHaveBeenCalledTimes(1)
    })

    // The dock no longer commits directly — the floating preview bar does.
    expect(mocks.placeNewLabware).not.toHaveBeenCalled()
    expect(mocks.appendEvent).not.toHaveBeenCalled()

    const preview = mocks.setPreview.mock.calls[0][0]
    expect(preview.previewPlacements).toHaveLength(1)
    expect(preview.previewPlacements[0].location).toEqual({ kind: 'slot', slotId: 'B2' })
    expect(preview.previewEvents).toEqual([])
    const labwareId = preview.previewPlacements[0].labwareId
    expect(preview.previewLabwares[labwareId]).toMatchObject({
      labwareType: 'plate_96',
      sourceRecordId: '96-well plate',
    })

    // The Accept button has moved to the deck — the chat no longer renders
    // one inline. (The "Preview on deck →" pill only shows when state.preview
    // matches the message; that linkage is exercised by integration tests
    // where setPreview actually mutates state.)
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull()
  })

  it('clears any stale preview when the draft is empty', async () => {
    mocks.streamDraftEvents.mockReturnValue(yieldEvents([
      {
        type: 'done',
        result: {
          success: true,
          events: [],
          notes: [],
          labwareAdditions: [],
        },
      },
    ]))

    render(<EventEditorAiDock />)

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'just say hi' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(mocks.clearPreview).toHaveBeenCalled()
    })
    expect(mocks.setPreview).not.toHaveBeenCalled()
  })
})
