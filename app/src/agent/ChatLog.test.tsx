import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '../types/ai'
import { ChatLog } from './ChatLog'

// ChatLog reuses the exported clarificationAnswerPrompt from AiTabPanel, whose
// import graph reaches pdfjs-dist; mock it so jsdom doesn't crash on DOMMatrix
// (same proven pattern as AiTabPanel.test.tsx).
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: 0, fingerprints: [''], getPage: () => Promise.resolve(null), destroy: () => undefined }), destroy: () => undefined })),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class { render() { return Promise.resolve() } },
}))

afterEach(cleanup)
const props = { isStreaming: false, prompt: '', onPromptChange: vi.fn(), onSend: vi.fn(), onCancel: vi.fn(), onReview: vi.fn() }
const message = (id: string, role: ChatMessage['role'], content = id): ChatMessage => ({ id, role, content, timestamp: 0 })
function setup() {
  const view = render(<ChatLog {...props} messages={[]} />)
  const log = screen.getByRole('log', { name: 'Conversation' })
  let height = 1000
  let viewportHeight = 300
  Object.defineProperties(log, { clientHeight: { get: () => viewportHeight }, scrollHeight: { get: () => height } })
  return { ...view, log, grow: () => { height += 200 }, shrink: () => { viewportHeight -= 100 } }
}

