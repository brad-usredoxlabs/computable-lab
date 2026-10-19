/**
 * W28-OPTIONBIND-1 — an option button on an engine card carries the record
 * handle and its pick emits the BINDING idiom (RED-first, ARCHITECT DECISION
 * W28-A5n Q1, spec 2026-10-19_1515 §Group 2.3/2.4).
 *
 * Class fixed: OPTION-PICK NON-BINDING. The engine's ambiguous-noun card shows
 * option buttons built from wire candidates (clarificationAdapter.ts :180-194,
 * the option id is positional `held-candidate-<i>-<j>` — never a record). The
 * click emits `{label: option.label, ...(option.ref ? {ref} : {})}`
 * (ProtocolLocalizationThread.tsx :791-797) and the answer VALUE is
 * `answer.mentionToken ?? answer.label ?? answer.value` (:410) — with no ref
 * there is no mentionToken, so a PLAIN LABEL rides the answers map. The server
 * builds AnsweredNounAnswer[] only from values matching MENTION_ANSWER_PATTERN
 * and store-validated (IntentCompileFromPromptHandlers.ts :212-224, :350-354:
 * "axis answers / plain text: prompt-echo only, as today") -> inert answer ->
 * the engine card re-bars byte-identically (r4 DEFECT-2).
 *
 * Fix (rides EXISTING fields only — AiClarificationOption.ref? at
 * types/ai.ts:199, AiClarificationAnswer.mentionToken): the adapter carries the
 * candidate's store-backed `ref` onto the option, and the pick emits the exact
 * ClarificationPicker answerFromMention idiom `[[labware:<id>|<label>]]`
 * (ClarificationPicker.tsx:118-131) so the untouched server validation binds it
 * through the untouched :313 value-join. WITHOUT a ref, today's label path is
 * byte-unchanged (pinned here).
 *
 * Mocking conventions are gapcard.test.tsx's (apiClient mocked wholesale, the
 * slash-menu resolvers' remote legs stubbed, the picker surface REAL).
 *
 * RED at base: tests 1-2 fail (the adapter-built option has no ref —
 * `expected undefined to be 'LBW-A'`), test 3 fails with the plain label
 * (`expected '1.5 mL Microcentrifuge Tube' to be '[[labware:...|...]]'`).
 * Test 4 (no-ref label path) holds at base AND after the fix — it is the
 * byte-unchanged contrast pin.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { apiClient } from '../../../shared/api/client'
import { ProtocolLocalizationThread } from './ProtocolLocalizationThread'
import { heldFactToClarificationRequest } from './ProtocolLocalizationThread.clarificationAdapter'

vi.mock('../../../shared/api/client', () => ({
  apiClient: {
    intentCompileFromPrompt: vi.fn(),
    intentAccept: vi.fn(),
    intentTrainingPair: vi.fn(),
    getRecord: vi.fn(),
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

const mockClient = apiClient as unknown as {
  intentCompileFromPrompt: ReturnType<typeof vi.fn>
  intentAccept: ReturnType<typeof vi.fn>
  intentTrainingPair: ReturnType<typeof vi.fn>
  getRecord: ReturnType<typeof vi.fn>
}

const resolveMaterial = vi.fn()
const resolveLabware = vi.fn()
const resolveEquipment = vi.fn()
vi.mock('../../../shared/taptab/slashMenu/resolvers', () => ({
  resolveMaterial: (q: string, ctx: unknown) => resolveMaterial(q, ctx),
  resolveLabware: (q: string, ctx: unknown) => resolveLabware(q, ctx),
  resolveEquipment: (q: string, ctx: unknown) => resolveEquipment(q, ctx),
}))

const FACT_LABEL = 'microcentrifuge tube'
const SEED_ID = 'lbw-seed-tube-1p5ml'
const SEED_TITLE = '1.5 mL Microcentrifuge Tube'

/** The r4 DEFECT-2 wire fact shape (receipts W28-A5D-R3/2026-10-19_1208-r4):
 *  the engine's ambiguous-noun card on a labware-semantic slot with two in-band
 *  store-backed candidates. Post-fix the engine carries each candidate's
 *  record id as `ref` (resolutionEngine.ts candidateFact); the wire candidate
 *  shape is the SPINE-1 frozen entry plus the additive optional ref. */
const ENGINE_FACT_WITH_REF = {
  label: FACT_LABEL,
  reason: 'ambiguous-noun',
  candidates: [
    { label: SEED_TITLE, confidence: 1, ref: SEED_ID },
    { label: 'Microcentrifuge Tube (rack)', confidence: 1, ref: 'lbw-rack-tube' },
  ],
  actionLocation: { actionIndex: 0, action: 'bead_beat', argument: 'labware' },
}

/** The same fact WITHOUT handles (a mint affordance / tier>1 candidate set —
 *  anti-fabrication means the engine sends no ref there). */
const ENGINE_FACT_NO_REF = {
  label: FACT_LABEL,
  reason: 'ambiguous-noun',
  candidates: [
    { label: SEED_TITLE, confidence: 1 },
    { label: 'Microcentrifuge Tube (rack)', confidence: 1 },
  ],
  actionLocation: { actionIndex: 0, action: 'bead_beat', argument: 'labware' },
}

