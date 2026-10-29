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
    const box = screen.getByTestId('chat-log-request-req-1')
    expect(box).toHaveTextContent('Which material?')
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
    expect(onClarificationPick).toHaveBeenCalledWith('Use EcoRI for sequence.')
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
