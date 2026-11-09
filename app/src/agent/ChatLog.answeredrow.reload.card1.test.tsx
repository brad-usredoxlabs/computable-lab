/**
 * L2-CLARIFY-CARD-1 (DEFECT 6, ruling l2t1951 Q2 unit 1) — the ANSWERED-ROW
 * RENDER LEG regression lock (the "simulated reload" ChatLog render pin).
 *
 * The cold reload that loses the Answered row is closed by TWO legs the ruling
 * names: (1) the PERSISTED ANSWERED-STATE survives the reload because the
 * answer user message carries `metadata.clarificationAnswers` (Q2 units 2-3,
 * pinned by the two-turn + reload server-boundary pin), and (2) this render
 * leg — a rehydrated thread whose [assistant card turn, user answer] adjacency
 * survives the reload MUST render the ONE compact Answered row (answer text +
 * question) with ZERO live answer inputs.
 *
 * This pin drives ChatLog with the THREAD-HYDRATE shape (useAiChat.ts:908-932):
 *   - the card turn rehydrates from `metadata.clarification` marked
 *     `restored: true` (NO `clarificationRequests`, NO `streamEvents`) — the
 *     exact shape the hydrate reconstructs from the persisted thread;
 *   - the following user answer turn rehydrates as a plain user message that
 *     carries the persisted `clarificationAnswers` (metadata.clarificationAnswers).
 * A fresh ChatLog mount over that array is the "reload".
 *
 * The answered-row predicate (ChatLog.tsx:100-102, `isClarificationAnswered`)
 * is `slice(index+1).some(user)` — so the adjacency, NOT a live picker state,
 * is what drives the compaction. This pin locks that the answered row renders
 * and that NO live answer affordance (picker search input, option buttons,
 * typed-arm card) is present on the restored card turn. The `restored` flag
 * (not streamEvents presence) is the discriminator: a live legacy-only turn
 * that never populates `clarificationRequests` still renders its FULL arm
 * (the control below) — so this lock keys on the explicit restore marker and
 * never a live turn.
 *
 * This is a REGRESSION LOCK (the render leg is GREEN today — the defect-6
 * 1→0 was reproduced via the re-keyed post-flip thread shape, whose fix is the
 * persist + re-send leg closing the re-ask). It must stay GREEN; it would go
 * RED if the answered-row arm were ever dropped or the restored suppression
 * (`if (message.restored) return null`, ChatLog.tsx:272) were ever removed in
 * a way that re-exposes a live picker on a restored card turn.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiClarificationAnswer, ChatMessage } from '../types/ai'
import { ChatLog } from './ChatLog'

// Render the REAL ClarificationPicker so the "zero live answer inputs" assert
// is meaningful (the picker ALWAYS renders its search input on a live,
// answerable card). Stub only its data dependencies so the closed-state mount
// is deterministic and cheap in jsdom (the same seam ChatLog.d3chrome.uifix3
// and the D5 pin use). Paths are RELATIVE TO THIS TEST (app/src/agent/).
const resolveMaterial = vi.fn()
const resolveLabware = vi.fn()
const resolveEquipment = vi.fn()
vi.mock('../shared/taptab/slashMenu/resolvers', () => ({
  resolveMaterial: (q: string, c: unknown) => resolveMaterial(q, c),
  resolveLabware: (q: string, c: unknown) => resolveLabware(q, c),
  resolveEquipment: (q: string, c: unknown) => resolveEquipment(q, c),
  mintLocalTermLabel: (q: string) => `Create material record "${q}" in the lab (new record)`,
}))
const groundMaterialRef = vi.fn()
vi.mock('../event-editor/lib/groundMaterialRef', () => ({
  groundMaterialRef: (ref: unknown) => groundMaterialRef(ref),
}))
const mintLocalTerm = vi.fn()
vi.mock('../shared/api/client', () => ({
  apiClient: { mintLocalTerm: (a: string, b: string, c?: string) => mintLocalTerm(a, b, c) },
}))

afterEach(() => {
  cleanup()
  resolveMaterial.mockReset()
  resolveLabware.mockReset()
  resolveEquipment.mockReset()
  groundMaterialRef.mockReset()
  mintLocalTerm.mockReset()
})

const props = {
  isStreaming: false,
  prompt: '',
  onPromptChange: vi.fn(),
  onSend: vi.fn(),
  onCancel: vi.fn(),
  onReview: vi.fn(),
  onClarificationPick: vi.fn(),
}

/** The D3 defect-5 scenario, rehydrated: the material clarifier whose raw
 *  provenance label is the human-case "1 mM Clofibrate in DMSO" while the
 *  canonical identity key is lowercase. Restored shape (no typed requests, no
 *  streamEvents) — exactly what the thread hydrate reconstructs. */