const LOCAL_MACRO = {
  kind: 'scientist-intent',
  version: 1,
  intentId: 'w28-optionbind',
  actions: [{ action: 'bead_beat', labware: FACT_LABEL, duration: '30 s' }],
}

function gapRes(fact: Record<string, unknown>) {
  return {
    outcome: 'gap',
    localMacro: LOCAL_MACRO,
    terminalArtifacts: {
      events: [{ id: 'EV-1' }],
      resolvedLabwares: [{ recordId: 'LAB-other', title: 'Lysis Plate', hint: 'Lysis Plate' }],
    },
    clarifications: [fact],
  }
}

function seedFold(fact: Record<string, unknown>) {
  mockClient.getRecord.mockResolvedValue({ payload: { branch_axes: [] } })
  mockClient.intentCompileFromPrompt.mockResolvedValueOnce(gapRes(fact))
  render(<ProtocolLocalizationThread
    initialProtocolText="1. Bead beat the microcentrifuge tube for 30 s."
    sourceProtocolId="CAN-protocol-optionbind"
  />)
}

afterEach(() => {
  vi.clearAllMocks()
  resolveMaterial.mockReset()
  resolveLabware.mockReset()
  resolveEquipment.mockReset()
})

describe('clarificationAdapter — the candidate handle rides onto the option (W28-OPTIONBIND-1)', () => {
  it('1. a ref-bearing wire candidate builds an option carrying ref (the EXISTING AiClarificationOption.ref? field, no new field)', () => {
    const req = heldFactToClarificationRequest(ENGINE_FACT_WITH_REF, 0)
    expect(req).not.toBeNull()
    expect(req!.menuProvider).toBe('/l')
    expect(req!.options.map((o) => o.label)).toEqual([SEED_TITLE, 'Microcentrifuge Tube (rack)'])
    // RED at base: the adapter's option is {id, label} only. The ride uses the
    // EXISTING ref? field (types/ai.ts:199, Record<string, unknown>) with the
    // id semantics ClarificationPicker's answerFromMention ref already carries
    // and MessageLog.optionRefId already reads.
    expect(req!.options[0]!.ref).toEqual({ id: SEED_ID })
    expect(req!.options[1]!.ref).toEqual({ id: 'lbw-rack-tube' })
  })

  it('2. a candidate WITHOUT a handle builds an option with NO ref key (the no-ref arm stays byte-unchanged)', () => {
    const req = heldFactToClarificationRequest(ENGINE_FACT_NO_REF, 0)
    expect(req).not.toBeNull()
    expect(req!.options.length).toBe(2)
    for (const option of req!.options) {
      expect(option).not.toHaveProperty('ref')
    }
  })
})

describe('ProtocolLocalizationThread — an option pick with a handle emits the binding idiom (W28-OPTIONBIND-1)', () => {
  it('3. clicking a ref-bearing option re-sends answers[<fact label>] as [[labware:<id>|<label>]] (the answerFromMention idiom the server validates)', async () => {
    seedFold(ENGINE_FACT_WITH_REF)
    await screen.findByTestId('pl-clarification-cards')

    const cardEls = screen.getAllByTestId('pl-clarification-card')
    const card = cardEls.find((el) => (el.textContent ?? '').includes(FACT_LABEL))!
    const buttons = card.querySelectorAll('.pl-held-clarification-option')
    expect(buttons.length).toBe(2)
    fireEvent.click(buttons[0]!)

    // The EXISTING round-trip re-sends (no new endpoint): call 1 auto-localize,
    // call 2 the answer re-send.
    await waitFor(() => expect(mockClient.intentCompileFromPrompt).toHaveBeenCalledTimes(2))
    const body = mockClient.intentCompileFromPrompt.mock.calls[1]![0] as { answers?: Record<string, string> }
    // THE ANSWER IS THE IDIOM: exactly the shape ClarificationPicker's
    // answerFromMention emits (ClarificationPicker.tsx:124) and
    // MENTION_ANSWER_PATTERN + store.get() bind unchanged.
    expect(body.answers![FACT_LABEL]).toBe(`[[labware:${SEED_ID}|${SEED_TITLE}]]`)
  })

  it('4. contrast pin (holds at base AND after the fix): an option WITHOUT a handle keeps today\'s plain-label value', async () => {
    seedFold(ENGINE_FACT_NO_REF)
    await screen.findByTestId('pl-clarification-cards')

    const cardEls = screen.getAllByTestId('pl-clarification-card')
    const card = cardEls.find((el) => (el.textContent ?? '').includes(FACT_LABEL))!
    const buttons = card.querySelectorAll('.pl-held-clarification-option')
    fireEvent.click(buttons[0]!)

    await waitFor(() => expect(mockClient.intentCompileFromPrompt).toHaveBeenCalledTimes(2))
    const body = mockClient.intentCompileFromPrompt.mock.calls[1]![0] as { answers?: Record<string, string> }
    // Byte-unchanged: a plain label, NEVER a fabricated idiom (a fake [[...]]
    // with an id the engine never held would poison validateAnsweredSlots).
    expect(body.answers![FACT_LABEL]).toBe(SEED_TITLE)
  })
})
