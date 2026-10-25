/**
 * W211-GAPCARD-1 (A2) — the 200-gap FOLD ARM: a 200 outcome-'gap' response that
 * carries `clarifications` folds them into ANSWERABLE cards beside the deck
 * gate, instead of discarding them (the STEP-0 finding: "the client's 200 arms
 * never read res.clarifications and setHeldCards([])").
 *
 * Mocking conventions are heldBundle.test.tsx's (apiClient mocked wholesale).
 * The server shape is the real one (IntentCompileFromPromptHandlers.ts:499-507):
 * on outcome-'gap' with non-empty clarifications the key is ATTACHED additively;
 * on 'complete' the key is ABSENT (exactOptionalPropertyTypes conditional
 * spread) — so the absent-key arm is exercised too (no phantom cards).
 *
 * Pinned here:
 *  1. a 200-gap fold renders BOTH cards (the '/l' noun card AND the 'choice'
 *     gap card) WHILE pl-deck-review is mounted — the fold is INTO the deck
 *     gate, both surfaces coexist;
 *  2. the 'choice' card is kind-correct: no picker, no option buttons, the
 *     free-text box present;
 *  3. a 200 WITHOUT clarifications keeps cards at [] (byte-unchanged behavior);
 *  4. pl-load-deck stays ENABLED (no new deck-gate policy — OQ4: cards never
 *     block ghosting);
 *  5. answering the 'choice' card through its real control re-sends through the
 *     EXISTING round-trip with the answer riding as plain text at
 *     answers[<fact label>] (the captured request body IS "the answer rode the
 *     request"), and a subsequent complete-200 collapses the cards while the
 *     answers map keeps riding (fix-cycle invariant).
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
  },
}))

vi.mock('../../EventEditorContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../EventEditorContext')>()),
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

const mockClient = apiClient as unknown as {
  intentCompileFromPrompt: ReturnType<typeof vi.fn>
  intentAccept: ReturnType<typeof vi.fn>
  intentTrainingPair: ReturnType<typeof vi.fn>
  getRecord: ReturnType<typeof vi.fn>
}

// Stub the slash-menu resolvers' remote search legs (the clarificationCards
// convention): the '/l' picker fires resolveLabware on mount, which fetches
// the real API otherwise. The picker surface itself stays REAL.
const resolveMaterial = vi.fn()
const resolveLabware = vi.fn()
const resolveEquipment = vi.fn()
vi.mock('../../../shared/taptab/slashMenu/resolvers', () => ({
  resolveMaterial: (q: string, ctx: unknown) => resolveMaterial(q, ctx),
  resolveLabware: (q: string, ctx: unknown) => resolveLabware(q, ctx),
  resolveEquipment: (q: string, ctx: unknown) => resolveEquipment(q, ctx),
}))

const GAP_LABEL = 'Bead Beating Plate vs Lysis Plate'

/** The class-(d) gap fact VERBATIM from the golden fixture's plantedFacts wire
 *  (app/e2e/fixtures/w211-golden/zymo-intent.frozen.yaml, obligation
 *  d-gap-fact-deck-surface) — a literal copy, comment-cited, NOT a fixture
 *  import (a fixture import couples this test to the frozen sha churn). */
const GAP_FACT = {
  label: GAP_LABEL,
  reason: 'The protocol transfers to the Lysis Plate and adds Lysis Solution there, but bead-beats in the Bead Beating Plate; it is unclear whether the bead-beating occurs on the same physical plate (Lysis Plate) or a separate Bead Beating Plate.',
  candidates: [],
}

/** The (b) class noun fact (same fixture wire shape: ambiguous-noun +
 *  actionLocation.argument labware + two in-band candidates). */
const NOUN_FACT = {
  label: 'Bead Beating Plate',
  reason: 'ambiguous-noun',
  candidates: [
    { label: 'Bead Beating Plate A', confidence: 1 },
    { label: 'Bead Beating Plate B', confidence: 1 },
  ],
  actionLocation: { actionIndex: 2, action: 'bead_beat', argument: 'labware' },
}

const LOCAL_MACRO = {
  kind: 'scientist-intent',
  version: 1,
  intentId: 'w211-golden-bench-prep',
  actions: [
    { action: 'transfer', source: 'Sample Plate', target: 'Lysis Plate', volumeUl: 50 },
    { action: 'bead_beat', labware: 'Bead Beating Plate', duration: '30 s' },
  ],
}