describe('sequence conversation scrolling', () => {
  it('keeps the originating user request when an older proposal is reviewed again', () => {
    const proposal={operation:'create_oligo',sequence:{residues:'AATGGCATGACTGAGTCGATG'}}
    const onReview=vi.fn()
    const request='Add primer ATGCGCGTAGGTCTGATGCTAGT'
    render(<ChatLog {...props} onReview={onReview} messages={[message('user','user',request),{...message('proposal','assistant'),sequenceProposal:proposal},message('later','user','An unrelated follow-up')]} />)
    fireEvent.click(screen.getByRole('button',{name:'Review action'}))
    expect(onReview).toHaveBeenCalledWith(proposal,request)
  })
  it('opens hydrated history at the bottom and follows streamed text with the same message ID', () => {
    const { rerender, log, grow } = setup()
    const history = [message('request', 'user'), message('reply', 'assistant', 'First words')]
    rerender(<ChatLog {...props} messages={history} />)
    expect(log.scrollTop).toBe(log.scrollHeight)
    grow()
    rerender(<ChatLog {...props} messages={[history[0], { ...history[1], content: 'An expanding streamed reply' }]} />)
    expect(log.scrollTop).toBe(log.scrollHeight)
  })

  it('keeps the reader’s position when scrolled up and returns to live replies on request', () => {
    const { rerender, log, grow } = setup()
    rerender(<ChatLog {...props} messages={[message('request', 'user')]} />)
    log.scrollTop = 150
    fireEvent.scroll(log)
    grow()
    rerender(<ChatLog {...props} messages={[message('request', 'user'), message('reply', 'assistant')]} />)
    expect(log.scrollTop).toBe(150)
    fireEvent.click(screen.getByRole('button', { name: 'Latest messages' }))
    expect(log.scrollTop).toBe(log.scrollHeight)
    expect(screen.queryByRole('button', { name: 'Latest messages' })).toBeNull()
  })

  it('returns to the bottom when the user sends a new prompt while reading history', () => {
    const { rerender, log, grow } = setup()
    rerender(<ChatLog {...props} messages={[message('old-request', 'user')]} />)
    log.scrollTop = 0
    fireEvent.scroll(log)
    grow()
    rerender(<ChatLog {...props} messages={[message('old-request', 'user'), message('new-request', 'user')]} />)
    expect(log.scrollTop).toBe(log.scrollHeight)
    expect(screen.queryByRole('button', { name: 'Latest messages' })).toBeNull()
  })

  it('keeps following when a pane resize emits a scroll event before layout observation', () => {
    const { rerender, log, shrink } = setup()
    rerender(<ChatLog {...props} messages={[message('request', 'user')]} />)
    log.scrollTop = log.scrollHeight - log.clientHeight
    shrink()
    fireEvent.scroll(log)
    expect(log.scrollTop).toBe(log.scrollHeight)
    expect(screen.queryByRole('button', { name: 'Latest messages' })).toBeNull()
  })

  it('answers a menu-backed clarifier through the picker (the real "unknown material" shape)', () => {
    // Shape persisted by the server for the live clarifier:
    // {options: [], menuProvider: '/m', query, allowCreateLocal: true}
    render(<ChatLog {...props} onClarificationPick={vi.fn()} messages={[
      { ...message('clarify', 'assistant', 'The draft names "unobtainium" — choose what it is.'),
        clarification: {
          id: 'unresolved-1',
          prompt: 'The draft names "unobtainium" — choose what it is.',
          entityType: 'material',
          menuProvider: '/m',
          query: 'unobtainium',
          allowCreateLocal: true,
          options: [],
        } },
    ]} />)
    expect(document.querySelector('.message-log__clarification-picker')).not.toBeNull()
    expect(document.querySelector('.chat-log-clarification')).not.toBeNull()
    // No empty option list is ever rendered.
    expect(document.querySelector('.chat-log-clarification-options')).toBeNull()
  })

  it('never renders an empty clarification box when the clarifier carries no options', () => {
    // Reproduced live (phone, 2026-10-17): a typed clarifier left a bordered,
    // EMPTY box under the question — the mangled grey rectangle.
    render(<ChatLog {...props} onClarificationPick={vi.fn()} messages={[
      { ...message('clarify', 'assistant', 'The draft names "unobtainium" — choose what it is.'),
        clarification: { id: 'clar-1', prompt: 'The draft names "unobtainium" — choose what it is.', entityType: 'material', options: [] } },
    ]} />)
    expect(document.querySelector('.chat-log-clarification')).toBeNull()
    expect(screen.getByRole('log', { name: 'Conversation' })).toHaveTextContent('unobtainium')
  })

  it('renders a typed clarification request with its menu options', () => {
    const onClarificationPick = vi.fn()
    render(<ChatLog {...props} onClarificationPick={onClarificationPick} messages={[
      { ...message('clarify', 'assistant', 'Which material?'),
        clarificationRequests: [{
          id: 'req-1', kind: 'general', prompt: 'Which material?', entityType: 'material',
          menuProvider: 'choice',
          options: [{ id: 'o1', label: 'Clofibrate 1 mM' }, { id: 'o2', label: 'DMSO' }],
        }] },
    ]} />)
    // BGATE-FIX D3 (fix3, card-owns): the typed card OWNS the prompt <p> and
    // the bubble (content === the prompt) is suppressed, so the question is on
    // screen EXACTLY ONCE (the card's <p>), never twice. Pre-fix the bubble
    // owned the <p> and the card deduped (box.querySelector('p') null); the
    // owner moved to the card so it is deterministic across the bubble's
    // wording (advc-c3 D1), and the bubble suppresses its verbatim copy (advc-c3
    // D2). The single-click answer path is unchanged below.
    const log = screen.getByRole('log', { name: 'Conversation' })
    const questionCount = () =>
      Array.from(log.querySelectorAll('p')).filter((p) => p.textContent === 'Which material?').length
    expect(questionCount()).toBe(1)
    const box = screen.getByTestId('chat-log-request-req-1')
    expect(box.querySelector('p')?.textContent).toBe('Which material?')
    fireEvent.click(screen.getByRole('button', { name: '1. Clofibrate 1 mM' }))
    expect(onClarificationPick).toHaveBeenCalledTimes(1)
  })

  it('renders a clarification turn and answers it as the next chat turn (lane-2 answer text)', () => {
    const onClarificationPick = vi.fn()
    render(<ChatLog {...props} onClarificationPick={onClarificationPick} messages={[
      message('user', 'user', 'Which enzyme should cut this?'),
      { ...message('clarify', 'assistant'), content: 'Which enzyme should cut this?', clarification: {
        id: 'clar-1', prompt: 'Which enzyme should cut this?', entityType: 'sequence',
        options: [{ id: 'opt-1', label: 'EcoRI' }, { id: 'opt-2', label: 'BamHI' }],
      } },
    ]} />)
    const log = screen.getByRole('log', { name: 'Conversation' })
    expect(log).toHaveTextContent('1. EcoRI')
    expect(log).toHaveTextContent('2. BamHI')
    fireEvent.click(screen.getByRole('button', { name: '1. EcoRI' }))
    // The answer rides the exported lane-2 helper: "Use <value> for <target>."
    // ANSWER-CHANNEL: plus the structured answer and its request (args 2-3).
    expect(onClarificationPick).toHaveBeenCalledWith(
      'Use EcoRI for sequence.',
      expect.objectContaining({ label: 'EcoRI' }),
      expect.objectContaining({ id: 'clar-1' }),
    )
  })

  it('omits clarification option buttons when the host offers no answer path', () => {
    render(<ChatLog {...props} messages={[
      { ...message('clarify', 'assistant'), content: 'Which enzyme?', clarification: {
        id: 'clar-1', prompt: 'Which enzyme?', entityType: 'sequence',
        options: [{ id: 'opt-1', label: 'EcoRI' }],
      } },
    ]} />)
    expect(screen.getByRole('log', { name: 'Conversation' })).toHaveTextContent('Which enzyme?')
    expect(screen.queryByRole('button', { name: '1. EcoRI' })).toBeNull()
  })
})

