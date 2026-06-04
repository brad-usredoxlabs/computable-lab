/**
 * Pure-reducer tests for the workspace chat state machine.
 *
 * Covers each transition the SSE client drives:
 *  - send appends user, starts pending
 *  - stream-delta accumulates pending text
 *  - stream-done promotes pending to a committed assistant message
 *  - stream-done with no deltas falls back to '(no response)'
 *  - stream-error drops pending and stashes the message
 *  - stream-cancelled drops pending without an error
 *  - status only keeps the latest message
 *  - reset clears everything
 */

import { describe, expect, it } from 'vitest'
import {
  chatReducer,
  initialChatState,
  type ChatMessage,
} from './chatReducer'

function userMessage(text: string, ts = 1): ChatMessage {
  return { id: `u-${ts}`, role: 'user', text, ts }
}

describe('chatReducer', () => {
  it('send appends the user message and starts a pending bubble', () => {
    const next = chatReducer(initialChatState, {
      type: 'send',
      userMessage: userMessage('hi'),
      pendingAssistantId: 'a-1',
    })
    expect(next.messages.map((m) => m.text)).toEqual(['hi'])
    expect(next.pending).toEqual({ id: 'a-1', text: '' })
  })

  it('stream-delta accumulates into the pending bubble', () => {
    const state = chatReducer(initialChatState, {
      type: 'send',
      userMessage: userMessage('hi'),
      pendingAssistantId: 'a-1',
    })
    const a = chatReducer(state, { type: 'stream-delta', delta: 'hel' })
    const b = chatReducer(a, { type: 'stream-delta', delta: 'lo' })
    expect(b.pending).toEqual({ id: 'a-1', text: 'hello' })
  })

  it('stream-done promotes pending to a committed assistant message', () => {
    let state = chatReducer(initialChatState, {
      type: 'send',
      userMessage: userMessage('hi'),
      pendingAssistantId: 'a-1',
    })
    state = chatReducer(state, { type: 'stream-delta', delta: 'hello!' })
    state = chatReducer(state, { type: 'stream-done' })
    expect(state.pending).toBeNull()
    expect(state.messages).toHaveLength(2)
    expect(state.messages[1].role).toBe('assistant')
    expect(state.messages[1].text).toBe('hello!')
  })

  it('stream-done with no deltas falls back to (no response)', () => {
    let state = chatReducer(initialChatState, {
      type: 'send',
      userMessage: userMessage('hi'),
      pendingAssistantId: 'a-1',
    })
    state = chatReducer(state, { type: 'stream-done' })
    expect(state.messages[1].text).toBe('(no response)')
  })

  it('stream-error drops the pending bubble and stashes the message', () => {
    let state = chatReducer(initialChatState, {
      type: 'send',
      userMessage: userMessage('hi'),
      pendingAssistantId: 'a-1',
    })
    state = chatReducer(state, { type: 'stream-delta', delta: 'partial' })
    state = chatReducer(state, { type: 'stream-error', message: 'oops' })
    expect(state.pending).toBeNull()
    expect(state.error).toBe('oops')
    // The user's turn stays; only the partial assistant bubble disappears.
    expect(state.messages).toHaveLength(1)
  })

  it('stream-cancelled drops pending without surfacing as an error', () => {
    let state = chatReducer(initialChatState, {
      type: 'send',
      userMessage: userMessage('hi'),
      pendingAssistantId: 'a-1',
    })
    state = chatReducer(state, { type: 'stream-cancelled' })
    expect(state.pending).toBeNull()
    expect(state.error).toBeNull()
  })

  it('status keeps only the latest message', () => {
    let state = chatReducer(initialChatState, {
      type: 'stream-status',
      message: 'first',
    })
    state = chatReducer(state, { type: 'stream-status', message: 'second' })
    expect(state.status).toBe('second')
  })

  it('reset clears everything back to initial', () => {
    let state = chatReducer(initialChatState, {
      type: 'send',
      userMessage: userMessage('hi'),
      pendingAssistantId: 'a-1',
    })
    state = chatReducer(state, { type: 'stream-error', message: 'oops' })
    const reset = chatReducer(state, { type: 'reset' })
    expect(reset).toEqual(initialChatState)
  })
})
