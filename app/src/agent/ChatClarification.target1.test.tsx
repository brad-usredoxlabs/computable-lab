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
import { useEffect, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiClarificationRequest, ChatMessage } from '../types/ai'
import { PLATE_CONFIGS } from '../types/plate'
import { WellSelectionProvider, useWellSelection } from '../shared/context/WellSelectionContext'
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

/** Seeds the well selection context with a fixed set of wells (the D3
    affordance pins render the slot inside a real WellSelectionProvider —
    `useOptionalWellSelection` is null-safe, so a real provider with a real
    selection is the faithful harness). `wells` defaults to the fix2 seed
    (A2/A3/B2/B3 — a full 2×2 rectangle, deliberately unsorted → the button
    sorts). */
function SelectionSeeder({ children, wells }: { children: ReactNode; wells?: string[] }) {
  const { selectWells } = useWellSelection()
  useEffect(() => {
    selectWells(wells ?? ['B2', 'A2', 'B3', 'A3']) // deliberately unsorted → the button sorts
  }, [selectWells, wells])
  return <>{children}</>
}

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
    fireEvent.change(input, { target: { value: 'A1:B3' }})
    expect(approve.disabled).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// D3 (fix2, adversarial l2t0745 defect 3; re-pinned fix run 4 / D2 —
