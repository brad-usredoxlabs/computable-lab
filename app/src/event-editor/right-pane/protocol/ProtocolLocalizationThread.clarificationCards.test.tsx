/**
 * THREAD-ASK-1 (Leg 2, client) — the held 422 bar renders ANSWERABLE cards.
 *
 * Spec §Leg 2 + test plan items 1-4:
 *  1. a held 422 (the `{held:true, clarifications, localMacro, terminalArtifacts}`
 *     union arm) renders one answerable card per clarification that has an
 *     answer surface (ClarificationPicker via requestHasPicker; the label is
 *     visible);
 *  2. picking a minted answer (the picker's mint affordance -> mintLocalTerm)
 *     RE-SENDS compile-from-prompt with the answer riding as DATA in the
 *     request body (the captured body carries the clarification label + the
 *     MAT- recordId) — the existing round-trip, no new endpoint;
 *  3. the deck-gate holdForReview path is byte-unchanged: the held fold still
 *     ends in holdForReview(held.terminalArtifacts) — pinned via the same
 *     observable side-effects heldBundle.test.tsx pins (pl-deck-review +
 *     derived deck labware) — and a card pick does NOT bypass the gate (the
 *     re-send's held result re-folds through the same path, never straight to
 *     the canvas);
 *  4. the existing infoMsg honesty text stays for reasons with no answer
 *     surface (fallback — no picker-less card);
 *  5-7 (fix cycle 1, D1): every success path that RESOLVES the macro
 *     (re-localize 2xx, answers re-submit 2xx, correction 2xx) clears the
 *     held cards — the same lifecycle the pick's 2xx arm already has — so no
 *     stale answerable card survives over an already-resolved macro.
 *  8 (fix cycle 2, D1 residual): the needsAnswers arm of handleLocalize also
 *     discards the macro (setLocalMacro(null) + setPendingDraft(null)), so it
 *     must clear the held cards too — reachable via the always-rendered
 *     "Localize (one-shot)" button (sends no answers -> the server returns
 *     needsAnswers) while a prior held fold's cards are open. The answers map
 *     is NOT cleared there: the Leg-1 clarificationAnswers keep riding
 *     re-drafts (pinned by the follow-up submit body carrying the minted
 *     MAT- answer).
 *
 * The mint flow is the REAL one the picker already uses: the /m resolver's
 * `mint:<q>` suggestion whose resolveMention calls
 * apiClient.mintLocalTerm('material', q, q) (resolvers.ts:69-90). Only the
 * resolver's remote search is stubbed; the mint leg runs through the picker's
 * own command -> groundedAnswerFromMention -> answerFromMention code.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { apiClient } from '../../../shared/api/client'
import { ProtocolLocalizationThread } from './ProtocolLocalizationThread'

vi.mock('../../../shared/api/client', () => ({
  apiClient: {
    intentCompileFromPrompt: vi.fn(),
    intentAccept: vi.fn(),
    intentTrainingPair: vi.fn(),
    getRecord: vi.fn(),
    mintLocalTerm: vi.fn(),
  },
}))

vi.mock('../../EventEditorContext', () => ({
  useOptionalEventEditor: () => ({
    state: {
      platforms: [{ id: 'integra_assist', label: 'Integra Assist', variants: [{ id: 'default', title: 'Default', slots: [{ id: 'B2', kind: 'standard' }, { id: 'B5', kind: 'standard' }] }] }],
      platformId: 'integra_assist',
      variantId: 'default',
      runId: 'RUN-1',
      runDeckLock: null,
      labwares: {},
      placements: [],
      events: [],
      preview: { previewPlacements: [], previewEvents: [{}], previewLabwares: {} },
    },
    actions: { setPreview: vi.fn(), commitPreview: vi.fn(), clearPreview: vi.fn(), setPlatform: vi.fn() },
  }),
}))

// Stub ONLY the slash-menu resolvers' remote search legs. The mint suggestion
// mirrors resolvers.ts:69-90 exactly — its resolveMention calls the (mocked)
// apiClient.mintLocalTerm, the same mint floor the picker's canMint offers.
const resolveMaterial = vi.fn()
const resolveLabware = vi.fn()
const resolveEquipment = vi.fn()
vi.mock('../../../shared/taptab/slashMenu/resolvers', () => ({
  resolveMaterial: (q: string, ctx: unknown) => resolveMaterial(q, ctx),
  resolveLabware: (q: string, ctx: unknown) => resolveLabware(q, ctx),
  resolveEquipment: (q: string, ctx: unknown) => resolveEquipment(q, ctx),
}))

const mockClient = apiClient as unknown as {
  intentCompileFromPrompt: ReturnType<typeof vi.fn>
  intentAccept: ReturnType<typeof vi.fn>
  intentTrainingPair: ReturnType<typeof vi.fn>
  getRecord: ReturnType<typeof vi.fn>
  mintLocalTerm: ReturnType<typeof vi.fn>
}

const MINTED_LABEL = 'BashingBead Lysis Module'

/** The discriminated held bundle (the heldBundle.test.tsx wire-shape idiom):
 *  zero-artifact bar (OQ3(a)), parseable macro, unknown-noun clarification. */
