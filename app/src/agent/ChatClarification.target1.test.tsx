/**
 * L2-CLARIFY-TARGET-1 (fix1) — app-side pins for the TARGET-WELL slot surface
 * (D2, D3a, D3b, D4 of adversarial l2t0230). The previous run shipped the app
 * side with NO committed test (D3a) and the single-request arm double-printed
 * the question for a `clarifyControl` request (D2). These pins make the mount,
 * the "never a silent default" rule, and the single-request arm non-vacuous.
 *
 * D2 — the bubble-suppression arm must key on the SAME extended render
 * decision as the render guard (ChatLog.tsx `requestRendersOwnedPrompt`).
 * For a single-request `clarifyControl` turn (n===1, options: []) the slot
 * renders the prompt AND the bubble must suppress its own copy — the prompt is
 * on screen EXACTLY ONCE (assert the node count, not a substring). At base the
 * guard was extended with `hasDeclaredSlot` but the bubble arm still keyed on
 * the base `requestRendersPrompt` -> the prompt printed TWICE (EXACT PROMPT
 * NODE COUNT = 2, the reviewer's probe).
 *
 * D3b — the grouped card's `<ClarifyWellTargetSlot>` arm is the ONLY per-slot
 * surface not passed `disabled`. When `disabled`, the slot's input + approve
 * must be disabled, matching the chip/picker/options/Submit arms.
 *
 * D4 — the slot validates through the ONE parity-pinned grammar, so it is
 * NEVER a silent default: empty text and non-address text (control_well, A99)
 * keep approve DISABLED (no auto-accept); a real address (A1:B3) enables it.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiClarificationRequest, ChatMessage } from '../types/ai'
import { ChatLog } from './ChatLog'
import { ChatClarificationCard } from './ChatClarificationCard'

// Deterministic fake picker (the single-request test uses menuProvider:'choice'
// so no picker renders; the grouped card test renders an options arm). Mock the
// picker to a no-op so the card mounts without the slash-resolver graph.
vi.mock('../event-editor/right-pane/ai/ClarificationPicker', () => ({
  ClarificationPicker: () => null,
  requestHasPicker: () => false,
}))

afterEach(cleanup)

const baseProps = { isStreaming: false, prompt: '', onPromptChange: vi.fn(), onSend: vi.fn(), onCancel: vi.fn(), onReview: vi.fn() }

// The live first-ask shape (useAiChat.ts:1543): the assistant bubble's
// `content` IS the first request's prompt.
const wellsRequest: AiClarificationRequest = {
  id: 'req-wells',
  kind: 'general',
  prompt: 'Which plate wells are the targets?',
  entityType: 'wells',
  menuProvider: 'choice', // no picker -> the declared slot is the answer surface
  options: [],
  slot: 'targetWells',
  clarifyControl: { kind: 'wells', question: 'Which plate wells are the targets?' },
}

function countExactPromptNodes(container: HTMLElement, prompt: string): number {
  return Array.from(container.querySelectorAll('p')).filter((el) => el.textContent === prompt).length
}

describe('D2: a single-request clarifyControl turn prints its prompt EXACTLY ONCE', () => {
  it('the prompt node count is 1 (not the bubble + slot double-print)', () => {
    const onClarificationPick = vi.fn()
    const message: ChatMessage = {
      id: 'm1',
      role: 'assistant',
      content: wellsRequest.prompt, // live first-ask: content === the prompt
      clarificationRequests: [wellsRequest], // n===1 -> single-request arm
      timestamp: 0,
    }
    const { container } = render(
      <ChatLog {...baseProps} onClarificationPick={onClarificationPick} messages={[message]} />,
    )
    // THE D2 assertion — an exact node count, not a substring:
    expect(countExactPromptNodes(container, wellsRequest.prompt)).toBe(1)
  })
})

describe('D3a/D4: the single-request TARGET-WELL slot mounts and is never a silent default', () => {
  it('mounts the slot for a kind:wells clarifyControl request (with onClarificationPick)', () => {
    const message: ChatMessage = {
      id: 'm1',
      role: 'assistant',
      content: wellsRequest.prompt,
      clarificationRequests: [wellsRequest],
      timestamp: 0,
    }
    render(<ChatLog {...baseProps} onClarificationPick={vi.fn()} messages={[message]} />)
    expect(screen.getByTestId('clarify-well-target-slot')).toBeTruthy()
    expect(screen.getByTestId('clarify-well-target')).toBeTruthy()
    expect(screen.getByTestId('clarify-well-target-approve')).toBeTruthy()
  })

  it('does NOT mount the slot when there is no onClarificationPick (nothing to answer with)', () => {
    const message: ChatMessage = {
      id: 'm1',
      role: 'assistant',
      content: wellsRequest.prompt,
      clarificationRequests: [wellsRequest],
      timestamp: 0,
    }
    render(<ChatLog {...baseProps} messages={[message]} />) // no onClarificationPick
    expect(screen.queryByTestId('clarify-well-target-slot')).toBeNull()
  })

  it('is never a silent default: empty + non-address + loose-column text keep approve DISABLED', () => {
    const onClarificationPick = vi.fn()
    const message: ChatMessage = {
      id: 'm1',
      role: 'assistant',
      content: wellsRequest.prompt,
      clarificationRequests: [wellsRequest],
      timestamp: 0,
    }
    render(<ChatLog {...baseProps} onClarificationPick={onClarificationPick} messages={[message]} />)
    const input = screen.getByTestId('clarify-well-target') as HTMLInputElement
    const approve = screen.getByTestId('clarify-well-target-approve') as HTMLButtonElement

    // empty -> disabled (the slot must not answer with a default)
    expect(approve.disabled).toBe(true)
    // non-address symbolic label -> disabled (control_well is not an address)
    fireEvent.change(input, { target: { value: 'control_well' } })
    expect(approve.disabled).toBe(true)
    // D4: the LOOSE column the old second parser accepted (A99) is now rejected
    fireEvent.change(input, { target: { value: 'A99' } })
    expect(approve.disabled).toBe(true)
    fireEvent.change(input, { target: { value: 'P99' } })
    expect(approve.disabled).toBe(true)
    // a real 96-plate range -> ENABLED
    fireEvent.change(input, { target: { value: 'A1:B3' } })
    expect(approve.disabled).toBe(false)
    // clicking approve sends the scalar (label === value); the server's ONE
    // parser expands it authoritatively. No silent default, no client array.
    fireEvent.click(approve)
    expect(onClarificationPick).toHaveBeenCalledTimes(1)
    const [sentText, answer, sentRequest] = onClarificationPick.mock.calls[0]!
    expect(sentRequest).toBe(wellsRequest)
    expect((answer as { value: string }).value).toBe('A1:B3')
    expect((answer as { label: string }).label).toBe('A1:B3')
    expect(typeof sentText).toBe('string')
  })
})

describe('D3b: the grouped card passes `disabled` to the TARGET-WELL slot arm', () => {
  const wellsReq: AiClarificationRequest = { ...wellsRequest, id: 'req-w2' }
  const paramReq: AiClarificationRequest = {
    id: 'req-p1',
    kind: 'general',
    prompt: 'What volume?',
    entityType: 'volumeUl',
    menuProvider: 'choice',
    options: [{ id: 'opt-1', label: '50 uL' }],
  }

  it('when disabled, the slot input + approve are disabled (matching the chip/picker/options/Submit arms)', () => {
    const submit = vi.fn()
    const { container } = render(
      <ChatClarificationCard
        requests={[wellsReq, paramReq]}
        turnKey="t1:req-w2|req-p1"
        shownPrompts={new Set()}
        disabled
        onClarificationSubmit={submit}
      />,
    )
    // the card + the slot arm are present (n===2 -> grouped card)
    expect(screen.getByTestId('chat-clarification-card')).toBeTruthy()
    const slot = screen.getByTestId('clarify-well-target-slot')
    const input = slot.querySelector<HTMLInputElement>('[data-testid="clarify-well-target"]')!
    const approve = slot.querySelector<HTMLButtonElement>('[data-testid="clarify-well-target-approve"]')!
    expect(input.disabled).toBe(true)
    expect(approve.disabled).toBe(true)
    // the OTHER per-slot surfaces also get disabled (the D3b consistency):
    const optionBtn = screen.getByTestId('chat-clarification-option-req-p1') as HTMLButtonElement
    expect(optionBtn.disabled).toBe(true)
    const cardSubmit = screen.getByTestId('chat-clarification-submit') as HTMLButtonElement
    expect(cardSubmit.disabled).toBe(true)
    // the container is non-vacuous (the card actually rendered)
    expect(container.querySelector('.chat-clarification-card')).toBeTruthy()
  })

  it('when NOT disabled, the slot input is enabled and a real address enables approve', () => {
    const submit = vi.fn()
    render(
      <ChatClarificationCard
        requests={[wellsReq, paramReq]}
        turnKey="t2:req-w2|req-p1"
        shownPrompts={new Set()}
        onClarificationSubmit={submit}
      />,
    )
    const slot = screen.getByTestId('clarify-well-target-slot')
    const input = slot.querySelector<HTMLInputElement>('[data-testid="clarify-well-target"]')!
    const approve = slot.querySelector<HTMLButtonElement>('[data-testid="clarify-well-target-approve"]')!
    expect(input.disabled).toBe(false)
    // empty text -> approve disabled (never a silent default), input still editable
    expect(approve.disabled).toBe(true)
    fireEvent.change(input, { target: { value: 'A1:B3' } })
    expect(approve.disabled).toBe(false)
  })
})
