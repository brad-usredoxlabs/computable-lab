import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAiChat, type AiProposalDraft } from './useAiChat'
import { streamAssist } from '../api/aiClient'
import { apiClient } from '../api/client'
import { buildPreviewFromDraft } from '../../event-editor/right-pane/ai/draftPreview'

vi.mock('../api/aiClient', () => ({ streamAssist: vi.fn(), getAiHealth: vi.fn().mockResolvedValue({ available: true }) }))
vi.mock('../api/aiThreadClient', () => ({ getThread: vi.fn().mockRejectedValue(new Error('no thread')), appendThreadMessage: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../api/client', () => ({ apiClient: { getRecord: vi.fn(), getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }) } }))

const definition = {
  kind: 'labware-definition', recordId: 'lbw-def-generic-96-well-plate',
  id: 'generic/96_well_plate@v1', display_name: 'Generic 96-Well Plate',
  topology: { addressing: 'grid', rows: 8, columns: 12, well_pitch_mm: 9 },
  capacity: { max_well_volume_uL: 350, min_working_volume_uL: 10 },
  render_hints: { profile: 'plate' }, legacy_labware_types: ['plate_96'],
}

describe('chat result to run deck preview', () => {
  it('preserves the selected definition and geometry in the ghost that Apply saves', async () => {
    vi.mocked(apiClient.getRecord).mockResolvedValue({ recordId: definition.recordId, payload: definition } as never)
    vi.mocked(streamAssist).mockImplementation(async function* () {
      yield { type: 'done', result: { success: true,
        events: [{ eventId: 'place-1', event_type: 'create_container', details: { labwareType: '96-well-plate' } }],
        resolvedLabwares: [{ recordId: definition.recordId, title: definition.display_name }],
      } } as never
    })
    const onProposalDrafted = vi.fn((draft: AiProposalDraft) => buildPreviewFromDraft({
      ...draft, labwareRequirements: [], existingLabwares: {},
      platform: { id: 'manual', label: 'Manual', allowedVocabIds: ['liquid-handling/v1'], defaultVariant: 'manual', toolTypeIds: [], modules: [], variants: [] },
      variant: { id: 'manual', title: 'Manual', slots: [], surface: { kind: 'lawn', widthMm: 400, heightMm: 300 } },
    } as Parameters<typeof buildPreviewFromDraft>[0]))
    const { result } = renderHook(() => useAiChat({
      aiContext: { surface: 'event-editor', summary: 'Run deck', surfaceContext: { runId: 'RUN-generic-test' }, editorMode: 'deck' },
      onProposalDrafted,
    }))
    await act(async () => { await result.current.sendPrompt('Place a 96-well plate on the deck.') })
    expect(onProposalDrafted).toHaveBeenCalledTimes(1)
    const preview = onProposalDrafted.mock.results[0]!.value.preview
    // u2 (L2-P1-PLACE-AND-MINT-1): the resolved DEFINITION offer places under
    // its own placement identity — the definition record id names the
    // geometry (sourceRecordId), never the placement's key.
    const placement = preview.previewPlacements[0]!
    expect(placement.labwareId).not.toBe(definition.recordId)
    const labware = preview.previewLabwares[placement.labwareId]
    expect(labware?.definitionId).toBe(definition.id)
    expect(labware?.sourceRecordId).toBe(definition.recordId)
    expect(labware?.geometry.maxVolume_uL).toBe(350)
    expect(labware?.addressing.rows).toBe(8)
    expect(labware?.addressing.columns).toBe(12)
  })
})