const QUESTION = 'The draft names "1 mM Clofibrate in DMSO" — choose what it is'
const RAW_LABEL = '1 mM Clofibrate in DMSO'

function restoredCardTurn(): ChatMessage {
  return {
    id: 'persisted-2-1714300000100',
    role: 'assistant',
    content: QUESTION,
    timestamp: 1714300000100,
    restored: true,
    clarification: {
      id: 'req-clofibrate',
      prompt: QUESTION,
      entityType: 'material',
      menuProvider: '/m',
      query: '1 mM clofibrate in dmso', // canonical identity key (lowercase)
      allowCreateLocal: true,
      options: [],
    },
  }
}

/** The persisted answer: the user turn that carried the structured answer. On
 *  a fresh mount (the reload) it rehydrates as a plain user message whose
 *  content is the answer sentence and which carries the persisted
 *  clarificationAnswers (metadata.clarificationAnswers, restored by the
 *  hydrate leg — useAiChat.ts:928-931). */
function rehydratedAnswerTurn(): ChatMessage {
  const answers: AiClarificationAnswer[] = [
    { requestId: 'req-clofibrate', label: RAW_LABEL, value: RAW_LABEL },
  ]
  return {
    id: 'persisted-3-1714300000200',
    role: 'user',
    content: `Use ${RAW_LABEL} for req-clofibrate.`,
    timestamp: 1714300000200,
    clarificationAnswers: answers, // restored from metadata.clarificationAnswers
  }
}

describe('L2-CLARIFY-CARD-1 defect 6 (ruling l2t1951 Q2 unit 1) — answered-row render leg after a cold reload', () => {
  it('a rehydrated thread [assistant card turn (restored), user answer] + a fresh mount renders ONE compact Answered row and ZERO live answer inputs', () => {
    render(<ChatLog {...props} messages={[restoredCardTurn(), rehydratedAnswerTurn()]} />)

    // The ONE compact Answered row carries BOTH the answer text and the question.
    const row = screen.getByTestId('chat-log-clarification-answered')
    expect(row).toHaveTextContent(`Use ${RAW_LABEL} for req-clofibrate.`)
    expect(row).toHaveTextContent(QUESTION)

    // ZERO live answer affordances: the picker (and its always-on search
    // input), the legacy-block option buttons, and the typed-arm card are ALL
    // gone from the DOM — the restored card turn is not answerable on reload.
    expect(document.querySelector('.message-log__clarification-picker')).toBeNull()
    expect(document.querySelector('input.message-log__clarification-search')).toBeNull()
    expect(document.querySelector('.chat-log-clarification')).toBeNull()
    expect(screen.queryByTestId('chat-log-request-req-clofibrate')).toBeNull()

    // Exactly ONE answered row (not one per request, not a live arm + a row).
    expect(document.querySelectorAll('[data-testid="chat-log-clarification-answered"]').length).toBe(1)
  })

  it('control: the SAME card shape LIVE (no restored flag) keeps its FULL answerable arm — the restored flag is the discriminator', () => {
    const liveCard: ChatMessage = {
      ...restoredCardTurn(),
      id: 'msg-live-2',
      restored: false,
      streamEvents: [{ type: 'status', message: 'Prompt received. Starting compiler pipeline...' }],
    }
    render(<ChatLog {...props} messages={[liveCard]} />)

    // The live card is NOT an answered row (no following user turn) and keeps
    // its answer affordance: the picker mounts (the real ClarificationPicker
    // renders its search input on a live material clarifier).
    expect(screen.queryByTestId('chat-log-clarification-answered')).toBeNull()
    expect(document.querySelector('input.message-log__clarification-search')).not.toBeNull()
  })
})
