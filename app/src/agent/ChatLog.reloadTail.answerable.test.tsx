// @vitest-environment jsdom
/**
 * L2-P1-RELOAD-CLARIFIER-1 (unit 1, tailanswer) — the thread-restored
 * clarification turn that is UNANSWERED and is the TAIL of the transcript
 * must render its live answer surface again (the option buttons, or the
 * menu picker), while every historical or already-answered restored turn
 * still renders no inputs.
 *
 * Root cause (measured at base 4c9ea6f3, recon prompt-1 R1-7,
 * shots/63+65): the useAiChat getThread hydrate already rides the whole
 * clarification object back (useAiChat.ts:1091 — menuProvider/query/options
 * included) and stamps EVERY restored message `restored: true`
 * (useAiChat.ts:1118); ChatLog treated that flag as "historical, never
 * answerable" (renderClarificationBlock's unconditional
 * `if (message.restored) return null`, the D3-CHROME guard from
 * L2-SUITE-A-uifix3 that killed the eight bare "Search labware…" boxes).
 * Both halves were right; together they made the OPEN question
 * unreachable after a reload — a pending intent that is never a record
 * (context §2.6: restored on reload, never gets a record id) being
 * painted as though it were closed.
 *
 * THE FIX (render side only): a restored turn keeps its answer surface
 * only when it is UNANSWERED (the existing adjacency rule
 * isClarificationAnswered) AND is the last message. Nothing new is
 * authored, no persisted shape changes, no append, no id minted, no
 * server call — the answer is sent only when the person picks.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ChatMessage } from '../types/ai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatLog } from './ChatLog'

// Render the REAL ClarificationPicker (case (b) asserts its search input
// mounts). Stub only its data dependencies so the closed-state mount is
// deterministic and cheap in jsdom (the same seam ChatLog.d3chrome.uifix3
// and the answeredrow pin use). Paths are RELATIVE TO THIS TEST
// (app/src/agent/).
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

const props = { isStreaming: false, prompt: '', onPromptChange: vi.fn(), onSend: vi.fn(), onCancel: vi.fn(), onReview: vi.fn() }
const userMsg = (id: string, text: string): ChatMessage => ({ id, role: 'user', content: text, timestamp: 0 })

/** A THREAD-RESTORED unanswered option-bearing turn (the hydrate's shape:
 *  legacy `clarification` with its options, marked `restored`, no
 *  clarificationRequests). */
function restoredOptionsTurn(): ChatMessage {
  return {
    id: 'persisted-3-1714300000000',
    role: 'assistant',
    content: 'Which definition?',
    timestamp: 1714300000000,
    restored: true,
    clarification: {
      id: 'req-3',
      prompt: 'Which definition?',
      entityType: 'material',
      menuProvider: 'choice',
      options: [
        { id: 'o1', label: 'Definition — Generic 96-Well Deep Well Plate' },
        { id: 'o2', label: 'Search the catalogue' },
      ],
    },
  }
}

/** A THREAD-RESTORED unanswered MENU-BACKED turn (options [], a provider,
 *  the query) — the shape the recon's third question carried. */
function restoredMenuTurn(): ChatMessage {
  return {
    id: 'persisted-3-1714300000000',
    role: 'assistant',
    content: 'Which deepwell plate?',
    timestamp: 1714300000000,
    restored: true,
    clarification: {
      id: 'req-3',
      prompt: 'Which deepwell plate?',
      entityType: 'labware',
      menuProvider: '/l',
      query: 'deepwell',
      options: [],
    },
  }
}

describe('L2-P1-RELOAD-CLARIFIER-1 (tailanswer) — a restored UNANSWERED tail turn keeps its answer surface', () => {
  it('(a) a restored option-bearing turn at the tail renders its option buttons and answers through onClarificationPick', () => {
    const onPick = vi.fn()
    render(
      <ChatLog
        {...props}
        onClarificationPick={onPick}
        messages={[userMsg('u', 'Place a 96-well deepwell plate on the deck.'), restoredOptionsTurn()]}
      />,
    )

    // Both option buttons render on the restored tail turn.
    const first = screen.getByRole('button', { name: '1. Definition — Generic 96-Well Deep Well Plate' })
    expect(screen.getByRole('button', { name: '2. Search the catalogue' })).toBeTruthy()
    // Picking advances the turn EXACTLY ONCE through the existing sink —
    // requestId from the clarification, optionId from the option.
    fireEvent.click(first)
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick.mock.calls[0][1]).toMatchObject({ requestId: 'req-3', optionId: 'o1' })
    // Rendering itself appended nothing: the pick is the only event.
    expect(onPick).toHaveBeenCalledTimes(1)
  })

  it('(b) the same position, menu-backed, mounts the ClarificationPicker (its search input)', () => {
    render(
      <ChatLog
        {...props}
        onClarificationPick={vi.fn()}
        messages={[userMsg('u', 'Place a 96-well deepwell plate on the deck.'), restoredMenuTurn()]}
      />,
    )

    // The picker mounts: its always-on search input (the answer affordance)
    // is present, seeded with the query, inside the clarification block.
    const input = document.querySelector('input.message-log__clarification-search') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.value).toBe('deepwell')
    expect(document.querySelector('.message-log__clarification-picker')).not.toBeNull()
    expect(document.querySelectorAll('.chat-log-clarification').length).toBe(1)
  })

  it('(c) control: the SAME restored menu-backed turn FOLLOWED BY another message renders NO input (historical stays suppressed)', () => {
    render(
      <ChatLog
        {...props}
        onClarificationPick={vi.fn()}
        messages={[userMsg('u', 'Place a 96-well deepwell plate on the deck.'), restoredMenuTurn(), userMsg('u2', 'ok')]}
      />,
    )

    // Not the tail -> the D3-CHROME suppression stands: no picker, no search
    // input, no option block for the historical turn.
    expect(document.querySelector('input.message-log__clarification-search')).toBeNull()
    expect(document.querySelector('.message-log__clarification-picker')).toBeNull()
    expect(document.querySelectorAll('.chat-log-clarification').length).toBe(0)
  })
})