/**
 * L2-CHAT-UI-1 LEG A (spec §4) — the universal chat standard:
 * A1 directional bubbles, A2 the scientist-intent shorthand card,
 * A4 clarify-then-compact. These are the task's verified-by cases (1)(2)(3)
 * — written RED before the implementation (A5 discipline).
 */
describe('L2-CHAT-UI-1 LEG A — the universal chat standard', () => {
  it('(1) an assistant turn carrying shorthand renders the intent card with its VERBATIM document body', () => {
    const shorthand = 'intent: place\n  target: bead beating plate\n  slot: 3'
    render(<ChatLog {...props} messages={[
      message('u', 'user', 'Place a bead beating plate on the deck'),
      { ...message('a', 'assistant', 'Drafted the placement.'), shorthand },
    ]} />)
    const card = screen.getByTestId('chat-log-intent-card')
    expect(card).toHaveTextContent('Scientist-intent shorthand')
    // The body carries the document VERBATIM (never parsed, never edited).
    expect(screen.getByTestId('chat-log-intent-card-body').textContent).toBe(shorthand)
    // The card sits INSIDE the assistant row, above the content paragraph.
    expect(card.closest('.chat-log-msg--assistant')).not.toBeNull()
  })

  it('(1) a turn WITHOUT shorthand renders NO intent card (key-absent never renders an empty card)', () => {
    render(<ChatLog {...props} messages={[
      message('u', 'user', 'hello'),
      message('a', 'assistant', 'hi there'),
    ]} />)
    expect(screen.queryByTestId('chat-log-intent-card')).toBeNull()
    expect(screen.queryByTestId('chat-log-intent-card-body')).toBeNull()
  })

  it('(2) user and assistant rows carry DISTINCT directional bubble classes, and system rows are their own class', () => {
    render(<ChatLog {...props} messages={[
      message('u', 'user', 'user words'),
      message('a', 'assistant', 'assistant words'),
      message('s', 'system', 'system words'),
    ]} />)
    const userRow = document.querySelector('.chat-log-msg--user') as HTMLElement
    const assistantRow = document.querySelector('.chat-log-msg--assistant') as HTMLElement
    const systemRow = document.querySelector('.chat-log-msg--system') as HTMLElement
    expect(userRow.className).toContain('chat-log-msg')
    expect(assistantRow.className).toContain('chat-log-msg')
    expect(systemRow.className).toContain('chat-log-msg')
    expect(assistantRow.className).not.toEqual(userRow.className)
    // The accessible author name of each message's author survives the wrap.
    expect(userRow.textContent).toContain('You')
    expect(userRow.textContent).toContain('user words')
    expect(assistantRow.textContent).toContain('Assistant')
    expect(assistantRow.textContent).toContain('assistant words')
  })

  it('(3) an ANSWERED legacy-block clarification (a following user turn) is compacted: BOTH bulky arms GONE from the DOM, one compact row with answer + question', () => {
    const question = 'Which enzyme should cut this?'
    render(<ChatLog {...props} messages={[
      message('u0', 'user', 'Cut the plasmid'),
      { ...message('clar', 'assistant', question), clarification: {
        id: 'clar-1', prompt: question, entityType: 'sequence',
        options: [{ id: 'opt-1', label: 'EcoRI' }, { id: 'opt-2', label: 'BamHI' }],
      } },
      message('answer', 'user', 'Use EcoRI for sequence.'),
      message('after', 'assistant', 'Done with EcoRI.'),
    ]} />)
    // The bulky arm is ABSENT, not hidden — asserts GONE.
    expect(document.querySelector('.chat-log-clarification')).toBeNull()
    expect(document.querySelector('.message-log__clarification-picker')).toBeNull()
    expect(screen.queryByRole('button', { name: '1. EcoRI' })).toBeNull()
    // …and the ONE compact row carries BOTH the answer text and the question.
    const row = screen.getByTestId('chat-log-clarification-answered')
    expect(row).toHaveTextContent('Use EcoRI for sequence.')
    expect(row).toHaveTextContent(question)
  })

  it('(3) an ANSWERED typed-request clarification (the canonical both-fields done shape) is compacted the SAME way (one answered predicate gates BOTH arms)', () => {
    const question = 'The draft names "clofibrate" — choose what it is'
    const request = {
      id: 'req-1', kind: 'material' as const, prompt: question, entityType: 'material' as const,
      menuProvider: '/m' as const, options: [] as { id: string; label: string }[], allowCreateLocal: true,
    }
    render(<ChatLog {...props} onClarificationPick={vi.fn()} messages={[
      message('u0', 'user', 'Draft the formulation'),
      { ...message('clar', 'assistant', question), clarificationRequests: [request],
        clarification: { id: 'req-1', prompt: question, entityType: 'material', menuProvider: '/m', query: 'clofibrate', allowCreateLocal: true, options: [] } },
      message('answer', 'user', 'Use clofibrate for req-1.'),
    ]} />)
    // The typed arm's card (its pinned testid) is gone, the picker is gone,
    // the legacy block is gone — one compact row instead of both arms.
    expect(screen.queryByTestId('chat-log-request-req-1')).toBeNull()
    expect(document.querySelector('.chat-log-clarification')).toBeNull()
    expect(document.querySelector('.message-log__clarification-picker')).toBeNull()
    const row = screen.getByTestId('chat-log-clarification-answered')
    expect(row).toHaveTextContent('Use clofibrate for req-1.')
    expect(row).toHaveTextContent(question)
  })

  it('(3) control: a clarification with NO following user turn keeps its FULL arm (picker/buttons still render)', () => {
    const onClarificationPick = vi.fn()
    render(<ChatLog {...props} onClarificationPick={onClarificationPick} messages={[
      message('u0', 'user', 'Which enzyme should cut this?'),
      { ...message('clar', 'assistant', 'Which enzyme should cut this?'), clarification: {
        id: 'clar-1', prompt: 'Which enzyme should cut this?', entityType: 'sequence',
        options: [{ id: 'opt-1', label: 'EcoRI' }],
      } },
    ]} />)
    expect(screen.queryByTestId('chat-log-clarification-answered')).toBeNull()
    expect(document.querySelector('.chat-log-clarification')).not.toBeNull()
    expect(screen.getByRole('button', { name: '1. EcoRI' })).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '1. EcoRI' }))
    expect(onClarificationPick).toHaveBeenCalledTimes(1)
  })
})

