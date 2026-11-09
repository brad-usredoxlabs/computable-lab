/**
 * L2-SUITE-A-uifix2 FIX2 [D5] RED — the DMSO clarification card renders a
 * VISIBLE create-local (mint) row.
 *
 * Gate re-gate-3 defect 5 (MAJOR), p6_state (real captured card shape):
 *   { text: 'The draft names "DMSO" and the lab spine could not bind it
 *     (ambiguous-noun). Choose what it is, or create a local term.',
 *     rows: [] }
 * The server (shorthandChat.clarificationsFromUnresolvedFacts) sent
 * options: [] (the spine had no candidates for "DMSO") with menuProvider
 * '/m' and allowCreateLocal: true. The card PROMISES "or create a local
 * term" but the only mint affordance was the resolver's `mint:<q>` floor
 * row INSIDE the popover — invisible on the closed card (the picker is
 * open-on-request, uifix2 [C]: a closed card renders only the bare search
 * input). DEAD CHROME: an unanswerable card.
 *
 * THE FIX (client, declared affordance — spine tier-5 mint-local,
 * architecture §2): when request.allowCreateLocal is true, the material
 * concept layer can mint (canMint), and the question carries a name (the
 * seeded query — the same precondition as the resolver floor's `if (q)`
 * gate), the card renders a VISIBLE create-local row (open or closed).
 * Clicking it mints the seeded term through the SAME
 * apiClient.mintLocalTerm('material', q, q) path the resolver's mint floor
 * uses, and routes the answer through onPick (ref
 * {kind:'record', type:'material'}).
 *
 * RED (before the fix): queryByTestId('clarification-mint-row') is null on
 * the exact gate shape.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClarificationPicker } from './ClarificationPicker'
import type { AiClarificationRequest } from '../../../types/ai'

// Stub the slash-menu resolvers (+ the shared mint-row label helper) so the
// search menu is deterministic and the row's copy is the product's own.
const resolveMaterial = vi.fn()
const resolveLabware = vi.fn()
const resolveEquipment = vi.fn()
vi.mock('../../../shared/taptab/slashMenu/resolvers', () => ({
  resolveMaterial: (q: string, ctx: unknown) => resolveMaterial(q, ctx),
  resolveLabware: (q: string, ctx: unknown) => resolveLabware(q, ctx),
  resolveEquipment: (q: string, ctx: unknown) => resolveEquipment(q, ctx),
  // L2-CLARIFY-CARD-1 (P5): the stub now spells the PRODUCT's one-source
  // sentence (the row previews it; the popover floor says the same). Behaviour
  // pins below are untouched — copy only.
  mintLocalTermLabel: (q: string) => `Create material record "${q}" in the lab (new record)`,
}))

// The API client: the mint floor's path. Settled mock so the async chain
// resolves inside the test (test hygiene, no unhandled rejection).
const mintLocalTerm = vi.fn()
vi.mock('../../../shared/api/client', () => ({
  apiClient: { mintLocalTerm: (a: string, b: string, c?: string) => mintLocalTerm(a, b, c) },
}))

// Ontology grounding (the real one hits the API) — a minted id is a local
// record, so the ground path is never taken; the mock keeps the import graph
// honest.
const groundMaterialRef = vi.fn().mockResolvedValue({ kind: 'ontology' })
vi.mock('../../lib/groundMaterialRef', () => ({
  groundMaterialRef: (ref: unknown) => groundMaterialRef(ref),
}))

/** The gate's P6 DMSO card, exactly as the server sent it (p6_state):
 *  no candidate rows, mintable, the seeded query IS the term. */
const dmsRequest: AiClarificationRequest = {
  id: 'clr-dms-1',
  kind: 'material',
  prompt: 'The draft names "DMSO" and the lab spine could not bind it (ambiguous-noun). Choose what it is, or create a local term.',
  menuProvider: '/m',
  query: 'DMSO',
  options: [],
  allowCreateLocal: true,
}

afterEach(() => {
  cleanup()
  resolveMaterial.mockReset()
  resolveLabware.mockReset()
  resolveEquipment.mockReset()
  mintLocalTerm.mockReset()
  groundMaterialRef.mockReset()
})

