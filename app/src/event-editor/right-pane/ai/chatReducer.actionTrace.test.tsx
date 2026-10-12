/**
 * PB-CH-4 — the chatReducer gains the 'action' trace kind (additive, one kind)
 * and MessageLog renders it with the trace icon.
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { chatReducer, initialChatState } from './chatReducer'
import { MessageLog } from './MessageLog'
import type { ChatState, TraceEntry } from './chatReducer'

function stateWith(entries: TraceEntry[]): ChatState {
  return {
    messages: [],
    trace: entries,
    pending: null,
    status: undefined,
  } as unknown as ChatState
}

describe('chatReducer — action trace kind (PB-CH-4)', () => {
  it('stream-trace accepts a kind:"action" entry with evidence and appends it', () => {
    const next = chatReducer(initialChatState, {
      type: 'stream-trace',
      entry: { seq: 0, kind: 'action', evidence: 'Focused on Read plate — nothing was written.' },
    })
    expect(next.trace).toHaveLength(1)
    expect(next.trace[0]?.kind).toBe('action')
    expect(next.trace[0]?.evidence).toBe('Focused on Read plate — nothing was written.')
  })
})

describe('MessageLog — action trace chip (PB-CH-4)', () => {
  it('a kind:"action" trace entry renders with the trace icon and its evidence text', () => {
    const { container } = render(
      <MessageLog state={stateWith([{ seq: 0, kind: 'action', evidence: 'Opened ROS run — nothing was written.' }])} />,
    )
    const chip = container.querySelector('[data-testid="trace-action"]')
    expect(chip).toBeTruthy()
    expect(chip?.textContent).toContain('Opened ROS run — nothing was written.')
    expect(chip?.querySelector('.message-log__trace-icon')).toBeTruthy()
  })
})
