/**
 * L2-SUITE-A-uifix3 [D3-CHROME] RED (regate-5 gate defect 3, the in-scope
 * chrome slice) — on reload the clarification CARDS do not restore but their
 * SEARCH INPUTS DO: 8 bare unlabelled
 * <input placeholder="Search labware…"> boxes float in the restored
 * transcript (visually an unlabelled search box above "You …" with no
 * question attached). Dead/duplicative chrome on a touched surface (SOP
 * rule 12).
 *
 * Root cause (read, not guessed):
 *   - useAiChat's thread hydrate (shared/hooks/useAiChat.ts:682-690)
 *     restores ONLY the legacy `clarification` field — never
 *     `clarificationRequests`, never `streamEvents`. The persist effect
 *     (727) saves only `clarification`. So a restored menu-backed
 *     clarifier (the gate's "bead beating plate" `/l` card) arrives as a
 *     message with `clarification` (menuProvider '/l', options: [], query)
 *     and NO `clarificationRequests`.
 *   - ChatLog's legacy block arm (agent/ChatLog.tsx:118-131) sees
 *     options.length === 0 + requestHasPicker(true) and renders the real
 *     ClarificationPicker — which ALWAYS renders its search input (the
 *     answer affordance; only the popover is open-gated).
 *   - The question paragraph is skipped because `promptDiffers` is false
 *     (the done arm sets message.content to clarification.prompt, so the
 *     restored content === the prompt) — leaving a bare, unlabelled search
 *     box with no question.
 *
 * THE FIX (the scope ruling's "render neither for historical card turns —
 * inputs belong to live staged cards only"): the thread hydrate marks each
 * restored message `restored: true`; ChatLog's legacy block arm then
 * renders NEITHER the picker NOR the option buttons for such a message —
 * only the question text (the message content, already rendered in the
 * main loop) survives. The LIVE answer-card shape (a legacy-only turn that
 * was produced in this session, or any turn still carrying its typed
 * requests) is byte-unchanged — its search input / option buttons still
 * render and stay answerable.
 *
 * The `restored` flag (not `streamEvents` presence, not an id prefix) is the
 * discriminator: a live legacy-only turn that never populates
 * `clarificationRequests` legitimately renders the legacy block arm (the
 * bothfields control pins exactly that), and it carries no `restored` flag —
 * so keying on the explicit restore marker suppresses ONLY thread-restored
 * turns and never a live one.
 *
 * Scope ruling (binding): D3-CHROME ONLY. D3-THREADING (cross-deck thread
 * sharing), aiThreadClient.ts, AiThreadStore.ts are OFF-LIMITS.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiClarificationRequest, ChatMessage } from '../types/ai'
import { ChatLog } from './ChatLog'

// Render the REAL ClarificationPicker (the defect is its always-on search
// input). Stub only its data dependencies so the closed-state mount is
// deterministic and cheap in jsdom (the same seam the D5 uifix3 pin uses).
const resolveMaterial = vi.fn()
const resolveLabware = vi.fn()
const resolveEquipment = vi.fn()
// Paths are RELATIVE TO THIS TEST (app/src/agent/), not to ClarificationPicker.
vi.mock('../shared/taptab/slashMenu/resolvers', () => ({
  resolveMaterial: (q: string, c: unknown) => resolveMaterial(q, c),
  resolveLabware: (q: string, c: unknown) => resolveLabware(q, c),
  resolveEquipment: (q: string, c: unknown) => resolveEquipment(q, c),
  // L2-CLARIFY-CARD-1 (P5): the stub now spells the PRODUCT one-source
  // sentence (copy in sync; behaviour pins untouched).
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

const props = { isStreaming: false, prompt: '', onPromptChange: vi.fn(), onSend: vi.fn(), onCancel: vi.fn(), onReview: vi.fn() }
const userMsg = (id: string, text: string): ChatMessage => ({ id, role: 'user', content: text, timestamp: 0 })

/** The gate's card shape: a menu-backed (labware) clarifier — options [], a
 *  seeded query, the question as the content (content === prompt, the done
 *  arm's shape). This is exactly what the thread hydrate restores. */
const beadPrompt =
  'The draft names "bead beating plate" and the lab spine could not bind it (ambiguous-noun). Choose what it is.'

/** A THREAD-RESTORED historical card turn: the hydrate's shape (only the
 *  legacy `clarification`, marked `restored`, no clarificationRequests). */
function restoredBeadTurn(): ChatMessage {
  return {
    id: 'persisted-3-1714300000000',
    role: 'assistant',
    content: beadPrompt,
    timestamp: 1714300000000,
    restored: true,
    clarification: {
      id: 'req-bead',
      prompt: beadPrompt,
      entityType: 'labware',
      menuProvider: '/l',
      query: 'bead beating plate',
      options: [],
    },
  }
}

/** A LIVE (this-session) legacy-only card turn: the same picker shape but NOT
 *  thread-restored (no `restored` flag) — the bothfields control's shape. */
function liveBeadTurn(): ChatMessage {
  return {
    id: 'msg-7-assistant',
    role: 'assistant',
    content: beadPrompt,
    timestamp: 1714300000000,
    streamEvents: [{ type: 'status', message: 'Prompt received. Starting compiler pipeline...' }],
    clarification: {
      id: 'req-bead',
      prompt: beadPrompt,
      entityType: 'labware',
      menuProvider: '/l',
      query: 'bead beating plate',
      options: [],
    },
  }
}

