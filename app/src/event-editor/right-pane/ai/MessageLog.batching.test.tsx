import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MessageLog } from './MessageLog'
import type { ChatState } from './chatReducer'
import type { AiClarificationRequest } from '../../../types/ai'

function stateWith(requests: AiClarificationRequest[]): ChatState {
  return {
    messages: [{ id: 'm1', role: 'assistant', text: 'Need info', ts: 1, clarificationRequests: requests }],
    pending: null,
    status: null,
    error: null,
  }
}

afterEach(() => cleanup())

describe('MessageLog clarification summary', () => {
  it('shows a summary line for clarification requests instead of inline cards', () => {
    render(<MessageLog state={stateWith([{ id: 'a', kind: 'material', prompt: 'X', menuProvider: 'choice', options: [] }])} />)
    expect(screen.getByText('1 clarification needed — see Questions panel above.')).toBeTruthy()
  })

  it('pluralizes "clarifications" when there are multiple', () => {
    render(<MessageLog state={stateWith([
      { id: 'a', kind: 'material', prompt: 'X', menuProvider: 'choice', options: [] },
      { id: 'b', kind: 'labware', prompt: 'Y', menuProvider: '/l', options: [] },
    ])} />)
    expect(screen.getByText('2 clarifications needed — see Questions panel above.')).toBeTruthy()
  })

  it('shows no summary when there are no clarification requests', () => {
    render(<MessageLog state={stateWith([])} />)
    expect(screen.queryByText(/clarification.*needed/i)).toBeNull()
  })
})
