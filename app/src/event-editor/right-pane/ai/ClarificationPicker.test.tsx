import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ClarificationPicker, answerFromMention } from './ClarificationPicker'
import type { AiClarificationRequest } from '../../../types/ai'
import type { SlashSuggestion } from '../../../shared/taptab/slashMenu/types'

// Stub the slash-menu resolvers so we control the suggestions deterministically.
const resolveMaterial = vi.fn()
const resolveLabware = vi.fn()
const resolveEquipment = vi.fn()
vi.mock('../../../shared/taptab/slashMenu/resolvers', () => ({
  resolveMaterial: (q: string, ctx: unknown) => resolveMaterial(q, ctx),
  resolveLabware: (q: string, ctx: unknown) => resolveLabware(q, ctx),
  resolveEquipment: (q: string, ctx: unknown) => resolveEquipment(q, ctx),
}))

// Ground ontology picks to a local record (the real one hits the API).
const groundMaterialRef = vi.fn()
vi.mock('../../lib/groundMaterialRef', () => ({
  groundMaterialRef: (ref: unknown) => groundMaterialRef(ref),
}))

const materialRequest: AiClarificationRequest = {
  id: 'clar-1',
  kind: 'material',
  prompt: 'Which material for A3?',
  menuProvider: '/m',
  query: 'CHO',
  options: [],
}

afterEach(() => {
  cleanup()
  resolveMaterial.mockReset()
  resolveLabware.mockReset()
  resolveEquipment.mockReset()
  groundMaterialRef.mockReset()
})

describe('answerFromMention', () => {
  it('maps a workspace material record to a record ref + token', () => {
    const answer = answerFromMention(materialRequest, {
      type: 'material', entityKind: 'material-spec', id: 'MAT-cho-1', label: 'CHO cells',
    })
    expect(answer).toEqual({
      requestId: 'clar-1',
      label: 'CHO cells',
      mentionToken: '[[material-spec:MAT-cho-1|CHO cells]]',
      ref: { kind: 'record', id: 'MAT-cho-1', type: 'material-spec', label: 'CHO cells' },
    })
  })

  it('maps an ontology CURIE hit to an ontology ref', () => {
    const answer = answerFromMention(materialRequest, {
      type: 'material', entityKind: 'material', id: 'CVCL:0213', label: 'CHO-K1',
    })
    expect(answer?.ref).toEqual({ kind: 'ontology', id: 'CVCL:0213', label: 'CHO-K1' })
    expect(answer?.mentionToken).toBe('[[material:CVCL:0213|CHO-K1]]')
  })

  it('maps a labware mention', () => {
    const answer = answerFromMention(
      { ...materialRequest, kind: 'labware', menuProvider: '/l' },
      { type: 'labware', id: 'lbw-1', label: 'Plate 1' },
    )
    expect(answer).toEqual({
      requestId: 'clar-1',
      label: 'Plate 1',
      mentionToken: '[[labware:lbw-1|Plate 1]]',
      ref: { kind: 'labware', id: 'lbw-1', label: 'Plate 1' },
    })
  })
})