// adversarial l2t0937 DEFECT 2): the "use selected wells" affordance leads to
// an ANSWER with the ONE grammar. When `useOptionalWellSelection()` returns a
// non-empty selection that forms ONE full rectangular range the ONE grammar
// accepts, a "Use selected wells (…)" button FILLS the input with the
// CANONICAL RANGE SCALAR (`A2:B3`) — the slot's own gate accepts it, so the
// scientist's own approve is the existing `onAnswer({requestId,label,value})`
// scalar path (it FILLS, it does NOT answer: `onAnswer` is never called from
// the click). When the selection does NOT form one rectangular range (gaps,
// an L-shape) the button does NOT render at all — never a silent no-op that
// fills a comma list the slot's own gate rejects, never a second client-side
// expansion grammar. With no context (the run host) the button simply does not
// render — and `useOptionalWellSelection()` is no longer a dead export.
// ---------------------------------------------------------------------------
describe('D3: the "use selected wells" affordance leads to an ANSWER with the ONE grammar', () => {
  it('no selection context ⇒ the button does not render (run host)', () => {
    const message: ChatMessage = {
      id: 'm1',
      role: 'assistant',
      content: wellsRequest.prompt,
      clarificationRequests: [wellsRequest],
      timestamp: 0,
    }
    render(<ChatLog {...baseProps} onClarificationPick={vi.fn()} messages={[message]} />)
    expect(screen.getByTestId('clarify-well-target-slot')).toBeTruthy()
    expect(screen.queryByTestId('clarify-well-target-use-selected')).toBeNull()
  })

  it('empty selection ⇒ the button does not render', () => {
    const message: ChatMessage = {
      id: 'm1',
      role: 'assistant',
      content: wellsRequest.prompt,
      clarificationRequests: [wellsRequest],
      timestamp: 0,
    }
    render(
      <WellSelectionProvider plateConfig={PLATE_CONFIGS['96']}>
        <ChatLog {...baseProps} onClarificationPick={vi.fn()} messages={[message]} />
      </WellSelectionProvider>,
    )
    expect(screen.getByTestId('clarify-well-target-slot')).toBeTruthy()
    expect(screen.queryByTestId('clarify-well-target-use-selected')).toBeNull()
  })

  it('a rectangular selection ⇒ the button names the literal that WILL be filled (A2:B3), enabled; fill → approve ENABLED; answer = the literal', () => {
    const onClarificationPick = vi.fn()
    const message: ChatMessage = {
      id: 'm1',
      role: 'assistant',
      content: wellsRequest.prompt,
      clarificationRequests: [wellsRequest],
      timestamp: 0,
    }
    render(
      <WellSelectionProvider plateConfig={PLATE_CONFIGS['96']}>
        <SelectionSeeder>
          <ChatLog {...baseProps} onClarificationPick={onClarificationPick} messages={[message]} />
        </SelectionSeeder>
      </WellSelectionProvider>,
    )
    const useSelected = screen.getByTestId('clarify-well-target-use-selected') as HTMLButtonElement
    // fix run 4 / D2 CONFORM (ruling Q2 option (a)): the label names the
    // RANGE LITERAL the fill will write — the sorted top-left:bottom-right
    // corners of the selection's rectangle — never the selection itself:
    expect(useSelected.textContent).toBe('Use selected wells (A2:B3)')
    expect(useSelected.disabled).toBe(false) // ENABLED: the fill leads to an answer
    // no reason line on a rectangular selection (the verbatim reason is the
    // non-rectangular state's only chrome):
    expect(screen.queryByTestId('clarify-well-target-use-selected-reason')).toBeNull()
    const input = screen.getByTestId('clarify-well-target') as HTMLInputElement
    const approve = screen.getByTestId('clarify-well-target-approve') as HTMLButtonElement
    expect(approve.disabled).toBe(true) // empty input: never a silent default
    // THE FILL: clicking fills the input with the ONE grammar's literal
    // (a rectangular range), not a comma list the slot's gate rejects:
    fireEvent.click(useSelected)
    expect(input.value).toBe('A2:B3')
    // … and the fill did NOT answer: no callback fired (the answer is the
    // scientist's own approve of the address the fill wrote):
    expect(onClarificationPick).not.toHaveBeenCalled()
    // THE ANSWER PATH: the filled literal passes the slot's OWN gate, so
    // approve becomes ENABLED (fix run 4 / D2: the fill leads to an answer):
    expect(approve.disabled).toBe(false)
    // … and approving sends the literal through the EXISTING onAnswer
    // scalar path (label === value; the server's ONE parser expands it
    // authoritatively):
    fireEvent.click(approve)
    expect(onClarificationPick).toHaveBeenCalledTimes(1)
    const [, answer] = onClarificationPick.mock.calls[0]!
    expect((answer as { value: string }).value).toBe('A2:B3')
    expect((answer as { label: string }).label).toBe('A2:B3')
  })

  it('a single-well selection ⇒ the button names the bare address (B2), enabled; fill → approve ENABLED', () => {
    // Ruling Q2 case 3 (the N×1 degenerate rectangle): label `Use selected
    // wells (B2)`, the fill writes `B2` (never `B2:B2`), approve enabled.
    const onClarificationPick = vi.fn()
    const message: ChatMessage = {
      id: 'm1',
      role: 'assistant',
      content: wellsRequest.prompt,
      clarificationRequests: [wellsRequest],
      timestamp: 0,
    }
    render(
      <WellSelectionProvider plateConfig={PLATE_CONFIGS['96']}>
        <SelectionSeeder wells={['B2']}>
          <ChatLog {...baseProps} onClarificationPick={onClarificationPick} messages={[message]} />
        </SelectionSeeder>
      </WellSelectionProvider>,
    )
    const useSelected = screen.getByTestId('clarify-well-target-use-selected') as HTMLButtonElement
    expect(useSelected.textContent).toBe('Use selected wells (B2)')
    expect(useSelected.disabled).toBe(false)
    const input = screen.getByTestId('clarify-well-target') as HTMLInputElement
    const approve = screen.getByTestId('clarify-well-target-approve') as HTMLButtonElement
    fireEvent.click(useSelected)
    expect(input.value).toBe('B2')
    expect(onClarificationPick).not.toHaveBeenCalled() // fill, not answer
    expect(approve.disabled).toBe(false) // the bare address passes the slot's OWN gate
  })

  it('a non-rectangular selection (L-shape) ⇒ the button renders DISABLED with the verbatim reason; a click never writes the input', () => {
    // fix run 4 / D2 CONFORM (ruling Q2 option (a)): a non-rectangular
    // selection does NOT hide the affordance — it renders it `disabled`,
    // naming the selection, with the ruling's reason line VERBATIM. A
    // disabled button can never be clicked, so a previously typed value can
    // never be destroyed (the destruction half of the defect is eliminated
    // by construction).
    const onClarificationPick = vi.fn()
    const message: ChatMessage = {
      id: 'm1',
      role: 'assistant',
      content: wellsRequest.prompt,
      clarificationRequests: [wellsRequest],
      timestamp: 0,
    }
    render(
      <WellSelectionProvider plateConfig={PLATE_CONFIGS['96']}>
        <SelectionSeeder wells={['A2', 'A3', 'C1']}>
          <ChatLog {...baseProps} onClarificationPick={onClarificationPick} messages={[message]} />
        </SelectionSeeder>
      </WellSelectionProvider>,
    )
    const useSelected = screen.getByTestId('clarify-well-target-use-selected') as HTMLButtonElement
    // RENDERED (not hidden), naming the selection …
    expect(useSelected).not.toBeNull()
    expect(useSelected.textContent).toBe('Use selected wells (A2, A3, C1)')
    // … and DISABLED (the selection is not one full rectangular range):
    expect(useSelected.disabled).toBe(true)
    // … and the ruling's reason line, VERBATIM (binding wording):
    const reason = screen.getByTestId('clarify-well-target-use-selected-reason')
    expect(reason.textContent).toBe(
      "Selection isn't a rectangular range — type it as a well address or range (e.g. A2:B3).",
    )
    // The input is NOT written by the button. Pre-type `A2` and fire a click
    // (testing-library fires on disabled elements): the value SURVIVES and
    // approve STAYS enabled for the scientist's own typed value:
    const input = screen.getByTestId('clarify-well-target') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'A2' } })
    expect(input.value).toBe('A2')
    const approve = screen.getByTestId('clarify-well-target-approve') as HTMLButtonElement
    expect(approve.disabled).toBe(false)
    fireEvent.click(useSelected)
    expect(input.value).toBe('A2') // unchanged — never destroyed
    expect(approve.disabled).toBe(false) // still enabled for the typed A2
    expect(onClarificationPick).not.toHaveBeenCalled() // the affordance never answers
    // No comma list is ever written into the input:
    expect(input.value).not.toContain(',')
  })
})