function searchInputs(): NodeListOf<HTMLElement> {
  return document.querySelectorAll('input.message-log__clarification-search')
}
function labwareSearchInputs(): NodeListOf<HTMLElement> {
  return document.querySelectorAll('input[placeholder^="Search labware"]')
}

describe('ChatLog — L2-SUITE-A-uifix3 D3-CHROME: a restored transcript renders no bare card search inputs', () => {
  it('RED pin: a thread-restored historical card turn renders NO bare search input — the question text only', () => {
    render(
      <ChatLog
        {...props}
        onClarificationPick={vi.fn()}
        messages={[userMsg('u', 'Place a bead beating plate on the deck.'), restoredBeadTurn()]}
      />,
    )

    // THE D3-CHROME CLAIM: the gate's 8 bare <input placeholder="Search
    // labware…"> boxes are GONE from the restored transcript — no picker
    // input, no option buttons, no mint row for a historical card turn.
    expect(searchInputs().length).toBe(0)
    expect(labwareSearchInputs().length).toBe(0)
    expect(document.querySelector('.message-log__clarification-picker')).toBeNull()
    // No clarification affordance block at all (picker or option list).
    expect(document.querySelectorAll('.chat-log-clarification').length).toBe(0)

    // PRESERVED: the QUESTION (the message content) still reads in the
    // transcript — "render neither" suppresses the inputs, not the record of
    // what was asked.
    expect(screen.getByText(beadPrompt)).toBeTruthy()
  })

  it('a restored option-bearing (choice) historical card turn renders no option buttons either (no inputs for historical turns)', () => {
    const choicePrompt = 'The declared composition fractions sum to 110 percent. How should the fractions be read?'
    const restoredChoiceTurn: ChatMessage = {
      id: 'persisted-5-1714300001000',
      role: 'assistant',
      content: choicePrompt,
      timestamp: 1714300001000,
      restored: true,
      clarification: {
        id: 'req-choice',
        prompt: choicePrompt,
        entityType: 'material',
        menuProvider: 'choice',
        options: [
          { id: 'opt-a', label: 'Whole-mixture supplement' },
          { id: 'opt-b', label: 'Preceding-noun in-house recipe' },
        ],
      },
    }
    render(
      <ChatLog
        {...props}
        onClarificationPick={vi.fn()}
        messages={[userMsg('u2', 'Make the mix.'), restoredChoiceTurn]}
      />,
    )

    // A historical turn's answer affordance (the option buttons) is
    // suppressed — inputs belong to live staged cards only.
    expect(document.querySelectorAll('.chat-log-clarification').length).toBe(0)
    expect(screen.queryByRole('button', { name: '1. Whole-mixture supplement' })).toBeNull()
    expect(screen.queryByRole('button', { name: '2. Preceding-noun in-house recipe' })).toBeNull()
    // The question (content) still reads.
    expect(screen.getByText(choicePrompt)).toBeTruthy()
  })

  it('control (PRESERVED): a LIVE legacy-only card turn still renders its answerable search input', () => {
    render(
      <ChatLog
        {...props}
        onClarificationPick={vi.fn()}
        messages={[userMsg('u3', 'Place a bead beating plate on the deck.'), liveBeadTurn()]}
      />,
    )

    // NOT thread-restored -> the legacy block arm still mounts the real
    // picker: the seeded, answerable search input is present (the fix must
    // not over-suppress a live card).
    expect(searchInputs().length).toBe(1)
    expect(labwareSearchInputs().length).toBe(1)
    const input = document.querySelector('input.message-log__clarification-search') as HTMLInputElement
    expect(input.value).toBe('bead beating plate')
    expect(document.querySelectorAll('.chat-log-clarification').length).toBe(1)
  })

  it('control (PRESERVED): a typed-requests card (the canonical live shape) still renders its picker', () => {
    const beadRequest: AiClarificationRequest = {
      id: 'req-bead-typed',
      kind: 'labware',
      prompt: beadPrompt,
      entityType: 'labware',
      menuProvider: '/l',
      query: 'bead beating plate',
      options: [],
    }
    const typedTurn: ChatMessage = {
      id: 'msg-9-assistant',
      role: 'assistant',
      content: beadPrompt,
      timestamp: 1714300002000,
      streamEvents: [{ type: 'status', message: 'Prompt received. Starting compiler pipeline...' }],
      clarificationRequests: [beadRequest],
      clarification: {
        id: 'req-bead-typed',
        prompt: beadPrompt,
        entityType: 'labware',
        menuProvider: '/l',
        query: 'bead beating plate',
        options: [],
      },
    }
    render(
      <ChatLog
        {...props}
        onClarificationPick={vi.fn()}
        messages={[userMsg('u4', 'Place a bead beating plate on the deck.'), typedTurn]}
      />,
    )

    // The typed arm is canonical for a live both-fields message and renders
    // exactly ONE answerable picker (the uifix1 F1 contract) — unaffected by
    // the restore guard (no `restored` flag).
    expect(searchInputs().length).toBe(1)
    expect(document.querySelectorAll('.chat-log-clarification').length).toBe(1)
  })
})