describe('ClarificationPicker', () => {
  const hit: SlashSuggestion = {
    key: 'material-spec:MAT-cho-1',
    label: 'CHO cells',
    badge: 'Concept',
    mention: { type: 'material', entityKind: 'material-spec', id: 'MAT-cho-1', label: 'CHO cells' },
  }

  it('runs the material resolver seeded with the request query and routes a pick to onPick', async () => {
    resolveMaterial.mockResolvedValue([hit])
    const onPick = vi.fn()
    render(<ClarificationPicker request={materialRequest} onPick={onPick} />)

    // seeded query
    expect((screen.getByPlaceholderText(/Search materials/i) as HTMLInputElement).value).toBe('CHO')
    await waitFor(() => expect(resolveMaterial).toHaveBeenCalled())
    expect(resolveMaterial.mock.calls[0][0]).toBe('CHO')

    const row = await screen.findByText('CHO cells')
    fireEvent.mouseDown(row)
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1))
    expect(onPick.mock.calls[0][0]).toMatchObject({
      requestId: 'clar-1',
      mentionToken: '[[material-spec:MAT-cho-1|CHO cells]]',
    })
    expect(groundMaterialRef).not.toHaveBeenCalled() // local record needs no grounding
  })

  it('grounds an ontology-term pick to a local record before answering (fixes the re-clarify loop)', async () => {
    const ontologyHit: SlashSuggestion = {
      key: 'ontology:XCO:0000988',
      label: "Dulbecco's Modified Eagle's Medium",
      badge: 'XCO',
      mention: { type: 'material', entityKind: 'material', id: 'XCO:0000988', label: "Dulbecco's Modified Eagle's Medium" },
    }
    resolveMaterial.mockResolvedValue([ontologyHit])
    groundMaterialRef.mockResolvedValue({ kind: 'record', id: 'MAT-dmem', type: 'material', label: 'DMEM (local)' })
    const onPick = vi.fn()
    render(<ClarificationPicker request={materialRequest} onPick={onPick} />)

    const row = await screen.findByText("Dulbecco's Modified Eagle's Medium")
    fireEvent.mouseDown(row)
    await waitFor(() => expect(onPick).toHaveBeenCalled())
    expect(groundMaterialRef).toHaveBeenCalledWith({ kind: 'ontology', id: 'XCO:0000988', namespace: 'XCO', label: "Dulbecco's Modified Eagle's Medium" })
    expect(onPick.mock.calls[0][0]).toEqual({
      requestId: 'clar-1',
      label: 'DMEM (local)',
      mentionToken: '[[material:MAT-dmem|DMEM (local)]]',
      ref: { kind: 'record', id: 'MAT-dmem', type: 'material', label: 'DMEM (local)' },
    })
  })

  it('awaits the mint affordance (resolveMention) before answering', async () => {
    const mintHit: SlashSuggestion = {
      key: 'mint:CHO',
      label: 'Create local term "CHO"',
      badge: 'New',
      pinBottom: true,
      mention: { type: 'material', entityKind: 'material', id: '', label: 'CHO' },
      resolveMention: vi.fn().mockResolvedValue({
        type: 'material', entityKind: 'material', id: 'MAT-minted', label: 'CHO',
      }),
    }
    resolveMaterial.mockResolvedValue([mintHit])
    const onPick = vi.fn()
    render(<ClarificationPicker request={materialRequest} onPick={onPick} />)

    const row = await screen.findByText('Create local term "CHO"')
    fireEvent.mouseDown(row)
    await waitFor(() => expect(onPick).toHaveBeenCalled())
    expect(onPick.mock.calls[0][0].ref).toEqual({ kind: 'record', id: 'MAT-minted', type: 'material', label: 'CHO' })
  })

  it('maps an equipment mention', () => {
    const answer = answerFromMention(
      { ...materialRequest, kind: 'equipment', menuProvider: '/e' },
      { type: 'equipment', id: 'EQP-reader-1', label: 'Plate reader' },
    )
    expect(answer).toEqual({
      requestId: 'clar-1',
      label: 'Plate reader',
      mentionToken: '[[equipment:EQP-reader-1|Plate reader]]',
      ref: { kind: 'record', id: 'EQP-reader-1', type: 'equipment', label: 'Plate reader' },
    })
  })

  it('uses the labware resolver for /l clarifications', async () => {
    resolveLabware.mockResolvedValue([])
    render(
      <ClarificationPicker
        request={{ ...materialRequest, kind: 'labware', menuProvider: '/l', query: '' }}
        onPick={vi.fn()}
      />,
    )
    expect(screen.getByPlaceholderText(/Search labware/i)).toBeTruthy()
    await waitFor(() => expect(resolveLabware).toHaveBeenCalled())
    expect(resolveMaterial).not.toHaveBeenCalled()
  })


  it('uses the equipment resolver for /e clarifications', async () => {
    resolveEquipment.mockResolvedValue([])
    render(
      <ClarificationPicker
        request={{ ...materialRequest, kind: 'equipment', menuProvider: '/e', query: 'reader' }}
        onPick={vi.fn()}
      />,
    )
    expect(screen.getByPlaceholderText(/Search equipment/i)).toBeTruthy()
    await waitFor(() => expect(resolveEquipment).toHaveBeenCalled())
    expect(resolveMaterial).not.toHaveBeenCalled()
    expect(resolveLabware).not.toHaveBeenCalled()
  })
})