// ---------------------------------------------------------------------------
// D2 (fix2, adversarial l2t0745 defect 2) at the SURFACE: the slot runs
// `expandWellAddressLiteral(text) !== null` on EVERY keystroke in render.
// Before the fix, "A1:ZZZ99" blocked the UI ~1.8 s per keystroke and
// "A1:ZZZZ999" threw `RangeError: Set maximum size exceeded` OUT OF render
// (React has no guard — the chat pane died). After the fix the endpoint gate
// rejects these in O(1) before the ONE parser runs: the slot renders
// (unmounted = pane dead), approve stays disabled, and no throw escapes.
// ---------------------------------------------------------------------------
describe('D2: the slot never throws out of render on unbounded range text', () => {
  const message: ChatMessage = {
    id: 'm1',
    role: 'assistant',
    content: wellsRequest.prompt,
    clarificationRequests: [wellsRequest],
    timestamp: 0,
  }

  it.each(['A1:ZZ99', 'A1:ZZZ99', 'A1:ZZZZ999'])(
    'typing %s on the keystroke render path does not throw and keeps approve disabled',
    (input) => {
      render(<ChatLog {...baseProps} onClarificationPick={vi.fn()} messages={[message]} />)
      const el = screen.getByTestId('clarify-well-target') as HTMLInputElement
      const approve = screen.getByTestId('clarify-well-target-approve') as HTMLButtonElement
      // simulate the keystrokes of the input (each change re-runs render and
      // the O(1) endpoint check — pre-fix the last one threw / blocked ~2.6 s):
      const chars = input.split('')
      let typed = ''
      for (const char of chars) {
        typed += char
        expect(() => fireEvent.change(el, { target: { value: typed } })).not.toThrow()
      }
      // the pane is still alive (the slot re-rendered) and the value is the
      // typed text (nothing swallowed a render):
      expect(el.value).toBe(input)
      expect(screen.getByTestId('clarify-well-target-slot')).toBeTruthy()
      // and the grammar REJECTED the text: approve stays disabled:
      expect(approve.disabled).toBe(true)
    },
  )
})