const HELD_RES = {
  held: true,
  error: 'NEEDS_CLARIFICATION',
  outcome: 'needs-clarification',
  clarifications: [
    { label: MINTED_LABEL, reason: 'unknown-noun', candidates: [{ label: 'Create local term “fresh_plate”', confidence: 0.05 }] },
  ],
  localMacro: {
    kind: 'scientist-intent',
    version: 1,
    intentId: 'lyse-run',
    actions: [{ action: 'add_material', source: MINTED_LABEL, target: 'block', volumeUl: '600' }],
    unresolved: [{ label: MINTED_LABEL, reason: 'unknown-noun' }],
  },
  terminalArtifacts: { events: [] },
}

const ASK_RES = {
  needsAnswers: true,
  axes: [{ axisId: 'lysis_variant', question: 'Which lysis variant?', choices: [{ value: 'variant_a', label: 'Lyse (variant a)' }] }],
}

/** The mint suggestion row the REAL /m resolver appends when a query finds no
 *  match (resolvers.ts:69-90): key `mint:<q>`, resolveMention mints server-side. */
function mintSuggestion(q: string) {
  return {
    key: `mint:${q}`,
    label: `Create local term "${q}"`,
    badge: 'New',
    subtitle: 'mint a draft term into the lab namespace',
    pinBottom: true,
    mention: { type: 'material', entityKind: 'material', id: '', label: q },
    resolveMention: async () => {
      const res = await mockClient.mintLocalTerm('material', q, q) as { recordId: string; label: string }
      return { type: 'material', entityKind: 'material', id: res.recordId, label: res.label }
    },
  }
}

/** A clean 2xx compile (the shape the three non-pick success arms consume):
 *  resolved macro + a labware the deck review shows. Used by tests 5-7 to
 *  prove a SUCCESS that resolves the macro also collapses the held cards. */
const RESOLVED_RES = {
  outcome: 'complete',
  localMacro: {
    kind: 'scientist-intent',
    version: 1,
    intentId: 'lyse-run',
    actions: [{ action: 'add_material', source: MINTED_LABEL, target: 'block', volumeUl: '600' }],
  },
  terminalArtifacts: { events: [], labwareAdditions: [{ recordId: 'LAB-block', deckSlot: 'B2' }] },
  axes: {},
}

/** A family-declared axis (the record's own data) so the clarify region — and
 *  with it the "Apply & compile" button — stays rendered after a held fold.
 *  Same axisId/choice as ASK_RES so mergeQuestionAxes dedupes to ONE control. */
const FAMILY_BRANCH_AXES = [{
  axisId: 'lysis_variant',
  label: 'Which lysis variant?',
  conditions: [{ id: 'variant_a', label: 'Lyse (variant a)' }],
}]

async function openBarWithCard(familyBranchAxes: unknown[] = []) {
  // The adapter seeds the picker's query with the fact label, so the /m search
  // fires on mount — stub it to the resolver's real no-match shape (the mint
  // affordance row, resolvers.ts:69-90) before the bar opens.
  resolveMaterial.mockImplementation(async (q: string) => [mintSuggestion(q)])
  mockClient.getRecord.mockResolvedValue({ payload: { branch_axes: familyBranchAxes } })
  mockClient.intentCompileFromPrompt
    .mockResolvedValueOnce(ASK_RES)
    .mockResolvedValueOnce(HELD_RES)
  render(<ProtocolLocalizationThread initialProtocolText={`1. Lyse the culture in the ${MINTED_LABEL}`} sourceProtocolId="CAN-protocol-thread-ask" />)
  await waitFor(() => expect(screen.getByTestId('pl-clarify')).toBeTruthy())
  fireEvent.click(screen.getByLabelText('Lyse (variant a)'))
  fireEvent.click(screen.getByTestId('pl-submit-answers'))
  await waitFor(() => expect(screen.getByTestId('pl-deck-review')).toBeTruthy())
}

