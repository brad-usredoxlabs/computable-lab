/**
 * L2-CLARIFY-CARD-1 (defect 5, ruling l2t1951 Q1) — the COMPOSED END-TO-END
 * mint-title seed pin: server request shape -> `mintLabelFor` -> the exact
 * string posted to `apiClient.mintLocalTerm`.
 *
 * The four existing app mint pins (mintrow.uifix2.fix2, mint.test, etc.) each
 * hand-build their own `query` fixture with NO `unresolvedFact`, so they cannot
 * see a server-side change (the server sets `unresolvedFact` unconditionally on
 * the shorthand path, shorthandChat.ts:1013). This pin is the composed one: it
 * starts from the SERVER request shape (with `unresolvedFact`) and proves the
 * mint input seeds from the RAW provenance label, NOT the canonical `query`
 * (the D3 fold's display form — feeding the fold back as the durable title is
 * what ruling §2 rule 3 forbids).
 *
 * THE SHAPE (the unbound-entity D3 case the gate drew):
 *   - `query` = the canonical DISPLAY form. For an unbound entity the fold has
 *     no vocabulary title, so `query = identityKey` = the LOWERCASE fold key
 *     (shorthandChat.ts:928,1001).
 *   - `unresolvedFact.label` = the VERBATIM model-extracted label, HUMAN case
 *     (the raw provenance — scientist-phrasing-when-key-equal).
 *
 * Pre-fix, `mintLabelFor(request, seedNoun) = mintNounFromQuery(request.query)
 * || query.trim()` seeds the mint input from `query` (the lowercase fold) ->
 * the posted durable title is the lowercase fold (the D3 defect). Post-fix,
 * `mintLabelFor` reads `unresolvedFact?.label` FIRST -> the posted title is the
 * raw human-case label. This pin is RED against the pre-fix `query` seed.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClarificationPicker, mintLabelFor } from './ClarificationPicker'
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
  mintLocalTermLabel: (q: string) => `Create material record "${q}" in the lab (new record)`,
}))

// The API client: the mint path. Whatever the client POSTS here becomes the
// record's durable name (VocabHandlers.ts:57 name: label) — so this is the
// end-to-end durable-title assertion.
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

// THE server request shape for the unbound-entity D3 case: the canonical
// display `query` is the LOWERCASE FOLD KEY; the raw `unresolvedFact.label`
// is human case (the provenance the mint title must follow).
//
// CARD1-FIX4 D1 (advc c10): this fixture is now the EXACT shape the REAL
// `clarificationsFromUnresolvedFacts` (server/src/ai/shorthandChat.ts:873)
// emits for this fact — not a hand-built guess. The pre-fix FIX-3 fixture
// hand-built `query: '1 mM clofibrate in dmso'`, which is NOT what the server
// emits: the `query` is the canonical FOLD (`canonicalLabelKey(label)` =
// NFKC->trim->collapse->toLowerCase), and `'1 mM Clofibrate in DMSO'` folds to
// `'1 mm clofibrate in dmso'` (note the `1 mm`, not `1 mM`). The byte-accurate
// fold is the reviewer's D1 point: a hand-built guess that "looks" folded but
// doesn't match the real fold would hide a server-side fold change.
// `actionLocation` is carried verbatim (it is the fact's content key — the id
// is a sha1 over [actionIndex, action, argument, reason, canonicalLabelKey]).
// `id` is the REAL content hash (unresolved-c-<sha1-10hex>); it is stable for
// this exact fact and is re-verified against the live builder by
// ClarificationPicker.realshape.card1.test.ts (the D1 real-shape pin).
const clofibrateRequest: AiClarificationRequest = {
  id: 'unresolved-c-541c08ee67',
  kind: 'material',
  prompt: 'The draft names "1 mm clofibrate in dmso" and the lab spine could not bind it (unbound). Choose what it is, or create a local term.',
  entityType: 'material',
  menuProvider: '/m',
  // The canonical FOLD (the display form) — the real builder emits the
  // canonicalLabelKey of the raw label, which for '1 mM Clofibrate in DMSO'
  // is '1 mm clofibrate in dmso'. A bare noun, so mintNounFromQuery returns it
  // verbatim (the pre-fix seed).
  query: '1 mm clofibrate in dmso',
  options: [],
  allowCreateLocal: true,
  // The verbatim ScientistIntentUnresolvedFact (shorthandChat.ts:1013 sets it
  // unconditionally) — the RAW provenance label in HUMAN case + the fact's
  // content-key actionLocation.
  unresolvedFact: {
    label: '1 mM Clofibrate in DMSO',
    reason: 'unbound',
    actionLocation: { action: 'add_material', argument: 'material' },
  },
}

afterEach(() => {
  cleanup()
  resolveMaterial.mockReset()
  resolveLabware.mockReset()
  resolveEquipment.mockReset()
  mintLocalTerm.mockReset()
  groundMaterialRef.mockReset()
})

describe('ClarificationPicker — L2-CLARIFY-CARD-1 defect 5: the COMPOSED mint-title seed', () => {
  it('mintLabelFor seeds from the RAW unresolvedFact.label (human case), not the canonical lowercase query', () => {
    // seedNoun is what the component passes (mintNounFromQuery(request.query))
    // — for a bare-noun query it is the query itself. The REAL builder folds
    // the raw label to '1 mm clofibrate in dmso' (canonicalLabelKey), so THAT
    // is the seed the component computes from the real payload.
    const seedNoun = '1 mm clofibrate in dmso'
    // Post-fix: the raw provenance label wins (human case). Pre-fix this
    // returned the lowercase query — the D3 fold fed back as the durable title.
    expect(mintLabelFor(clofibrateRequest, seedNoun)).toBe('1 mM Clofibrate in DMSO')
  })

  it('the mint input renders the RAW label (human case), never the lowercase query', () => {
    resolveMaterial.mockResolvedValue([])
    render(<ClarificationPicker request={clofibrateRequest} onPick={vi.fn()} />)
    const label = screen.getByTestId('clarification-mint-label') as HTMLInputElement
    // The preview sentence is built from the SAME seed (the row previews the
    // exact label it mints) — it carries the human-case raw label.
    expect(label.value).toBe('1 mM Clofibrate in DMSO')
    expect(screen.getByText('Create material record "1 mM Clofibrate in DMSO" in the lab (new record)')).toBeTruthy()
  })

  it('clicking Create POSTS the raw label to mintLocalTerm — the exact durable title (server shape -> mintLabelFor -> mintLocalTerm)', async () => {
    resolveMaterial.mockResolvedValue([])
    mintLocalTerm.mockResolvedValue({ success: true, recordId: 'MAT-clofib-001', label: '1 mM Clofibrate in DMSO', iri: 'urn:cl:local:MAT-clofib-001' })
    render(<ClarificationPicker request={clofibrateRequest} onPick={vi.fn()} />)

    fireEvent.click(screen.getByTestId('clarification-mint-create'))
    await waitFor(() => expect(mintLocalTerm).toHaveBeenCalledTimes(1))

    // THE end-to-end durable title: the exact string posted is the RAW human-
    // case label, NOT the lowercase canonical query. Pre-fix (the `request.query`
    // seed) this posts '1 mM clofibrate in dmso' — the D3 defect.
    expect(mintLocalTerm.mock.calls[0]?.[0]).toBe('material')
    expect(mintLocalTerm.mock.calls[0]?.[1]).toBe('1 mM Clofibrate in DMSO')
  })

  it('still falls back to the query seed when the server stamps NO unresolvedFact (non-shorthand / gap requests)', () => {
    // A gap request (forceMaterialClarifications.ts) sets request.query =
    // gap.label (RAW provenance) and NEVER stamps unresolvedFact. The chain
    // must fall back to mintNounFromQuery(query) — no casing hole introduced.
    const gapRequest: AiClarificationRequest = {
      id: 'clr-gap-1',
      kind: 'material',
      prompt: 'Pick the material',
      entityType: 'material',
      menuProvider: '/m',
      query: 'Golden Bead Plate',
      options: [],
      allowCreateLocal: true,
    }
    expect(mintLabelFor(gapRequest, 'Golden Bead Plate')).toBe('Golden Bead Plate')
  })
})