/** A 200 outcome-'gap' response carrying clarifications (the additive server
 *  shape) + non-empty terminalArtifacts so the deck gate renders a real row. */
const GAP_200_RES = {
  outcome: 'gap',
  localMacro: LOCAL_MACRO,
  terminalArtifacts: {
    events: [{ id: 'EV-1' }],
    resolvedLabwares: [{ recordId: 'LAB-w211-golden-beadplate-a', title: 'Bead Beating Plate A', hint: 'Bead Beating Plate' }],
  },
  clarifications: [NOUN_FACT, GAP_FACT],
}

/** A 200 outcome-'complete' response: the clarifications key is ABSENT (the
 *  server's conditional spread), never :undefined. */
const COMPLETE_200_RES = {
  outcome: 'complete',
  localMacro: LOCAL_MACRO,
  terminalArtifacts: {
    events: [{ id: 'EV-1' }],
    resolvedLabwares: [{ recordId: 'LAB-w211-golden-beadplate-a', title: 'Bead Beating Plate A', hint: 'Bead Beating Plate' }],
  },
}

function seedGapFold(res: Record<string, unknown> = GAP_200_RES) {
  mockClient.getRecord.mockResolvedValue({ payload: { branch_axes: [] } })
  // The auto-localize effect (sourceProtocolId + text) fires the FIRST
  // intentCompileFromPrompt; this lane serves the 200-gap body on it.
  mockClient.intentCompileFromPrompt.mockResolvedValueOnce(res)
  render(<ProtocolLocalizationThread
    initialProtocolText="1. Transfer 50 uL from the Sample Plate to the Lysis Plate. 2. Bead beat the samples in the Bead Beating Plate for 30 s."
    sourceProtocolId="CAN-protocol-gapcard"
  />)
}

afterEach(() => {
  vi.clearAllMocks()
  resolveMaterial.mockReset()
  resolveLabware.mockReset()
  resolveEquipment.mockReset()
})