/**
 * L2-CHAT-UI-1 LEG A — browser-gate fix run (BGATE D1/D2/D3).
 *
 * D1/D2 are pure CSS regressions: jsdom cannot lay out, so the discipline is
 * the repo's proven styling-lock pattern (ChangesPanel.styling.test.tsx —
 * read the CSS from disk and pin the rule contents). The ACTUAL geometry is
 * proven at the browser gate (the orchestrator re-gates after merge); these
 * locks pin that the rules that produce it cannot silently vanish.
 * D3 is render-side and fully assertable in jsdom.
 */
describe('L2-CHAT-UI-1 LEG A — browser-gate fix locks (BGATE D1/D2/D3)', () => {
  const cssSource = readFileSync(resolve(process.cwd(), 'src/agent/ChatLog.css'), 'utf8')
  const ruleOf = (selector: string): string => {
    const at = cssSource.indexOf(selector)
    expect(at, `ChatLog.css must define ${selector}`).toBeGreaterThan(-1)
    return cssSource.slice(at, cssSource.indexOf('}', at))
  }

  it('D1: the compact answered row is min-width:0 + max-width:100% inside the flex bubble (the ellipsis can engage; the row cannot grow past the bubble)', () => {
    const rule = ruleOf('.chat-log-clarification-answered {')
    expect(rule).toContain('min-width: 0')
    expect(rule).toContain('max-width: 100%')
    // The A4 ellipsis trio stays declared (pinned by the accepted work).
    expect(rule).toContain('white-space: nowrap')
    expect(rule).toContain('text-overflow: ellipsis')
  })

  it('D2: inside the ChatLog transcript the popover NEVER opens above its field (the above-flip is neutralised — upward overflow of the scrollport is not scroll-recoverable and clipped the first suggestion)', () => {
    const rule = ruleOf('.chat-log-clarification .message-log__clarification-popover--above {')
    expect(rule).toContain('top: calc(100% + 4px)')
    expect(rule).toContain('bottom: auto')
  })

  it('D4 (leg-B fold): the clarification card takes the full bubble width — a shrink-to-fit flex item with no width donor collapsed the picker-only card to 173px in a wide pane (gate re-run receipts 20261029T2255 run2/12-02, run5/11-01)', () => {
    const rule = ruleOf('.chat-log-clarification {')
    expect(rule).toContain('width: 100%')
    // The D1-era min-width:0 stays declared (the card must still shrink-wrap text, not overflow).
    expect(rule).toContain('min-width: 0')
  })

  it('D3: on the done-payload shape (bubble content === request prompt) the prompt prints ONCE — the typed card adds no duplicate paragraph', () => {
    const question = 'The draft names "plate" and the lab spine could not bind it (unknown-noun). Choose what it is, or create a local term.'
    const request = {
      id: 'req-d3', kind: 'labware' as const, prompt: question, entityType: 'labware' as const,
      menuProvider: '/l' as const, query: 'plate', options: [] as { id: string; label: string }[],
    }
    render(<ChatLog {...props} onClarificationPick={vi.fn()} messages={[
      message('u0', 'user', 'Add 50uL of Trypsin to each well.'),
      { ...message('clar', 'assistant', question), clarificationRequests: [request],
        clarification: { id: 'req-d3', prompt: question, entityType: 'labware', menuProvider: '/l', query: 'plate', options: [] } },
    ]} />)
    const bubble = document.querySelector('.chat-log-msg--assistant') as HTMLElement
    // The question is on screen exactly once (the bubble paragraph).
    const paragraphs = [...bubble.querySelectorAll('p')]
    expect(paragraphs.filter((p) => p.textContent === question).length).toBe(1)
    // The answer controls are NOT gated: the card and its picker still render.
    const card = screen.getByTestId('chat-log-request-req-d3')
    expect(card.querySelector('.message-log__clarification-picker')).not.toBeNull()
  })

  it('D3 control: a prompt the bubble does NOT carry still prints on the card (no over-suppression)', () => {
    render(<ChatLog {...props} onClarificationPick={vi.fn()} messages={[
      { ...message('clar', 'assistant', 'Drafting…'), clarificationRequests: [{
        id: 'req-keep', kind: 'general' as const, prompt: 'Which material?', entityType: 'material' as const,
        menuProvider: 'choice' as const,
        options: [{ id: 'o1', label: 'Clofibrate 1 mM' }],
      }] },
    ]} />)
    const card = screen.getByTestId('chat-log-request-req-keep')
    expect(card).toHaveTextContent('Which material?')
    expect(screen.getByRole('button', { name: '1. Clofibrate 1 mM' })).not.toBeNull()
  })

  it('D1 (advc-c3 fix3, ORCH RULING 2): the SINGLE-request arm is DETERMINISTIC across bubble wording — the card prints the prompt in BOTH wordings (seed-independent), and the prompt is on screen exactly once (the bubble drops its verbatim copy when it carries it)', () => {
    // The single-request arm's dedupe was seeded from message.content, so the
    // CARD's prompt paragraph flipped with the bubble's wording: first-ask
    // (bubble = the plain question) the card DEDUPED it (0 card <p>s), the
    // repeat-ask (bubble = the clarification_loop escalation, which does not
    // carry the question) the card PRINTED it (1 card <p>) — the reviewer's
    // probe: prompts = [] on first-ask, [question] on repeat-ask for the
    // IDENTICAL request (9 of 10 gate draws are single-request). The seed no
    // longer reads message.content: the card owns the prompt <p> in BOTH
    // wordings, and the bubble suppresses its verbatim copy (leg 1) so the
    // question is on screen EXACTLY ONCE either way.
    const question = 'The draft names "DMEM" and the lab spine could not bind it (unknown-noun). Choose what it is, or create a local term.'
    const request = {
      id: 'req-d1', kind: 'material' as const, prompt: question, entityType: 'material' as const,
      menuProvider: '/m' as const, query: 'DMEM', options: [] as { id: string; label: string }[],
    }
    const cardPromptCount = () => {
      const card = document.querySelector('[data-testid="chat-log-request-req-d1"]')
      return card ? [...card.querySelectorAll('p')].filter((p) => p.textContent === question).length : -1
    }
    const totalPromptCount = () => {
      const row = document.querySelector('.chat-log-msg--assistant') as HTMLElement
      return [...row.querySelectorAll('p')].filter((p) => p.textContent === question).length
    }
    // advc-c4 D3 (fix run 3): the exact-<p> count scores 0 for a prompt
    // re-printed inside a LONGER paragraph — the substring count over the row
    // text is the backstop (it must agree with the exact count in both arms).
    const totalPromptSubstring = () => {
      const row = document.querySelector('.chat-log-msg--assistant') as HTMLElement
      return (row.textContent ?? '').split(question).length - 1
    }
    // First-ask (the live done shape, useAiChat.ts:1543): the bubble content IS
    // the question. The card OWNS the prompt <p>; the bubble is suppressed (it
    // would double-print).
    render(<ChatLog {...props} onClarificationPick={vi.fn()} messages={[
      message('u0', 'user', 'Add 100 ul of DMEM'),
      { ...message('clar-first', 'assistant', question), clarificationRequests: [request] },
    ]} />)
    const firstCard = cardPromptCount()
    const firstTotal = totalPromptCount()
    expect(firstCard).toBe(1)
    expect(firstTotal).toBe(1)
    expect(totalPromptSubstring()).toBe(1)
    cleanup()
    // Repeat-ask: the bubble is the clarification_loop escalation (the live
    // server text does NOT carry the question sentence). The card still prints
    // the prompt — the SAME card as the first-ask wording (determinism), and
    // the question is still on screen exactly once.
    render(<ChatLog {...props} onClarificationPick={vi.fn()} messages={[
      message('u0', 'user', 'Add 100 ul of DMEM'),
      { ...message('clar-loop', 'assistant', 'clarification_loop: the draft names "DMEM" (reason: unknown-noun), which the lab spine could not bind, and the SAME question has now been asked twice; a third identical card will not help. Answer the card (a pick is applied directly and ends the loop) or name an existing lab term explicitly; nothing was applied.'), clarificationRequests: [request] },
    ]} />)
    const repeatCard = cardPromptCount()
    const repeatTotal = totalPromptCount()
    expect(repeatCard).toBe(1)
    expect(repeatTotal).toBe(1)
    expect(totalPromptSubstring()).toBe(1)
    // D1: the card is identical across the two bubble wordings (no flip).
    expect(repeatCard).toBe(firstCard)
    // The answer controls are never gated by the dedupe.
    expect(document.querySelector('.chat-log-clarification .message-log__clarification-picker')).not.toBeNull()
  })

  // advc-c4 D1 (HIGH, fix run 3, ORCH AMENDMENT 2 §3) — SUPERSEDED by the
  // L2-CLARIFY-TARGET-1 UI-gate fix1 ruling R1.5. The original pin locked the
  // pre-R1.5 behavior for the shape the server emits for a non-domain (quantity)
  // fact — `menuProvider: 'choice'`, `options: []` (shorthandChat.ts:883-887,
  // 903-907 — `volumeUl` is `kind: quantity` with no domain):
  //   renderTypedClarification returned null (no options, no picker, no slot) and
  //   the grouped card offered no answer surface, so the question printed ZERO
  //   times in a card and the BUBBLE was the sole owner (printed exactly once,
  //   row not empty). That "nothing renders" outcome is the defect R1.5 fixes:
  //   "a clarification request whose menu yields zero options must render its
  //   typed-answer input (fall back to the existing typed arm)". The fix adds a
  //   ParameterAnswerInput fallback arm to renderTypedClarification AND extends
  //   the shared requestRendersOwnedPrompt predicate, so the question now prints
  //   EXACTLY ONCE on the typed card (the bubble is suppressed — the D2 one-print
  //   law) and the request is answerable by typing. The invariants the original
  //   pin locked are preserved: the question is on screen exactly once (no
  //   double-print, no zero-print) and the assistant row is not empty. Only the
  //   OWNER of the print moves bubble → card, and a typed input is now rendered.
  it('D1 (advc-c4 fix3, AMENDMENT 2) as re-scoped by TARGET-1 R1.5: the zero-option choice request renders its typed-answer input — the prompt is on screen EXACTLY ONCE (on the card), the assistant row is not empty, and the request is answerable by typing', () => {
    // The EXACT shape the server emits for a non-domain (quantity) fact:
    // menuProvider 'choice' (no readings, no domain), options: [] (no
    // candidates to offer), and the done arm's content === request.prompt
    // (useAiChat.ts:1543). `volumeUl` (kind: quantity, no domain) is the
    // live 1/10 shape the UI-gate report measured with NO answerable surface —
    // R1.5 mandates the typed input, which this pin now asserts.
    const question = 'The draft omits a required value for "volumeUl" (missing-required). What volume should be used?'
    const request = {
      id: 'req-vol', kind: 'general' as const, prompt: question, entityType: 'general' as const,
      menuProvider: 'choice' as const, options: [] as { id: string; label: string }[],
    }
    const onClarificationPick = vi.fn()
    render(<ChatLog {...props} onClarificationPick={onClarificationPick} messages={[
      message('u0', 'user', 'Add DMEM to the plate'),
      { ...message('clar-vol', 'assistant', question), clarificationRequests: [request] },
    ]} />)
    const row = document.querySelector('.chat-log-msg--assistant') as HTMLElement
    const rowText = row.textContent ?? ''
    // R1.5: the request now RENDERS its typed-answer card — a card div is
    // present (pre-R1.5 this assertion was the opposite: toBeNull()).
    const card = document.querySelector('.chat-log-clarification') as HTMLElement
    expect(card).not.toBeNull()
    expect(card.dataset.testid).toBe('chat-log-request-req-vol')
    // R1.5: the card carries an ACTIONABLE typed input (the existing typed arm —
    // ParameterAnswerInput, app/src/event-editor/right-pane/ai/ParameterAnswerInput.tsx)
    // so the scientist can answer by typing. The component exposes a static
    // testid (no requestId suffix): input `parameter-answer-input`, submit
    // `parameter-answer-submit`, scoped by the card's request testid.
    const typedInput = card.querySelector('input[data-testid="parameter-answer-input"]')
    expect(typedInput).not.toBeNull()
    // The input is live (not disabled) and the submit button is on the same card
    // (the row contract: button with the input, not orphaned off-screen). The
    // button starts disabled for an empty field — that is ParameterAnswerInput's
    // own contract, not a rendering defect; typing enables it.
    expect((typedInput as HTMLInputElement).disabled).toBe(false)
    const submitBtn = card.querySelector('[data-testid="parameter-answer-submit"]')
    expect(submitBtn).not.toBeNull()
    // The typed input is INSIDE the card (owned by this request's render), not a
    // stray global control.
    expect(typedInput!.closest('.chat-log-clarification')).toBe(card)
    // The question is on screen EXACTLY ONCE — now on the card's <p> (the bubble
    // is suppressed by the shared render-derived predicate — the D2 one-print law),
    // no double-print (pre-fix regression: count 2) and no zero-print (the
    // pre-R1.5 regression: count 0, empty row).
    const exactParas = Array.from(row.querySelectorAll('p')).filter((p) => p.textContent === question).length
    expect(exactParas).toBe(1)
    // The card owns the print, not the bubble: exactly one <p> equals the
    // question and it lives inside the card.
    const cardParas = Array.from(card.querySelectorAll('p')).filter((p) => p.textContent === question).length
    expect(cardParas).toBe(1)
    // The substring counter (advc-c4 D3): a re-print inside a LONGER
    // paragraph would be invisible to the exact-<p> count — the row text
    // carries the sentence exactly once as well.
    expect(rowText.split(question).length - 1).toBe(1)
    // The assistant row is NOT empty: it carries the question (now on the card).
    expect(rowText).toContain(question)
  })

  // L2-CLARIFY-TARGET-1 (fix1 / R1.5) — the zero-option request's typed input is
  // ACTIONABLE end-to-end: typing a value + submitting rides back through the
  // EXISTING onClarificationPick sink with the canonical wire prompt
  // `Use <value> for <target>.` (clarificationAnswerPrompt — the SAME wire the
  // options/picker arms use; no second answer path, no server change). This is
  // the "answerable by typing" half of R1.5 — the input existing is not enough
  // if the submit is a no-op.
  it('R1.5: the zero-option typed input is actionable — typing + submit rides back through onClarificationPick with the canonical wire', () => {
    const question = 'The draft omits a required value for "volumeUl" (missing-required). What volume should be used?'
    const request = {
      id: 'req-vol', kind: 'general' as const, prompt: question, entityType: 'general' as const,
      menuProvider: 'choice' as const, options: [] as { id: string; label: string }[],
    }
    const onClarificationPick = vi.fn()
    render(<ChatLog {...props} onClarificationPick={onClarificationPick} messages={[
      message('u0', 'user', 'Add DMEM to the plate'),
      { ...message('clar-vol', 'assistant', question), clarificationRequests: [request] },
    ]} />)
    const card = document.querySelector('.chat-log-clarification') as HTMLElement
    const input = card.querySelector('input[data-testid="parameter-answer-input"]') as HTMLInputElement
    const submitBtn = card.querySelector('[data-testid="parameter-answer-submit"]') as HTMLButtonElement
    // Pre-typing the submit is disabled (ParameterAnswerInput's own contract) —
    // the control is present but inert until the scientist types.
    expect(submitBtn.disabled).toBe(true)
    fireEvent.change(input, { target: { value: '50 uL' } })
    expect(submitBtn.disabled).toBe(false)
    fireEvent.click(submitBtn)
    // The typed value rides back through the EXISTING onClarificationPick sink
    // (NOT a new answer path): one call, canonical wire `Use 50 uL for general.`
    // (entityType ?? kind), carrying the request id and the typed value/label.
    expect(onClarificationPick).toHaveBeenCalledTimes(1)
    const [prompt, answer] = onClarificationPick.mock.calls[0]
    expect(prompt).toBe('Use 50 uL for general.')
    expect(answer).toMatchObject({ requestId: 'req-vol', value: '50 uL', label: '50 uL' })
    // The field clears after a successful submit (ParameterAnswerInput's
    // own contract) — the control remains for a follow-up typed answer.
    expect(input.value).toBe('')
  })
})