describe('ClarificationPicker — L2-SUITE-A-uifix2 FIX2 [D5]: the visible create-local (mint) row', () => {
  it('renders the create-local row VISIBLY on the gate DMSO shape (allowCreateLocal, zero rows, seeded query) — open-or-closed, no popover needed', () => {
    // No resolver hits (the spine had no candidates) — and the picker is
    // CLOSED (open-on-request): the row must still be on the card.
    resolveMaterial.mockResolvedValue([])
    render(<ClarificationPicker request={dmsRequest} onPick={vi.fn()} />)

    const row = screen.getByTestId('clarification-mint-row')
    expect(row).toBeTruthy()
    // L2-CLARIFY-CARD-1 (P5): the row PREVIEWs the exact one-source label
    // sentence (the seeded noun — the copy now states the write).
    expect(screen.getByText('Create material record "DMSO" in the lab (new record)')).toBeTruthy()
    // The preview label is editable in the row's OWN label input (the only
    // edit surface) — seeded from the prompt's noun.
    expect((screen.getByTestId('clarification-mint-label') as HTMLInputElement).value).toBe('DMSO')
    // The popover is NOT open (closed card) — the affordance is on the card.
    expect(screen.queryByTestId('clarification-popover')).toBeNull()
  })

  it('clicking the create button mints the PREVIEWED label via apiClient.mintLocalTerm and routes the answer through onPick (ref {kind:"record", type:"material"})', async () => {
    resolveMaterial.mockResolvedValue([])
    mintLocalTerm.mockResolvedValue({ success: true, recordId: 'MAT-dms-001', label: 'DMSO', iri: 'urn:cl:local:MAT-dms-001' })
    const onPick = vi.fn()
    render(<ClarificationPicker request={dmsRequest} onPick={onPick} />)

    // L2-CLARIFY-CARD-1 (W7): the row is now a container; the Create button
    // mints EXACTLY the previewed label (the row's own label state — the
    // seeded noun). The filter box no longer feeds the mint.
    fireEvent.click(screen.getByTestId('clarification-mint-create'))
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1))

    expect(mintLocalTerm).toHaveBeenCalledTimes(1)
    expect(mintLocalTerm.mock.calls[0]?.[0]).toBe('material')
    expect(mintLocalTerm.mock.calls[0]?.[1]).toBe('DMSO')
    // W7 single-string: the label is the previewed noun — never the filter,
    // never a seed+filter concatenation.
    expect(mintLocalTerm.mock.calls[0]?.[2]).toBeUndefined()
    // Same path as the resolver's mint floor: the answer is the MINTED
    // record's mention.
    expect(onPick.mock.calls[0]?.[0]).toEqual({
      requestId: 'clr-dms-1',
      label: 'DMSO',
      mentionToken: '[[material:MAT-dms-001|DMSO]]',
      ref: { kind: 'record', id: 'MAT-dms-001', type: 'material', label: 'DMSO' },
    })
    // A minted local record is not an ontology CURIE — no grounding call.
    expect(groundMaterialRef).not.toHaveBeenCalled()
  })

  it('hides the row when the server did NOT allow local creation (allowCreateLocal absent — the answer must come from existing records)', () => {
    resolveMaterial.mockResolvedValue([])
    render(
      <ClarificationPicker
        request={{ ...dmsRequest, id: 'clr-dms-2', allowCreateLocal: false }}
        onPick={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('clarification-mint-row')).toBeNull()
  })

  it('hides the row when the question carries no name to mint (empty seeded query — the resolver floor has the same `if (q)` gate)', () => {
    resolveMaterial.mockResolvedValue([])
    render(
      <ClarificationPicker
        request={{ ...dmsRequest, id: 'clr-dms-3', query: '' }}
        onPick={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('clarification-mint-row')).toBeNull()
  })

  it('hides the row on a layer-scoped /m question (aliquot — minting a concept is never the answer to "which aliquot?")', () => {
    resolveMaterial.mockResolvedValue([])
    render(
      <ClarificationPicker
        request={{ ...dmsRequest, id: 'clr-dms-4', materialLayer: 'aliquot' }}
        onPick={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('clarification-mint-row')).toBeNull()
  })

  it('hides the row on a /l labware question (the mint floor is a MATERIAL affordance — no local labware mint exists)', () => {
    resolveLabware.mockResolvedValue([])
    render(
      <ClarificationPicker
        request={{ ...dmsRequest, id: 'clr-dms-5', kind: 'labware', menuProvider: '/l' }}
        onPick={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('clarification-mint-row')).toBeNull()
  })

  it("hides the row while the popover is OPEN (the open popover carries the resolver's own mint floor row — one mint affordance per open state, no duplicate)", async () => {
    // The resolver returns zero candidates (the gate shape); the OPEN
    // popover is where the resolver's floor row lives.
    resolveMaterial.mockResolvedValue([])
    const { container } = render(<ClarificationPicker request={dmsRequest} onPick={vi.fn()} />)
    // Open the picker the way a scientist does (click the search field).
    const input = container.querySelector('input.message-log__clarification-search') as HTMLInputElement
    expect(input).toBeTruthy()
    fireEvent.click(input)
    await waitFor(() => expect(resolveMaterial).toHaveBeenCalled())
    expect(screen.getByTestId('clarification-popover')).toBeTruthy()
    // The card row is suppressed while the popover is open — the affordance
    // is the floor row inside it (one per open state).
    expect(screen.queryByTestId('clarification-mint-row')).toBeNull()
    // …and it comes back when the popover closes (a new question's closed
    // card is exactly the dead-chrome shape this fix removes).
    fireEvent.keyDown(input, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('clarification-popover')).toBeNull())
    expect(screen.getByTestId('clarification-mint-row')).toBeTruthy()
  })
})
