import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '../types/ai'
import { SequenceChat } from './SequenceChat'

afterEach(cleanup)
const props = { isStreaming: false, prompt: '', onPromptChange: vi.fn(), onSend: vi.fn(), onCancel: vi.fn(), onReview: vi.fn() }
const message = (id: string, role: ChatMessage['role'], content = id): ChatMessage => ({ id, role, content, timestamp: 0 })
function setup() {
  const view = render(<SequenceChat {...props} messages={[]} />)
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
    render(<SequenceChat {...props} onReview={onReview} messages={[message('user','user',request),{...message('proposal','assistant'),sequenceProposal:proposal},message('later','user','An unrelated follow-up')]} />)
    fireEvent.click(screen.getByRole('button',{name:'Review action'}))
    expect(onReview).toHaveBeenCalledWith(proposal,request)
  })
  it('opens hydrated history at the bottom and follows streamed text with the same message ID', () => {
    const { rerender, log, grow } = setup()
    const history = [message('request', 'user'), message('reply', 'assistant', 'First words')]
    rerender(<SequenceChat {...props} messages={history} />)
    expect(log.scrollTop).toBe(log.scrollHeight)
    grow()
    rerender(<SequenceChat {...props} messages={[history[0], { ...history[1], content: 'An expanding streamed reply' }]} />)
    expect(log.scrollTop).toBe(log.scrollHeight)
  })

  it('keeps the reader’s position when scrolled up and returns to live replies on request', () => {
    const { rerender, log, grow } = setup()
    rerender(<SequenceChat {...props} messages={[message('request', 'user')]} />)
    log.scrollTop = 150
    fireEvent.scroll(log)
    grow()
    rerender(<SequenceChat {...props} messages={[message('request', 'user'), message('reply', 'assistant')]} />)
    expect(log.scrollTop).toBe(150)
    fireEvent.click(screen.getByRole('button', { name: 'Latest messages' }))
    expect(log.scrollTop).toBe(log.scrollHeight)
    expect(screen.queryByRole('button', { name: 'Latest messages' })).toBeNull()
  })

  it('returns to the bottom when the user sends a new prompt while reading history', () => {
    const { rerender, log, grow } = setup()
    rerender(<SequenceChat {...props} messages={[message('old-request', 'user')]} />)
    log.scrollTop = 0
    fireEvent.scroll(log)
    grow()
    rerender(<SequenceChat {...props} messages={[message('old-request', 'user'), message('new-request', 'user')]} />)
    expect(log.scrollTop).toBe(log.scrollHeight)
    expect(screen.queryByRole('button', { name: 'Latest messages' })).toBeNull()
  })

  it('keeps following when a pane resize emits a scroll event before layout observation', () => {
    const { rerender, log, shrink } = setup()
    rerender(<SequenceChat {...props} messages={[message('request', 'user')]} />)
    log.scrollTop = log.scrollHeight - log.clientHeight
    shrink()
    fireEvent.scroll(log)
    expect(log.scrollTop).toBe(log.scrollHeight)
    expect(screen.queryByRole('button', { name: 'Latest messages' })).toBeNull()
  })
})