describe('ProtocolLocalizationThread — 200-gap clarifications fold into the deck gate (W211-GAPCARD-1)', () => {
  it('1. a 200-gap fold renders BOTH cards WHILE pl-deck-review is mounted (fold INTO the gate, surfaces coexist)', async () => {
    seedGapFold()

    await waitFor(() => expect(screen.getByTestId('pl-deck-review')).toBeTruthy())
    const cards = await screen.findByTestId('pl-clarification-panel')
    const cardEls = screen.getAllByTestId('pl-clarification-card')
    expect(cardEls.length).toBe(2)
    expect(cardEls[0]!.textContent).toContain('Bead Beating Plate')
    expect(cardEls[1]!.textContent).toContain(GAP_LABEL)
    // The deck gate is still there beside the cards (the fold did not bypass it).
    expect(screen.getByTestId('pl-deck-review')).toBeTruthy()
    expect(cards).toBeTruthy()
    // The honest infoMsg line is unchanged in kind (info, not error).
    const msg = screen.getByTestId('pl-msg')
    expect(msg.className).not.toContain('msg--error')
    expect(msg.textContent).toContain('Localized: gap')
  })

  it('2. the gap card is kind-correct: menu chip choice, NO picker, NO option buttons, the free-text box present', async () => {
    seedGapFold()
    await screen.findByTestId('pl-clarification-panel')

    const cardEls = screen.getAllByTestId('pl-clarification-card')
    const gapCard = cardEls.find((el) => (el.textContent ?? '').includes(GAP_LABEL))
    expect(gapCard).toBeTruthy()
    expect(gapCard!.querySelector('.pl-held-clarification-menu')?.textContent).toBe('choice')
    // No option buttons (candidates: [] on the wire fact).
    expect(gapCard!.querySelectorAll('.pl-held-clarification-option').length).toBe(0)
    // The answer surface: the free-text box (ParameterAnswerInput), NOT a picker.
    expect(gapCard!.querySelector('[data-testid="parameter-answer-input"]')).toBeTruthy()
    expect(gapCard!.querySelector('[data-testid="parameter-answer-submit"]')).toBeTruthy()
    // The noun card keeps its picker (unchanged surface for '/l').
    const nounCard = cardEls.find((el) => (el.textContent ?? '').includes('Bead Beating Plate A'))
    expect(nounCard).toBeTruthy()
    expect(nounCard!.querySelectorAll('.pl-held-clarification-option').length).toBe(2)
  })

  it('3. a 200 WITHOUT clarifications keeps the card surface empty (no phantom cards — today behavior byte-unchanged)', async () => {
    seedGapFold(COMPLETE_200_RES)

    await waitFor(() => expect(screen.getByTestId('pl-deck-review')).toBeTruthy())
    expect(screen.queryByTestId('pl-clarification-panel')).toBeNull()
    expect(screen.queryByTestId('pl-clarification-card')).toBeNull()
    expect(document.querySelector('[data-testid="parameter-answer-input"]')).toBeNull()
  })

  it('4. no new deck-gate policy: pl-load-deck stays ENABLED beside unanswered cards (OQ4)', async () => {
    seedGapFold()
    await screen.findByTestId('pl-clarification-panel')

    await waitFor(() => expect(screen.getByTestId('deck-labware-LAB-w211-golden-beadplate-a')).toBeTruthy())
    const loadDeck = screen.getByTestId('pl-load-deck') as HTMLButtonElement
    expect(loadDeck.disabled).toBe(false)
    fireEvent.click(loadDeck)
    await waitFor(() => expect(screen.getByTestId('pl-msg').textContent).toContain('ghosted'))
  })

  it('5. answering the choice card through its real control rides answers[<fact label>] as plain text, and a complete-200 collapses the cards', async () => {
    seedGapFold()
    await screen.findByTestId('pl-clarification-panel')

    const cardEls = screen.getAllByTestId('pl-clarification-card')
    const gapCard = cardEls.find((el) => (el.textContent ?? '').includes(GAP_LABEL))!
    const input = gapCard.querySelector('[data-testid="parameter-answer-input"]') as HTMLInputElement
    const submit = gapCard.querySelector('[data-testid="parameter-answer-submit"]') as HTMLButtonElement

    const TYPED = 'bead-beat in the same Lysis Plate, no separate Bead Beating Plate'
    fireEvent.change(input, { target: { value: TYPED } })
    fireEvent.click(submit)

    // The EXISTING round-trip re-sends (no new endpoint): call 1 was the
    // auto-localize, call 2 is the answer re-send.
    await waitFor(() => expect(mockClient.intentCompileFromPrompt).toHaveBeenCalledTimes(2))
    const reSendBody = mockClient.intentCompileFromPrompt.mock.calls[1]![0] as { answers?: Record<string, string> }
    // THE ANSWER RODE THE REQUEST: key = the fact's own label, value = the
    // typed text VERBATIM (non-idiom — the class-(d) contract; never a fake
    // [[…]] mention, which would poison validateAnsweredSlots).
    expect(reSendBody.answers).toBeDefined()
    expect(reSendBody.answers![GAP_LABEL]).toBe(TYPED)

    // The re-send serves the complete-200 (the producer no longer re-asks):
    // the cards collapse, the deck gate persists, and the answer KEEPS RIDING
    // the answers map (a card-surface change never clears it).
    mockClient.intentCompileFromPrompt.mockResolvedValueOnce(COMPLETE_200_RES)
    fireEvent.click(screen.getByTestId('pl-localize-btn'))
    await waitFor(() => expect(mockClient.intentCompileFromPrompt).toHaveBeenCalledTimes(3))
    expect(screen.queryByTestId('pl-clarification-card')).toBeNull()
    expect(screen.getByTestId('pl-deck-review')).toBeTruthy()

    // The answers map was NOT cleared: a Refine / Re-Draft (which sends
    // compileAnswers()) still carries the gap answer as plain text.
    fireEvent.change(screen.getByTestId('pl-refine-input'), { target: { value: 'bead-beat on the Lysis Plate' } })
    mockClient.intentCompileFromPrompt.mockResolvedValueOnce(COMPLETE_200_RES)
    fireEvent.click(screen.getByTestId('pl-refine-send'))
    await waitFor(() => expect(mockClient.intentCompileFromPrompt).toHaveBeenCalledTimes(4))
    const lastBody = mockClient.intentCompileFromPrompt.mock.calls[3]![0] as { answers?: Record<string, string> }
    expect(lastBody.answers![GAP_LABEL]).toBe(TYPED)
  })
})
