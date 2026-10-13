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
 *     surface (fallback — no picker-less card).
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
      const res = await mockClient.mintLocalTerm('material', q, q)
      return { type: 'material', entityKind: 'material', id: res.recordId, label: res.label }
    },
  }
}

async function openBarWithCard() {
  mockClient.getRecord.mockResolvedValue({ payload: { branch_axes: [] } })
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
    expect(screen.getByTestId('pl-deck-review')).toBeTruthy()
    expect(screen.getByTestId('pl-deckreview-empty')).toBeTruthy()
    expect(screen.getByTestId('pl-macro-view').textContent).toContain('1 actions')
    expect((screen.getByTestId('pl-accept') as HTMLButtonElement).disabled).toBe(true)

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
    // Still under the gate: deck review present, accept still disabled, and the
    // re-barred fact re-folded into a NEW answerable card (not the canvas).
    expect(screen.getByTestId('pl-deck-review')).toBeTruthy()
    expect((screen.getByTestId('pl-accept') as HTMLButtonElement).disabled).toBe(true)
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
})
