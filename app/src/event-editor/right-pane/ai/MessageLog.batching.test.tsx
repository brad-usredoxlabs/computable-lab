import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MessageLog } from './MessageLog'
import type { ChatState } from './chatReducer'
import type { AiClarificationRequest } from '../../../types/ai'

// Use `choice` requests with pre-baked options so we can click without the
// async slash-menu picker — the batching logic is independent of the picker.
function choiceRequest(id: string, label: string): AiClarificationRequest {
  return {
    id,
    kind: 'general',
    prompt: `Which ${label}?`,
    entityType: 'material',
    menuProvider: 'choice',
    options: [{ id: `${id}-opt`, label }],
  }
}

function stateWith(requests: AiClarificationRequest[]): ChatState {
  return {
    messages: [{ id: 'm1', role: 'assistant', text: 'Need info', ts: 1, clarificationRequests: requests }],
    pending: null,
    status: null,
    error: null,
  }
}

afterEach(() => cleanup())

describe('MessageLog clarification batching', () => {
  it('submits ONCE with all answers only after every card is answered', () => {
    const onSubmit = vi.fn()
    render(<MessageLog state={stateWith([choiceRequest('a', 'DMEM'), choiceRequest('b', 'clofibrate')])} onClarificationsSubmit={onSubmit} />)

    // Answer the first card — no submit yet, progress shows 1 of 2.
    fireEvent.click(screen.getByText('DMEM'))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByTestId('clarification-progress').textContent).toContain('1 of 2')

    // Answer the second — now a single batched submit with both answers.
    fireEvent.click(screen.getByText('clofibrate'))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    const [answers, requests] = onSubmit.mock.calls[0]
    expect(answers.map((a: { requestId: string }) => a.requestId)).toEqual(['a', 'b'])
    expect(requests).toHaveLength(2)
  })

  it('submits immediately for a single card (no behavior change for the common case)', () => {
    const onSubmit = vi.fn()
    render(<MessageLog state={stateWith([choiceRequest('a', 'DMEM')])} onClarificationsSubmit={onSubmit} />)
    fireEvent.click(screen.getByText('DMEM'))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0]).toHaveLength(1)
  })
})
