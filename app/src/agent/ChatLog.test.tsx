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
    // BGATE-FIX D3: this message's bubble content IS the prompt, so the
    // question renders ONCE (the bubble paragraph) instead of also inside
    // the card — the whole point of the dedupe. Assert it once on the log.
    expect(screen.getByRole('log', { name: 'Conversation' })).toHaveTextContent('Which material?')
    const box = screen.getByTestId('chat-log-request-req-1')
    expect(box.querySelector('p')).toBeNull()
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
})