/**
 * L2-CLARIFY-PICKER-1 (P2, W5) RED — the ANSWERED compact row is a human-facing
 * SENTENCE, never the raw `[[material:…]]` mention markup the picker sends to
 * the agent (the wire prompt `Use [[material:…|…]] for material.` is byte-
 * stable for the AGENT — only the rendering changes). Fallback: strip the
 * mention token to `label (id)`; the plain-text answer stays untouched.
 */
describe('L2-CLARIFY-PICKER-1 (P2) — answered-row sentence (W5 wiki-markup leak)', () => {
  const question = 'The draft names "DMEM" — which record is meant?'
  const materialRequest = {
    id: 'req-dmem', kind: 'material' as const, prompt: question, entityType: 'material' as const,
    menuProvider: '/m' as const, options: [] as { id: string; label: string }[],
  }

  it('a mention-token answer renders as `DMEM (material record MAT-dmem-ykg0)` — NO [[material:]] wiki-markup', () => {
    render(<ChatLog {...props} messages={[
      message('u0', 'user', 'Add 100 ul of DMEM'),
      { ...message('clar', 'assistant', question), clarificationRequests: [materialRequest] },
      message('answer', 'user', 'Use [[material:MAT-dmem-ykg0|DMEM]] for material.'),
      message('after', 'assistant', 'Added 100 ul of DMEM to A1.'),
    ]} />)
    const row = screen.getByTestId('chat-log-clarification-answered')
    expect(row.textContent).not.toMatch(/\[\[material:/)
    expect(row).toHaveTextContent('DMEM (material record MAT-dmem-ykg0)')
    expect(row).toHaveTextContent(question)
  })

  it('the same card for a composition answer keeps the sentence shape (label + record id), still no wiki-markup', () => {
    render(<ChatLog {...props} messages={[
      message('u0', 'user', 'Add 100 ul of DMEM'),
      { ...message('clar', 'assistant', question), clarificationRequests: [materialRequest] },
      message('answer', 'user', 'Use [[material-spec:MSP-DRAFT-EVG_CELLROX-01|DMEM + FBS]] for material.'),
    ]} />)
    const row = screen.getByTestId('chat-log-clarification-answered')
    expect(row.textContent).not.toMatch(/\[\[material/)
    // The mention type is material-spec => kind-word `formulation` (the
    // existing ontology term for the material-spec layer — no new vocabulary).
    expect(row).toHaveTextContent('DMEM + FBS (formulation MSP-DRAFT-EVG_CELLROX-01)')
  })

  it('a plain-text answer (no mention token) is rendered as written (no strip, no markup)', () => {
    render(<ChatLog {...props} messages={[
      message('u0', 'user', 'Add 100 ul of DMEM'),
      { ...message('clar', 'assistant', question), clarificationRequests: [materialRequest] },
      message('answer', 'user', 'Use the DMEM from the stock fridge for material.'),
    ]} />)
    const row = screen.getByTestId('chat-log-clarification-answered')
    expect(row).toHaveTextContent('Use the DMEM from the stock fridge for material.')
    expect(row.textContent).not.toMatch(/\[\[/)
  })

  // advc-c1 DEFECT 4: the raw `[[material:…]]` token was still ON SCREEN in
  // the scientist's OWN turn — the user bubble renders message.content
  // verbatim, so the transcript showed `Use [[material:…|…]] for material.`
  // one bubble above the (now-correct) answered row. The WIRE prompt stays
  // byte-stable (clarificationAnswerPrompt.ts + server/src/ai untouched);
  // the BUBBLE renders the token through the same readable-token helper as
  // the answered row. Assert the WHOLE rendered log (not just the answered
  // row) carries NO raw wiki-markup — the review's `/<p>\[\[material:/`
  // probe must now be empty.
  it('the USER BUBBLE renders the mention token as the readable sentence — NO [[material:]] markup anywhere in the transcript', () => {
    const view = render(<ChatLog {...props} messages={[
      message('u0', 'user', 'Add 100 ul of DMEM'),
      { ...message('clar', 'assistant', question), clarificationRequests: [materialRequest] },
      message('answer', 'user', 'Use [[material:MAT-dmem-ykg0|DMEM]] for material.'),
    ]} />)
    // The user bubble shows the sentence, not the raw token.
    expect(view.baseElement.textContent).toContain('Use DMEM (material record MAT-dmem-ykg0) for material.')
    // NO raw wiki-markup anywhere in the rendered conversation (bubble OR
    // answered row).
    expect(view.baseElement.textContent).not.toMatch(/\[\[material:/)
    // The answered-row sentence too.
    expect(screen.getByTestId('chat-log-clarification-answered')).toHaveTextContent('DMEM (material record MAT-dmem-ykg0)')
  })
})