afterEach(() => {
  vi.clearAllMocks()
  resolveMaterial.mockReset()
  resolveLabware.mockReset()
  resolveEquipment.mockReset()
})

describe('ProtocolLocalizationThread — held clarifications render answerable cards (THREAD-ASK-1)', () => {
  it('1. a held 422 renders one answerable card per clarification (label visible + picker present)', async () => {
    await openBarWithCard()

    const cards = await screen.findByTestId('pl-clarification-cards')
    const card = screen.getByTestId('pl-clarification-card')
    expect(card.textContent).toContain(MINTED_LABEL)
    // The answer surface: the picker's search box (the /m menu with the mint floor).
    expect(cards.querySelector('.message-log__clarification-picker')).toBeTruthy()
    expect(screen.getByPlaceholderText(/mint a local term/i)).toBeTruthy()
    // The honest infoMsg line stays alongside the cards (unchanged fold text).
    expect(screen.getByTestId('pl-msg').textContent).toContain(`${MINTED_LABEL} (unknown-noun)`)
  })

  it('2. picking a minted answer re-sends compile-from-prompt with the answer riding as data (label + MAT- id in the body)', async () => {
    await openBarWithCard()
    await screen.findByTestId('pl-clarification-card')

    resolveMaterial.mockImplementation(async (q: string) => [mintSuggestion(q)])
    mockClient.mintLocalTerm.mockResolvedValue({ ok: true, recordId: 'MAT-threadask-1', label: MINTED_LABEL })
    // The re-send re-bars WITHOUT this fact (the spine bound it — decision fact 8).
    mockClient.intentCompileFromPrompt.mockResolvedValueOnce({
      ...HELD_RES,
      clarifications: [],
    })

    const input = screen.getByPlaceholderText(/mint a local term/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: MINTED_LABEL } })
    const mintRow = await screen.findByText(`Create local term "${MINTED_LABEL}"`)
    fireEvent.mouseDown(mintRow)

    await waitFor(() => expect(mockClient.mintLocalTerm).toHaveBeenCalledWith('material', MINTED_LABEL, MINTED_LABEL))
    await waitFor(() => expect(mockClient.intentCompileFromPrompt).toHaveBeenCalledTimes(3))
    const reSendBody = mockClient.intentCompileFromPrompt.mock.calls[2]![0] as { answers?: Record<string, string> }
    // The clarification answer rides the EXISTING answers map as data:
    // key = the clarification label, value = the picker's mention idiom.
    expect(reSendBody.answers).toBeDefined()
    expect(Object.keys(reSendBody.answers!)).toContain(MINTED_LABEL)
    expect(reSendBody.answers![MINTED_LABEL]).toContain('MAT-threadask-1')
    expect(reSendBody.answers![MINTED_LABEL]).toContain(MINTED_LABEL)
  })

  it('3. the deck gate is byte-unchanged: the fold still holds for review, and a pick does NOT bypass it', async () => {
    await openBarWithCard()
    await screen.findByTestId('pl-clarification-card')

    // The held fold's observable side-effects (heldBundle.test.tsx pins):
    // deck review + honest zero-labware deck + the folded macro — all present.
    // (Accept enabled = the harness's non-empty editor preview mirroring the
    // post-ghost state, same as the sibling tests; the gate is the deck review
    // itself — nothing reaches the canvas without it.)
    expect(screen.getByTestId('pl-deck-review')).toBeTruthy()
    expect(screen.getByTestId('pl-deckreview-empty')).toBeTruthy()
    expect(screen.getByTestId('pl-macro-view').textContent).toContain('1 actions')

    resolveMaterial.mockImplementation(async (q: string) => [mintSuggestion(q)])
    mockClient.mintLocalTerm.mockResolvedValue({ ok: true, recordId: 'MAT-threadask-1', label: MINTED_LABEL })
    // The re-send re-BARS (with a different held fact): it must re-fold through
    // the same gate path, never reach the canvas.
    mockClient.intentCompileFromPrompt.mockResolvedValueOnce({
      ...HELD_RES,
      clarifications: [{ label: 'sample (gate 2025)', reason: 'unknown-noun' }],
    })

    const input = screen.getByPlaceholderText(/mint a local term/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: MINTED_LABEL } })
    const mintRow = await screen.findByText(`Create local term "${MINTED_LABEL}"`)
    fireEvent.mouseDown(mintRow)

    await waitFor(() => expect(mockClient.intentCompileFromPrompt).toHaveBeenCalledTimes(3))
    // Still under the gate: the deck review persists (the re-send re-folded
    // through foldHeldBundle, never straight to the canvas) and the re-barred
    // fact re-folded into a NEW answerable card.
    expect(screen.getByTestId('pl-deck-review')).toBeTruthy()
    expect(screen.getByTestId('pl-deckreview-empty')).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('pl-clarification-card').textContent).toContain('sample (gate 2025)'))
  })

  it('4. a held fact with no answer surface keeps the honest infoMsg text (no picker-less card)', async () => {
    mockClient.getRecord.mockResolvedValue({ payload: { branch_axes: [] } })
    mockClient.intentCompileFromPrompt
      .mockResolvedValueOnce(ASK_RES)
      .mockResolvedValueOnce({
        ...HELD_RES,
        clarifications: [{ label: 'culture volume', reason: 'missing-required-argument' }],
      })
    render(<ProtocolLocalizationThread initialProtocolText="1. Add the culture" sourceProtocolId="CAN-protocol-thread-ask" />)
    await waitFor(() => expect(screen.getByTestId('pl-clarify')).toBeTruthy())
    fireEvent.click(screen.getByLabelText('Lyse (variant a)'))
    fireEvent.click(screen.getByTestId('pl-submit-answers'))

    await waitFor(() => expect(screen.getByTestId('pl-deck-review')).toBeTruthy())
    // The honesty line is unchanged...
    expect(screen.getByTestId('pl-msg').textContent).toContain('culture volume (missing-required-argument)')
    // ...and there is NO card/picker for a fact with no answer surface.
    expect(screen.queryByTestId('pl-clarification-card')).toBeNull()
    expect(document.querySelector('.message-log__clarification-picker')).toBeNull()
  })

  // -------------------------------------------------------------------------
  // Tests 5-7 (fix cycle 1, D1): the card lifecycle is CONSISTENT with the
  // pick path (which collapses cards on a successful 2xx at :405). Every
  // success path that RESOLVES the macro must clear the held cards — a stale
  // answerable card over an already-resolved macro is the defect. The gate
  // itself must persist (the success still goes through holdForReview).
  // -------------------------------------------------------------------------

  it('5. a re-localize (one-shot) that returns 2xx clears the held cards (no stale card over a resolved macro)', async () => {
    await openBarWithCard()
    await screen.findByTestId('pl-clarification-card')

    // The "Localize (one-shot)" button is always rendered (:670-677).
    mockClient.intentCompileFromPrompt.mockResolvedValueOnce(RESOLVED_RES)
    fireEvent.click(screen.getByTestId('pl-localize-btn'))

    // The success folded through the gate (deck review with the resolved labware)...
    await waitFor(() => expect(screen.getByTestId('deck-labware-LAB-block')).toBeTruthy())
    // ...and the held cards collapsed — same lifecycle as the pick's 2xx arm.
    expect(screen.queryByTestId('pl-clarification-card')).toBeNull()
    expect(document.querySelector('.message-log__clarification-picker')).toBeNull()
  })

  it('6. re-submitting branch answers that returns 2xx clears the held cards', async () => {
    // Family-declared axis keeps the clarify region (and Apply & compile)
    // rendered after the held fold, so the answers path is reachable.
    await openBarWithCard(FAMILY_BRANCH_AXES)
    await screen.findByTestId('pl-clarification-card')

    mockClient.intentCompileFromPrompt.mockResolvedValueOnce(RESOLVED_RES)
    fireEvent.click(screen.getByTestId('pl-submit-answers'))

    await waitFor(() => expect(screen.getByTestId('deck-labware-LAB-block')).toBeTruthy())
    expect(screen.queryByTestId('pl-clarification-card')).toBeNull()
    expect(document.querySelector('.message-log__clarification-picker')).toBeNull()
  })

  it('7. a correction (Refine / Re-Draft) that returns 2xx clears the held cards', async () => {
    await openBarWithCard()
    await screen.findByTestId('pl-clarification-card')

    // The refine region is rendered because the held fold set a macro.
    fireEvent.change(screen.getByTestId('pl-refine-input'), { target: { value: 'do the lysis at 4C' } })
    mockClient.intentCompileFromPrompt.mockResolvedValueOnce(RESOLVED_RES)
    fireEvent.click(screen.getByTestId('pl-refine-send'))

    await waitFor(() => expect(screen.getByTestId('deck-labware-LAB-block')).toBeTruthy())
    expect(screen.queryByTestId('pl-clarification-card')).toBeNull()
    expect(document.querySelector('.message-log__clarification-picker')).toBeNull()
  })

  // -------------------------------------------------------------------------
  // Test 8 (fix cycle 2, D1 residual): the needsAnswers arm of handleLocalize
  // REPLACES the macro (setLocalMacro(null) + setPendingDraft(null)), so the
  // cycle-1 D1 invariant applies here too — no stale answerable card survives
  // over a discarded macro. Reachable via the always-rendered "Localize
  // (one-shot)" button: it sends no answers, so the server answers with
  // needsAnswers while a prior held fold's cards are open. The answers map
  // must NOT be cleared: the minted clarification answer keeps riding.
  // -------------------------------------------------------------------------

  it('8. a one-shot re-localize that returns needsAnswers clears the held cards over the discarded macro, and the minted clarification answer keeps riding', async () => {
    await openBarWithCard()
    await screen.findByTestId('pl-clarification-card')

    // Mint an answer on the held card: the pick re-sends (call 3) and the
    // answer lands in the clarificationAnswers map (Leg 1 data). The re-send
    // RE-BARS with a different held fact, so a card is STILL open afterwards
    // (the minted answer rides the map even though its own fact got bound).
    resolveMaterial.mockImplementation(async (q: string) => [mintSuggestion(q)])
    mockClient.mintLocalTerm.mockResolvedValue({ ok: true, recordId: 'MAT-threadask-1', label: MINTED_LABEL })
    mockClient.intentCompileFromPrompt.mockResolvedValueOnce({
      ...HELD_RES,
      clarifications: [{ label: 'sample (gate 2025)', reason: 'unknown-noun' }],
    })
    const input = screen.getByPlaceholderText(/mint a local term/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: MINTED_LABEL } })
    const mintRow = await screen.findByText(`Create local term "${MINTED_LABEL}"`)
    fireEvent.mouseDown(mintRow)
    await waitFor(() => expect(mockClient.intentCompileFromPrompt).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(screen.getByTestId('pl-clarification-card').textContent).toContain('sample (gate 2025)'))

    // The defect path: the always-rendered "Localize (one-shot)" button (:685)
    // sends NO answers, so the server returns needsAnswers (handler :290)
    // while a held fold's cards are open. The arm discards the macro
    // (setLocalMacro(null) + setPendingDraft(null)) — the cards must go too.
    mockClient.intentCompileFromPrompt.mockResolvedValueOnce(ASK_RES)
    fireEvent.click(screen.getByTestId('pl-localize-btn'))

    // The needs-answers gate is shown...
    await waitFor(() => expect(screen.getByTestId('pl-clarify').textContent).toContain('Which lysis variant?'))
    // ...the discarded macro's surfaces are gone (no refine region, no deck review)...
    expect(screen.queryByTestId('pl-refine')).toBeNull()
    expect(screen.queryByTestId('pl-deck-review')).toBeNull()
    // ...and NO stale answerable card survives over the discarded macro.
    expect(screen.queryByTestId('pl-clarification-card')).toBeNull()
    expect(document.querySelector('.message-log__clarification-picker')).toBeNull()

    // The answers map was NOT cleared: re-answering the axis and submitting
    // sends a body where the minted clarification answer is STILL riding
    // (only the axis answer was reset by the arm).
    mockClient.intentCompileFromPrompt.mockResolvedValueOnce(RESOLVED_RES)
    fireEvent.click(screen.getByLabelText('Lyse (variant a)'))
    fireEvent.click(screen.getByTestId('pl-submit-answers'))
    await waitFor(() => expect(mockClient.intentCompileFromPrompt).toHaveBeenCalledTimes(5))
    const body = mockClient.intentCompileFromPrompt.mock.calls[4]![0] as { answers?: Record<string, string> }
    expect(body.answers).toBeDefined()
    expect(Object.keys(body.answers!)).toContain(MINTED_LABEL)
    expect(body.answers![MINTED_LABEL]).toContain('MAT-threadask-1')
    expect(body.answers!['lysis_variant']).toBe('variant_a')
  })
})
