import { describe, expect, it } from 'vitest'
import { buildFixSeed } from './buildFixSeed'
import type { EventEditorState } from '../EventEditorContext'

function baseState(overrides: Partial<EventEditorState> = {}): EventEditorState {
  return {
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
      } as never,
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
    fixIt: { isOpen: false, seed: null, chat: [], streaming: false },
    ...overrides,
  } as EventEditorState
}

describe('buildFixSeed', () => {
  it('captures prompt, skips, and deck context', () => {
    const seed = buildFixSeed({
      prompt: 'put a 12-well reservoir on B1',
      previewSkips: ['lbw-foo: slot reserved'],
      state: baseState(),
    })
    expect(seed.prompt).toBe('put a 12-well reservoir on B1')
    expect(seed.draft.skips).toEqual(['lbw-foo: slot reserved'])
    expect(seed.deckContext.platformLabel).toBe('Opentrons Flex')
    expect(seed.deckContext.variantTitle).toBe('Flex 96-channel')
    expect(seed.fixItSessionId).toMatch(/^fix-/)
  })

  it('snapshots the current preview as the draft', () => {
    const state = baseState({
      preview: {
        previewLabwares: {
          'lbw-1': {
            labwareId: 'lbw-1',
            name: 'Reservoir 12',
            labwareType: 'reservoir',
            addressing: { type: 'linear' },
          } as never,
        },
        previewPlacements: [
          {
            placementId: 'pl-preview-1',
            labwareId: 'lbw-1',
            location: { kind: 'slot', slotId: 'B1' },
            orientation: 'landscape',
          },
        ],
        previewEvents: [],
      },
    })
    const seed = buildFixSeed({
      prompt: 'put a 12-well reservoir on B1',
      previewSkips: [],
      state,
    })
    expect(seed.draft.placements).toHaveLength(1)
    expect(seed.draft.placements[0]!.placementId).toBe('pl-preview-1')
    expect(Object.keys(seed.draft.labwares)).toEqual(['lbw-1'])
  })

  it('produces a unique fixItSessionId per call', () => {
    const a = buildFixSeed({ prompt: 'x', previewSkips: [], state: baseState() })
    const b = buildFixSeed({ prompt: 'x', previewSkips: [], state: baseState() })
    expect(a.fixItSessionId).not.toBe(b.fixItSessionId)
  })
})
